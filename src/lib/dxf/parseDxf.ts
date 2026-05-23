import DxfParser from 'dxf-parser';
import type { ContourPolyline, ParsedDxf, RawRoadPolyline } from '../types';
import { pickElevation } from './extractElevation';
import { ROAD_LAYER_RE } from '../analysis/roads';
import { collectBoundaryCandidates } from './detectBoundary';

interface DxfVertex {
  x: number;
  y: number;
  z?: number;
}

interface DxfEntity {
  type: string;
  layer?: string;
  vertices?: DxfVertex[];
  elevation?: number;
  shape?: boolean;
  // LINE
  start?: DxfVertex;
  end?: DxfVertex;
  // 3DFACE
  faces?: DxfVertex[];
  // TEXT / MTEXT
  text?: string;
  string?: string;
  position?: DxfVertex;
  startPoint?: DxfVertex;
  insertionPoint?: DxfVertex;
}

// ── ĐÃ GỠ: Toàn bộ logic "đoán Z từ TEXT label" và validation kèm theo. ──
//   Trước đây có 5 hàm helper:
//     parseNumericText, looksLikeRealContourSeries, countPlanningLayers,
//     pt2segDist2, assignElevationFromTextLabels
//   Lý do gỡ: gây fake terrain khi file QH/2D có TEXT chứa số (kích thước,
//   mã lô, số tầng, scale legend…). User quyết: file Z=0 → giữ phẳng.

// Pattern auto-detect tên layer chứa đường đồng mức (Việt + Anh phổ biến)
const DEFAULT_CONTOUR_LAYER_RE =
  /(DM|DC|DG|DONGMUC|DUONG[_-]?DONG[_-]?MUC|CONTOUR|TOPO|ELEV|TERRAIN|HEIGHT|BINHDO)/i;

function buildLayerMatcher(pattern?: string): ((layer?: string) => boolean) | null {
  if (!pattern || !pattern.trim()) return null;
  try {
    const re = new RegExp(pattern, 'i');
    return (layer?: string) => (layer ? re.test(layer) : false);
  } catch {
    return null;
  }
}

