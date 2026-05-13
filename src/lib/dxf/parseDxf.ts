import DxfParser from 'dxf-parser';
import type { ContourPolyline, ParsedDxf, RawRoadPolyline } from '../types';
import { pickElevation } from './extractElevation';
import { ROAD_LAYER_RE } from '../analysis/roads';

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

/** Thử parse giá trị số từ text CAD (loại bỏ ký tự thừa, dấu phẩy → dấu chấm) */
function parseNumericText(raw: string): number | null {
  if (!raw) return null;
  // Loại bỏ ký tự AutoCAD MTEXT formatting: \\P, {}, \pxi...
  const clean = raw.replace(/\\[A-Za-z][^;]*;|[{}\\]|\\P/g, '').trim();
  // Chấp nhận format "50.000", "50,000", "-5.5", "50" etc.
  const m = clean.match(/^(-?\d+(?:[.,]\d+)?)$/);
  if (!m) return null;
  const v = parseFloat(m[1].replace(',', '.'));
  return Number.isFinite(v) ? v : null;
}

/** Point-to-segment squared distance (2D) */
function pt2segDist2(px: number, py: number,
                     ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-12) return (px - ax) ** 2 + (py - ay) ** 2;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  return (px - ax - t * dx) ** 2 + (py - ay - t * dy) ** 2;
}

/**
 * Khi tất cả contour đều có Z=0 (file CAD chưa gán cao độ),
 * cố gắng đọc nhãn TEXT gần mỗi polyline để gán đúng elevation.
 * Trả về contours đã được cập nhật Z (hoặc giữ nguyên nếu không tìm được).
 */