export function parseDxfText(text: string, layerPattern?: string): ParsedDxf {
  const parser = new DxfParser();
  const dxf = parser.parseSync(text) as { entities: DxfEntity[] } | null;

  if (!dxf || !dxf.entities) {
    throw new Error('Không đọc được DXF: file rỗng hoặc sai định dạng.');
  }

  const userMatcher = buildLayerMatcher(layerPattern);

  // ── DATA-DRIVEN AUTO-DETECT ─────────────────────────────────────────────
  // Bug cũ: regex name-match chọn nhầm layer "TLM_DongMuc_0" (chỉ 6 contour Z thật)
  // thay vì "Level1" (416 contour Z thật, range 0-1810m) → mất dữ liệu địa hình.
  //
  // Fix: pre-scan tất cả polyline + group theo layer + chọn layer có nhiều Z THẬT
  // nhất (data-driven). Fallback: regex name nếu không có layer nào có Z thật.
  let autoMatcher: ((layer?: string) => boolean) | null = null;
  if (!userMatcher) {
    interface LayerStats { total: number; nonZero: number; minZ: number; maxZ: number; }
    const layerStats = new Map<string, LayerStats>();
    for (const ent of dxf.entities) {
      const t = (ent.type || '').toUpperCase();
      if (t !== 'LWPOLYLINE' && t !== 'POLYLINE') continue;
      if (!ent.layer) continue;
      const allZ = (ent.vertices || []).map(v => v?.z).filter((v): v is number => typeof v === 'number');
      const z = pickElevation(ent.vertices?.[0]?.z, ent.elevation, ent.layer, allZ);
      const s = layerStats.get(ent.layer) || { total: 0, nonZero: 0, minZ: Infinity, maxZ: -Infinity };
      s.total++;
      if (z !== null && Math.abs(z) > 0.001) {
        s.nonZero++;
        if (z < s.minZ) s.minZ = z;
        if (z > s.maxZ) s.maxZ = z;
      }
      layerStats.set(ent.layer, s);
    }

    // Score = nonZero × Z_range. Layer có nhiều polyline Z thật + range Z lớn = contour
    let bestLayer = '';
    let bestScore = 0;
    const candidates: Array<[string, number, number, number]> = [];
    for (const [layer, s] of layerStats) {
      if (s.nonZero < 10) continue;
      const range = s.maxZ - s.minZ;
      if (range < 5) continue; // bỏ layer Z gần như 0
      const score = s.nonZero * range;
      candidates.push([layer, s.nonZero, range, score]);
      if (score > bestScore) { bestScore = score; bestLayer = layer; }
    }

    if (bestLayer) {
      console.log('[parseDxf] Auto-detect contour layers (data-driven):');
      candidates.sort((a, b) => b[3] - a[3]).slice(0, 5).forEach(([l, n, r, s]) =>
        console.log(`  ${l}: ${n} contour Z≠0, range=${r.toFixed(0)}m, score=${s.toFixed(0)}`)
      );
      console.log(`  → Chọn: "${bestLayer}"`);
      autoMatcher = (layer?: string) => layer === bestLayer;
    } else {
      // Fallback: regex name-match (file genuinely flat hoặc không có layer Z thật)
      const layersByName = new Set<string>();
      for (const ent of dxf.entities) {
        if (ent.layer && DEFAULT_CONTOUR_LAYER_RE.test(ent.layer)) layersByName.add(ent.layer);
      }
      if (layersByName.size > 0) {
        console.log(`[parseDxf] Fallback name-match: ${[...layersByName].join(', ')}`);
        autoMatcher = (layer?: string) => (layer ? layersByName.has(layer) : false);
      }
    }
  }
  const layerOk = userMatcher || autoMatcher;

  const contours: ContourPolyline[] = [];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  let minZ = Infinity, maxZ = -Infinity;
  let pointCount = 0;

  // ── Collect layer colours from LAYER table (để gán màu cho road polylines) ─
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const layerColors: Record<string, string> = {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dxfAny = dxf as any;
  if (dxfAny.tables?.layer?.layers) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const [name, info] of Object.entries(dxfAny.tables.layer.layers as Record<string, any>)) {
      if (typeof info.trueColor === 'number' && info.trueColor > 0) {
        layerColors[name] = '#' + (info.trueColor & 0xFFFFFF).toString(16).padStart(6, '0');
      } else {
        const ci = Math.abs(info.color ?? info.colorIndex ?? 0);
        // ACI → hex đơn giản: ánh xạ một số màu phổ biến
        const ACI_SIMPLE: Record<number, string> = {
          1:'#FF0000', 2:'#FFFF00', 3:'#00FF00', 4:'#00FFFF',
          5:'#0000FF', 6:'#FF00FF', 7:'#FFFFFF',
        };
        if (ci > 0) layerColors[name] = ACI_SIMPLE[ci] ?? '#AAAAAA';
      }
    }
  }

  // ── Road polylines raw (DXF 2D) ────────────────────────────────────────────
  const rawRoadMap = new Map<string, { color: string; pts: { x: number; y: number }[][] }>();

  function addRoadPolyline(layer: string, pts: { x: number; y: number }[]) {
    if (pts.length < 2) return;
    if (!rawRoadMap.has(layer)) {
      rawRoadMap.set(layer, { color: layerColors[layer] ?? '#AAAAAA', pts: [] });
    }
    rawRoadMap.get(layer)!.pts.push(pts);
  }

  for (const ent of dxf.entities) {
    const type = (ent.type || '').toUpperCase();

    // Bỏ qua các entity không tạo polyline geometry (gồm cả TEXT/MTEXT —
    // không còn dùng để đoán Z; overlay TEXT vẫn được xử lý ở parseOverlayDxf.ts)
    if (type === 'INSERT' || type === 'ATTDEF' ||
        type === 'DIMENSION' || type === 'HATCH' || type === 'SOLID' ||
        type === 'TEXT' || type === 'MTEXT') continue;

    // ── Road detection — CHỈ chạy nếu layer KHÔNG phải contour layer ──────────
    // Defense-in-depth: kể cả regex ROAD_LAYER_RE có lỡ match nhầm
    // (vd: "DUONG_XXX_DONG_MUC"), entity vẫn được ưu tiên xử lý như contour
    // nếu layer match contour pattern.
    const isContourLayer = ent.layer && DEFAULT_CONTOUR_LAYER_RE.test(ent.layer);
    if (!isContourLayer && ent.layer && ROAD_LAYER_RE.test(ent.layer)) {
      if ((type === 'POLYLINE' || type === 'LWPOLYLINE') && (ent.vertices ?? []).length >= 2) {
        addRoadPolyline(
          ent.layer,
          (ent.vertices ?? [])
            .filter((v: DxfVertex) => typeof v.x === 'number' && typeof v.y === 'number')
            .map((v: DxfVertex) => ({ x: v.x, y: v.y })),
        );
      } else if (type === 'LINE' && ent.start && ent.end) {
        addRoadPolyline(ent.layer, [
          { x: ent.start.x, y: ent.start.y },
          { x: ent.end.x,   y: ent.end.y   },
        ]);
      }
      // Road layer không dùng cho contour → skip phần dưới
      continue;
    }

    // Nếu có layer matcher, chỉ chấp nhận layer match
    if (layerOk && !layerOk(ent.layer)) continue;

    if (type === 'POLYLINE' || type === 'LWPOLYLINE') {
      const verts = ent.vertices ?? [];
      if (verts.length < 2) continue;

      // Cao độ chung — duyệt mọi vertex để tìm Z thật (tránh vertex đầu = 0)
      const allZ = verts.map(v => v?.z).filter((v): v is number => typeof v === 'number');
      const baseZ = pickElevation(verts[0]?.z, ent.elevation, ent.layer, allZ);
      if (baseZ === null) continue;

      const points: { x: number; y: number }[] = [];
      let zSum = 0;
      let zCount = 0;
      for (const v of verts) {
        if (typeof v.x !== 'number' || typeof v.y !== 'number') continue;
        points.push({ x: v.x, y: v.y });
        if (v.x < minX) minX = v.x;
        if (v.y < minY) minY = v.y;
        if (v.x > maxX) maxX = v.x;
        if (v.y > maxY) maxY = v.y;
        const vz = typeof v.z === 'number' ? v.z : baseZ;
        zSum += vz;
        zCount += 1;
      }
      if (points.length < 2) continue;
      const elevation = zCount > 0 ? zSum / zCount : baseZ;

      if (elevation < minZ) minZ = elevation;
      if (elevation > maxZ) maxZ = elevation;

      contours.push({
        elevation,
        points,
        layer: ent.layer,
        closed: ent.shape === true,
      });
      pointCount += points.length;
    } else if (type === 'LINE' && ent.start && ent.end) {
      const z = pickElevation(ent.start.z, ent.elevation, ent.layer);
      if (z === null) continue;
      const pts = [
        { x: ent.start.x, y: ent.start.y },
        { x: ent.end.x, y: ent.end.y },
      ];
      for (const p of pts) {
        if (p.x < minX) minX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.x > maxX) maxX = p.x;
        if (p.y > maxY) maxY = p.y;
      }
      if (z < minZ) minZ = z;
      if (z > maxZ) maxZ = z;
      contours.push({ elevation: z, points: pts, layer: ent.layer });
      pointCount += 2;
    }
  }

  if (!Number.isFinite(minX) || pointCount === 0) {
    throw new Error('Không tìm thấy đường đồng mức có cao độ trong DXF. Kiểm tra layer/Z.');
  }

  // ❌ KHÔNG tự ý sửa cao độ MSL — giữ ĐÚNG Z từ CAD.
  // Nếu Z file là relative (0-360m thay vì 1380-1420m), user dùng "Cao độ gốc (MSL)"
  // để dịch hiển thị, KHÔNG đổi dữ liệu gốc.

  // ── Bước 1: Tách contour Z=0 vs Z thật (Mixed Z) ──────────────────────────
  const zeroCount = contours.filter(c => Math.abs(c.elevation) < 0.001).length;
  const nonZeroElevs = contours
    .filter(c => Math.abs(c.elevation) >= 0.001)
    .map(c => c.elevation)
    .sort((a, b) => a - b);
  if (zeroCount > 0 && nonZeroElevs.length >= 10) {
    const medianNonZero = nonZeroElevs[Math.floor(nonZeroElevs.length / 2)];
    if (Math.abs(medianNonZero) > 50) {
      const realContours = contours.filter(c => Math.abs(c.elevation) >= 0.001);
      console.log(`[parseDxf] Mixed Z (median non-zero=${medianNonZero.toFixed(0)}m > 50): bỏ ${zeroCount} contour Z=0 (draft), giữ ${nonZeroElevs.length} có Z thật`);
      contours.length = 0;
      for (const c of realContours) contours.push(c);
      minZ = Infinity; maxZ = -Infinity;
      for (const c of contours) {
        if (c.elevation < minZ) minZ = c.elevation;
        if (c.elevation > maxZ) maxZ = c.elevation;
      }
    } else {
      console.log(`[parseDxf] Mixed Z (median=${medianNonZero.toFixed(1)}m ≤ 50): GIỮ ${zeroCount} contour Z=0 (có thể hợp lệ)`);
    }
  }

  // ── Bước 2: Cluster outlier removal — phát hiện GAP lớn trong phân phối Z ─
  // Bug case: file Hồ Tuyền Lâm có 391 contour Z=1200-1900m + 25 contour Z=70m
  // → Delaunay nối 2 cluster qua vùng trống → vách núi giả từ 70→1900m
  //
  // Fix: sort Z, tìm GAP lớn nhất. Nếu gap > 100m → bimodal data, chỉ giữ cluster
  // chứa median (cluster terrain chính), bỏ cluster rời (outlier).
  if (contours.length >= 20) {
    const sortedZ = contours.map(c => c.elevation).sort((a, b) => a - b);
    const med = sortedZ[Math.floor(sortedZ.length / 2)];
    let largestGap = 0, gapIdx = -1;
    for (let i = 1; i < sortedZ.length; i++) {
      const gap = sortedZ[i] - sortedZ[i - 1];
      if (gap > largestGap) { largestGap = gap; gapIdx = i; }
    }
    // Gap đủ lớn (> 100m hoặc > 30% range) → có cluster outlier
    const range = sortedZ[sortedZ.length - 1] - sortedZ[0];
    if (largestGap > 100 && largestGap > range * 0.3 && gapIdx > 0) {
      const lowMax = sortedZ[gapIdx - 1];
      const highMin = sortedZ[gapIdx];
      const keepHigh = med >= highMin;
      const beforeCount = contours.length;
      const kept = keepHigh
        ? contours.filter(c => c.elevation >= highMin)
        : contours.filter(c => c.elevation <= lowMax);
      console.log(
        `[parseDxf] Cluster gap=${largestGap.toFixed(0)}m tại Z=${lowMax.toFixed(1)}↔${highMin.toFixed(1)}: ` +
        `giữ cluster ${keepHigh ? 'CAO' : 'THẤP'} (${kept.length}/${beforeCount} contour)`
      );
      contours.length = 0;
      for (const c of kept) contours.push(c);
      minZ = Infinity; maxZ = -Infinity;
      for (const c of contours) {
        if (c.elevation < minZ) minZ = c.elevation;
        if (c.elevation > maxZ) maxZ = c.elevation;
      }
    }
  }

  // ── File có Z=0 (vd file QH 1/500) → render mặt phẳng, KHÔNG báo lỗi ────
  // Parser KHÔNG còn đoán Z từ TEXT label/layer name → file Z=0 luôn → flat terrain.
  if (Math.abs(maxZ - minZ) < 0.5) {
    console.warn(
      '[parseDxf] ⓘ File không có cao độ Z thật trong polyline/vertex — ' +
      'render địa hình PHẲNG (Z=0). Bản vẽ 2D sẽ drape lên mặt phẳng.\n' +
      '  Nếu cần địa hình 3D: file CAD phải có Z trong POLYLINE3D vertex, ' +
      'hoặc entity elevation attribute.'
    );
    // Ép range tối thiểu để rasterizer hoạt động bình thường; mọi cell sẽ ~0
    minZ = -0.01;
    maxZ = 0.01;
  }

  // ── BƯỚC LỌC OUTLIER (2 lớp) ────────────────────────────────────────────
  // Lớp 1: IQR ×4 (lọc outlier xa)
  // Lớp 2: P5-P95 percentile (lọc outlier "đậm" — vd file LLE có 1 contour Z=500
  //         trong bulk Z=1-5 mà IQR không catch được do data bimodal)
  const elevations = contours.map((c) => c.elevation).sort((a, b) => a - b);
  const q1 = elevations[Math.floor(elevations.length * 0.25)];
  const q3 = elevations[Math.floor(elevations.length * 0.75)];
  const iqr = q3 - q1;
  let filtered: ContourPolyline[];
  if (iqr > 1) {
    const zLo = q1 - iqr * 4;
    const zHi = q3 + iqr * 4;
    filtered = contours.filter((c) => c.elevation >= zLo && c.elevation <= zHi);
    if (filtered.length < contours.length) {
      console.log(`[parseDxf] IQR filter: bỏ ${contours.length - filtered.length}/${contours.length} contour (Z<${zLo.toFixed(1)} hoặc Z>${zHi.toFixed(1)})`);
    }
  } else {
    console.log(`[parseDxf] IQR=${iqr.toFixed(2)} quá nhỏ — skip IQR filter`);
    filtered = contours;
  }

  // ── LỚP 2: percentile filter P5-P95 ──
  // Trigger khi: range tổng > 50m AND P5-P95 < 30% of range → có outlier
  if (filtered.length >= 10) {
    const sorted2 = filtered.map(c => c.elevation).sort((a, b) => a - b);
    const p5  = sorted2[Math.floor(sorted2.length * 0.05)];
    const p95 = sorted2[Math.floor(sorted2.length * 0.95)];
    const totalRange = sorted2[sorted2.length - 1] - sorted2[0];
    const p5p95Range = p95 - p5;
    if (totalRange > 50 && p5p95Range > 0 && p5p95Range < totalRange * 0.3) {
      const buffer = Math.max(p5p95Range * 0.5, 5);
      const lo = p5 - buffer;
      const hi = p95 + buffer;
      const before = filtered.length;
      filtered = filtered.filter(c => c.elevation >= lo && c.elevation <= hi);
      const dropped = before - filtered.length;
      if (dropped > 0) {
        console.warn(
          `[parseDxf] P5-P95 outlier filter: bỏ ${dropped}/${before} contour. ` +
          `90% data trong ${p5.toFixed(1)}–${p95.toFixed(1)}m, ` +
          `range tổng ${totalRange.toFixed(0)}m → giữ ${lo.toFixed(1)}–${hi.toFixed(1)}m.`
        );
      }
    }
  }

  // ── LỚP 3: MAD (Median Absolute Deviation) — bắt outlier rải đều ──
  // P5-P95 fail khi outlier "rải đều" như 1, 5, 10, 50, 100, 500 (Z evenly spread).
  // MAD: median + 1.4826 × MAD × k. Threshold k=4 chấp nhận 99.99% với normal,
  // outlier vượt ngưỡng → bỏ.
  // Áp dụng khi: file có ít contour (<50) AND range > 30m (gradient nghi vấn)
  if (filtered.length >= 5) {
    const zs = filtered.map(c => c.elevation).sort((a, b) => a - b);
    const median = zs[Math.floor(zs.length / 2)];
    const range3 = zs[zs.length - 1] - zs[0];

    if (filtered.length < 50 && range3 > 30) {
      const deviations = zs.map(z => Math.abs(z - median)).sort((a, b) => a - b);
      const mad = deviations[Math.floor(deviations.length / 2)];
      // MAD = 0 nếu > nửa data trùng — skip filter (data thực sự phẳng)
      if (mad > 0.01) {
        const k = 4;
        const threshold = 1.4826 * mad * k;
        const before = filtered.length;
        filtered = filtered.filter(c => Math.abs(c.elevation - median) <= threshold);
        const dropped = before - filtered.length;
        if (dropped > 0) {
          console.warn(
            `[parseDxf] MAD outlier filter: bỏ ${dropped}/${before} contour ` +
            `(median=${median.toFixed(1)}m, MAD=${mad.toFixed(2)}m, threshold=±${threshold.toFixed(1)}m). ` +
            `Các Z bị bỏ: ${zs.filter(z => Math.abs(z - median) > threshold).slice(0, 10).map(z => z.toFixed(1)).join(', ')}`
          );
        }
      }
    }
  }

  // ── LỚP 3: ratio range/bbox-diag sanity check ──
  // Nếu range Z > 50% bbox diagonal → khả năng cao do outlier sót lại
  // → emit warning (không filter — đã filter 2 lớp rồi) để user biết
  if (filtered.length >= 5) {
    let fxMin = Infinity, fxMax = -Infinity, fyMin = Infinity, fyMax = -Infinity;
    let fzMin = Infinity, fzMax = -Infinity;
    for (const c of filtered) {
      if (c.elevation < fzMin) fzMin = c.elevation;
      if (c.elevation > fzMax) fzMax = c.elevation;
      for (const p of c.points) {
        if (p.x < fxMin) fxMin = p.x;
        if (p.y < fyMin) fyMin = p.y;
        if (p.x > fxMax) fxMax = p.x;
        if (p.y > fyMax) fyMax = p.y;
      }
    }
    const diag = Math.hypot(fxMax - fxMin, fyMax - fyMin);
    const zRange = fzMax - fzMin;
    if (diag > 0 && zRange / diag > 0.5 && zRange > 30) {
      console.warn(
        `[parseDxf] ⚠ Range Z (${zRange.toFixed(0)}m) > 50% bbox diagonal (${diag.toFixed(0)}m). ` +
        `Có thể terrain vẫn có outlier Z hoặc file mặt cắt (section). Kiểm tra DXF.`
      );
    }
  }

  // Cập nhật lại bounds Z sau khi lọc
  let realMinZ = Infinity, realMaxZ = -Infinity;
  let realMinX = Infinity, realMinY = Infinity, realMaxX = -Infinity, realMaxY = -Infinity;
  let realCount = 0;
  for (const c of filtered) {
    if (c.elevation < realMinZ) realMinZ = c.elevation;
    if (c.elevation > realMaxZ) realMaxZ = c.elevation;
    for (const p of c.points) {
      if (p.x < realMinX) realMinX = p.x;
      if (p.y < realMinY) realMinY = p.y;
      if (p.x > realMaxX) realMaxX = p.x;
      if (p.y > realMaxY) realMaxY = p.y;
    }
    realCount += c.points.length;
  }

  if (filtered.length === 0) {
    throw new Error('Không tìm thấy đường đồng mức hợp lệ sau khi lọc. Kiểm tra layer/Z trong DXF.');
  }

  // ── Build rawRoads từ rawRoadMap ─────────────────────────────────────────
  const rawRoads: RawRoadPolyline[] = [];
  for (const [layer, { color, pts }] of rawRoadMap.entries()) {
    for (const points of pts) {
      rawRoads.push({ layer, color, points });
    }
  }

  // ── Thu thập boundary candidates (KHÔNG auto-pick) ───────────────────────
  // User sẽ chọn manual qua dropdown trong UI. Đợt trước auto-pick gây clip
  // nhầm thành dải hẹp → cần để user kiểm soát.
  const boundaryCandidates = collectBoundaryCandidates(dxf.entities, {
    minX: realMinX, minY: realMinY, maxX: realMaxX, maxY: realMaxY,
  });

  return {
    contours: filtered,
    bounds: { minX: realMinX, minY: realMinY, maxX: realMaxX, maxY: realMaxY, minZ: realMinZ, maxZ: realMaxZ },
    pointCount: realCount,
    rawRoads: rawRoads.length > 0 ? rawRoads : undefined,
    boundaryCandidates: boundaryCandidates.length > 0 ? boundaryCandidates : undefined,
  };
}