function assignElevationFromTextLabels(
  contours: ContourPolyline[],
  textLabels: { x: number; y: number; value: number }[],
  terrainDiag: number, // đường chéo terrain (m) — dùng làm tham chiếu khoảng cách
): ContourPolyline[] {
  if (textLabels.length === 0) return contours;

  // Ngưỡng: text phải nằm trong 8% đường chéo terrain so với contour gần nhất
  // (rộng hơn 5% trước đây để bắt nhãn TEXT đặt xa đường đồng mức)
  const maxDist2 = (terrainDiag * 0.08) ** 2;

  return contours.map((c) => {
    let bestDist2 = Infinity;
    let bestVal: number | null = null;

    for (const lbl of textLabels) {
      // Tìm khoảng cách gần nhất từ text đến bất kỳ đoạn nào của polyline
      for (let i = 0; i < c.points.length - 1; i++) {
        const d2 = pt2segDist2(
          lbl.x, lbl.y,
          c.points[i].x, c.points[i].y,
          c.points[i + 1].x, c.points[i + 1].y,
        );
        if (d2 < bestDist2) { bestDist2 = d2; bestVal = lbl.value; }
      }
      // Đơn điểm (polyline 1 điểm)
      if (c.points.length === 1) {
        const d2 = (lbl.x - c.points[0].x) ** 2 + (lbl.y - c.points[0].y) ** 2;
        if (d2 < bestDist2) { bestDist2 = d2; bestVal = lbl.value; }
      }
    }

    if (bestVal !== null && bestDist2 <= maxDist2) {
      return { ...c, elevation: bestVal };
    }
    return c;
  });
}

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
      const z = pickElevation(ent.vertices?.[0]?.z, ent.elevation, ent.layer);
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
  /** TEXT / MTEXT entities có giá trị số — dùng để gán Z cho contour Z=0 */
  const textLabels: { x: number; y: number; value: number }[] = [];
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

    // ── Thu thập nhãn TEXT / MTEXT có giá trị số (cao độ) ──────────────────────
    if (type === 'TEXT' || type === 'MTEXT') {
      const raw = ent.text ?? ent.string ?? '';
      const val = parseNumericText(raw);
      if (val !== null) {
        // Lấy vị trí insert của TEXT entity
        const pos = ent.position ?? ent.startPoint ?? ent.insertionPoint;
        if (pos && typeof pos.x === 'number' && typeof pos.y === 'number') {
          textLabels.push({ x: pos.x, y: pos.y, value: val });
        }
      }
      continue; // TEXT không dùng để tạo contour
    }

    // Bỏ qua các entity không tạo polyline geometry
    if (type === 'INSERT' || type === 'ATTDEF' ||
        type === 'DIMENSION' || type === 'HATCH' || type === 'SOLID') continue;

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

      // Cao độ chung
      const baseZ = pickElevation(verts[0]?.z, ent.elevation, ent.layer);
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

  // ── Tái tạo Z từ nhãn TEXT khi terrain gần như phẳng (Z biến thiên < 5m) ─
  // Trigger mở rộng từ <1m → <5m để bắt được file có vài contour Z=2 do noise
  // nhưng cơ bản vẫn flat (chưa có cao độ thật).
  if (Math.abs(maxZ - minZ) < 5 && textLabels.length > 0) {
    const diag = Math.hypot(maxX - minX, maxY - minY);
    const updatedContours = assignElevationFromTextLabels(contours, textLabels, diag);

    let newMinZ = Infinity, newMaxZ = -Infinity;
    for (const c of updatedContours) {
      if (c.elevation < newMinZ) newMinZ = c.elevation;
      if (c.elevation > newMaxZ) newMaxZ = c.elevation;
    }
    if (newMaxZ > newMinZ + 0.5) {
      contours.length = 0;
      for (const c of updatedContours) contours.push(c);
      minZ = newMinZ;
      maxZ = newMaxZ;
      console.log(`[parseDxf] Tái tạo Z từ ${textLabels.length} nhãn TEXT: ${newMinZ.toFixed(1)} – ${newMaxZ.toFixed(1)} m`);
    }
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

  // ── Nếu sau tái tạo Z vẫn phẳng (< 0.5m) → throw error rõ ràng ──────────
  // Không có Z trong file + không có TEXT match được → không thể tạo địa hình 3D
  if (Math.abs(maxZ - minZ) < 0.5) {
    throw new Error(
      'File DXF không có cao độ Z và không tìm thấy nhãn TEXT đủ gần đường đồng mức để tái tạo.\n\n' +
      'Giải pháp:\n' +
      '  1. Kiểm tra file CAD có đường đồng mức 3D (POLYLINE3D) hoặc thuộc tính Elevation\n' +
      '  2. Hoặc đảm bảo có nhãn TEXT cao độ (vd: "1411.3") đặt cạnh các đường đồng mức\n' +
      '  3. Hoặc convert sang DXF từ AutoCAD: File → Save As → DXF (R2018) để bảo toàn Z'
    );
  }

  // Lọc outlier Z bằng IQR — loại bỏ các contour có cao độ bất thường
  // (thường do text/block/annotation bị đọc nhầm thành contour, ví dụ Z=9999, Z=-100)
  // CHỈ chạy khi IQR đủ lớn — nếu iqr quá nhỏ, skip để tránh filter sai (bug iqr=0)
  const elevations = contours.map((c) => c.elevation).sort((a, b) => a - b);
  const q1 = elevations[Math.floor(elevations.length * 0.25)];
  const q3 = elevations[Math.floor(elevations.length * 0.75)];
  const iqr = q3 - q1;
  let filtered: ContourPolyline[];
  if (iqr > 1) {
    // IQR đủ rõ → filter outlier bằng ×4 IQR
    const zLo = q1 - iqr * 4;
    const zHi = q3 + iqr * 4;
    filtered = contours.filter((c) => c.elevation >= zLo && c.elevation <= zHi);
    if (filtered.length < contours.length) {
      console.log(`[parseDxf] IQR filter: bỏ ${contours.length - filtered.length}/${contours.length} contour (Z<${zLo.toFixed(1)} hoặc Z>${zHi.toFixed(1)})`);
    }
  } else {
    // IQR quá nhỏ (data clustered) → skip filter, giữ toàn bộ
    console.log(`[parseDxf] IQR=${iqr.toFixed(2)} quá nhỏ — skip filter, giữ toàn bộ ${contours.length} contour`);
    filtered = contours;
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

  return {
    contours: filtered,
    bounds: { minX: realMinX, minY: realMinY, maxX: realMaxX, maxY: realMaxY, minZ: realMinZ, maxZ: realMaxZ },
    pointCount: realCount,
    rawRoads: rawRoads.length > 0 ? rawRoads : undefined,
  };
}
