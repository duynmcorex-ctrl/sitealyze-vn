/**
 * parseDwg.ts
 * Đọc file DWG (AutoCAD) và trả về cùng format ParsedDxf như parseDxf.ts.
 * Dùng thư viện @mlightcad/libredwg-web (WASM port của LibreDWG).
 *
 * API đúng (v0.6+):
 *   1. lib.dwg_read_data(buffer, DWG) → Dwg_Data_Ptr (raw pointer, dạng number)
 *   2. lib.convert(ptr) → DwgDatabase  (typed JS object, có .entities[])
 *   3. lib.dwg_free(ptr)               (giải phóng WASM memory sau convert)
 *
 * Chiến lược tái tạo Z (theo thứ tự ưu tiên):
 *   1. Z sẵn có trên entity (.elevation / vertex.z) — lý tưởng
 *   2. Tên layer chứa số cao độ (VD: "DM0950", "DC_1050") — phổ biến bản đồ BĐHVN
 *   3. Nhãn TEXT/MTEXT gần đường đồng mức — fallback
 */
import type { ParsedDxf, ContourPolyline, RawRoadPolyline } from '../types';
import { ROAD_LAYER_RE } from '../analysis/roads';

// ── Layer pattern auto-detect ────────────────────────────────────────────────
const DEFAULT_CONTOUR_LAYER_RE =
  /(DM|DC|DG|DONGMUC|DUONG[_-]?DONG[_-]?MUC|CONTOUR|TOPO|ELEV|TERRAIN|HEIGHT|BINHDO)/i;

// ── Lazy load LibreDWG WASM ──────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _libPromise: Promise<any> | null = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getLib(): Promise<any> {
  if (!_libPromise) {
    _libPromise = import('@mlightcad/libredwg-web').then((mod) => mod.LibreDwg.create(''));
  }
  return _libPromise;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Thử đọc nội dung text từ entity TEXT/MTEXT — thử tất cả field name có thể có */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getEntityText(ent: any): string {
  // LibreDWG có thể dùng bất kỳ field name nào tuỳ version
  const v =
    ent.text ??
    ent.textString ??
    ent.defaultValue ??
    ent.string ??
    ent.value ??
    ent.contents ??        // MTEXT
    ent.textValue ??
    ent.label ??
    '';
  return typeof v === 'string' ? v : String(v ?? '');
}

/** Thử đọc vị trí insert từ entity TEXT/MTEXT */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getEntityPos(ent: any): { x: number; y: number } | null {
  const pos =
    ent.insertionPoint ??
    ent.position ??
    ent.point ??
    ent.startPoint ??
    ent.basePoint ??
    ent.insertPoint ??
    ent.origin ??
    null;
  if (pos && typeof pos.x === 'number' && typeof pos.y === 'number') return pos;
  return null;
}

/** Parse giá trị số từ text CAD — chấp nhận: "950", "950.000", "950,000", "-5.5" */
function parseNumericText(raw: string): number | null {
  if (!raw) return null;
  // Loại bỏ AutoCAD MTEXT formatting codes
  const clean = raw
    .replace(/\\[A-Za-z][^;]*;/g, '')  // \Wn; \Hn; \Cn; etc.
    .replace(/[{}\\]/g, '')
    .replace(/\\P/gi, '')
    .trim();
  if (!clean) return null;
  // Match số nguyên hoặc thập phân
  const m = clean.match(/^(-?\d+(?:[.,]\d+)?)$/);
  if (!m) return null;
  const v = parseFloat(m[1].replace(',', '.'));
  return Number.isFinite(v) ? v : null;
}

/** Khoảng cách bình phương từ điểm (px,py) đến đoạn thẳng (ax,ay)-(bx,by) */
function pt2seg2(px: number, py: number,
                 ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-12) return (px - ax) ** 2 + (py - ay) ** 2;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  return (px - ax - t * dx) ** 2 + (py - ay - t * dy) ** 2;
}

/**
 * CHIẾN LƯỢC 1: Trích xuất cao độ từ TÊN LAYER.
 * Bản đồ địa hình VN thường đặt tên layer kiểu:
 *   "DM0950", "DM_0950", "DC950", "DC_1050", "DONGMUC_900", "CONTOUR-1050"
 * → Lấy chuỗi số cuối cùng dài 3–5 chữ số.
 *
 * Trả về null nếu không tìm thấy hoặc số không hợp lý.
 */
function extractElevFromLayerName(layer: string): number | null {
  if (!layer) return null;
  // Tìm số 3-5 chữ số ở cuối tên layer (bỏ qua số quá ngắn như "01", "02"...)
  // Ưu tiên số sau ký tự phân tách [-_ ] hoặc ở cuối string
  const patterns = [
    /[-_ ](\d{3,5}(?:[.,]\d+)?)(?:[-_ ]|$)/,  // DM_0950, DC-1050
    /(\d{3,5}(?:[.,]\d+)?)$/,                   // DM0950, CONTOUR1050
    /[-_ ](\d{3,5}(?:[.,]\d+)?)/,              // _950_ (giữa tên)
  ];
  for (const re of patterns) {
    const m = layer.match(re);
    if (m) {
      const v = parseFloat(m[1].replace(',', '.'));
      if (Number.isFinite(v) && v >= 0 && v <= 9000) return v;
    }
  }
  return null;
}

/**
 * CHIẾN LƯỢC 2: Gán cao độ từ nhãn TEXT gần nhất.
 * maxDist2 = (diag * threshold)^2 — threshold = 0.12 (12% đường chéo terrain).
 */
function assignElevFromTextLabels(
  contours: ContourPolyline[],
  labels: { x: number; y: number; value: number }[],
  diag: number,
): ContourPolyline[] {
  if (labels.length === 0) return contours;
  // Dùng threshold 12% (rộng hơn 5% trước đây) để bắt được label đặt xa hơn
  const maxDist2 = (diag * 0.12) ** 2;
  return contours.map((c) => {
    let bestDist2 = Infinity;
    let bestVal: number | null = null;
    for (const lbl of labels) {
      // Với polyline ngắn (< 2 điểm): dùng khoảng cách điểm
      if (c.points.length < 2) {
        const d2 = (lbl.x - (c.points[0]?.x ?? 0)) ** 2
                 + (lbl.y - (c.points[0]?.y ?? 0)) ** 2;
        if (d2 < bestDist2) { bestDist2 = d2; bestVal = lbl.value; }
        continue;
      }
      // Với polyline nhiều điểm: kiểm tra từng đoạn
      for (let i = 0; i < c.points.length - 1; i++) {
        const d2 = pt2seg2(
          lbl.x, lbl.y,
          c.points[i].x, c.points[i].y,
          c.points[i + 1].x, c.points[i + 1].y,
        );
        if (d2 < bestDist2) { bestDist2 = d2; bestVal = lbl.value; }
      }
    }
    if (bestVal !== null && bestDist2 <= maxDist2) return { ...c, elevation: bestVal };
    return c;
  });
}

// ── Main parser ──────────────────────────────────────────────────────────────

export async function parseDwgBuffer(
  buffer: ArrayBuffer,
  layerPattern?: string,
): Promise<ParsedDxf> {
  const lib = await getLib();
  const { Dwg_File_Type } = await import('@mlightcad/libredwg-web');

  // ── Bước 1: đọc binary → con trỏ WASM ────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let dwgPtr: any;
  try {
    dwgPtr = lib.dwg_read_data(buffer, Dwg_File_Type.DWG);
  } catch (e) {
    throw new Error(`Không thể đọc file DWG: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (!dwgPtr) {
    throw new Error('File DWG không hợp lệ hoặc phiên bản không hỗ trợ (cần R13 trở lên).');
  }

  // ── Bước 2: convert → DwgDatabase ────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let db: any;
  try {
    db = lib.convert(dwgPtr);
  } catch (e) {
    lib.dwg_free?.(dwgPtr);
    throw new Error(`Lỗi chuyển đổi DWG: ${e instanceof Error ? e.message : String(e)}`);
  }
  try { lib.dwg_free?.(dwgPtr); } catch { /* bỏ qua */ }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const entities: any[] = db.entities ?? [];

  // ── DEBUG: dump cấu trúc entities để giúp chẩn đoán (KHÔNG dùng group/nesting) ─
  const _debugDump = () => {
    console.log('=== [parseDwg] DEBUG DUMP ===');
    // Unique entity types
    const types = [...new Set(entities.map((e: any) => e?.type))].sort();
    console.log('[parseDwg] Unique entity types:', types.join(' | '));
    // Unique layers
    const layers = [...new Set(entities.map((e: any) => e?.layer))].filter(Boolean).sort();
    console.log('[parseDwg] Unique layers:', layers.join(' | '));
    // First LWPOLYLINE/POLYLINE2D entity — dump ALL keys để xem LibreDWG version
    const firstPoly = entities.find((e: any) =>
      e?.type === 'LWPOLYLINE' || e?.type === 'POLYLINE2D' || e?.type === 'POLYLINE3D'
    );
    if (firstPoly) {
      console.log('[parseDwg] First polyline entity keys:', Object.keys(firstPoly).join(', '));
      console.log('[parseDwg] First polyline data:', JSON.stringify(firstPoly).slice(0, 500));
      // Kiểm tra từng vertex
      const v0 = (firstPoly.vertices ?? [])[0];
      if (v0) console.log('[parseDwg] First vertex keys:', Object.keys(v0).join(', '), '→', JSON.stringify(v0));
    }
    console.log('=== [parseDwg] END DUMP ===');
  };

  // ── Bước 3: xác định layer filter ────────────────────────────────────────
  const userRe = layerPattern
    ? (() => { try { return new RegExp(layerPattern, 'i'); } catch { return null; } })()
    : null;

  let autoRe: RegExp | null = null;
  if (!userRe) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const hasContourLayer = entities.some((e: any) => e?.layer && DEFAULT_CONTOUR_LAYER_RE.test(e.layer));
    if (hasContourLayer) autoRe = DEFAULT_CONTOUR_LAYER_RE;
  }
  const layerOk = userRe ?? autoRe;

  // ── Bước 4: thu thập entities ─────────────────────────────────────────────
  const contours: ContourPolyline[] = [];
  const textLabels: { x: number; y: number; value: number }[] = [];

  let minX = Infinity,  minY = Infinity;
  let maxX = -Infinity, maxY = -Infinity;
  let minZ = Infinity,  maxZ = -Infinity;
  let pointCount = 0;

  const rawRoadMap = new Map<string, { color: string; pts: { x: number; y: number }[][] }>();
  function addRoadPolyline(layer: string, pts: { x: number; y: number }[]) {
    if (pts.length < 2) return;
    if (!rawRoadMap.has(layer)) rawRoadMap.set(layer, { color: '#AAAAAA', pts: [] });
    rawRoadMap.get(layer)!.pts.push(pts);
  }
  function trackBounds(x: number, y: number) {
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }

  for (const ent of entities) {
    const type: string  = ent?.type  ?? '';
    const layer: string = ent?.layer ?? '';

    // ── TEXT / MTEXT: thu thập nhãn số (cao độ) ────────────────────────────
    // Không áp dụng layer filter cho TEXT — nhãn có thể ở layer khác contour
    if (type === 'TEXT' || type === 'MTEXT' || type === 'ATTRIB' || type === 'ATTDEF') {
      const raw  = getEntityText(ent);
      const val  = parseNumericText(raw);
      if (val !== null) {
        const pos = getEntityPos(ent);
        if (pos) {
          textLabels.push({ x: pos.x, y: pos.y, value: val });
        }
      }
      continue;
    }

    // ── Road detection (layer không phải contour) ──────────────────────────
    const isContourLayer = layer && DEFAULT_CONTOUR_LAYER_RE.test(layer);
    if (!isContourLayer && layer && ROAD_LAYER_RE.test(layer)) {
      if (type === 'LWPOLYLINE' || type === 'POLYLINE2D' || type === 'POLYLINE3D') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const verts: any[] = ent.vertices ?? [];
        addRoadPolyline(layer, verts.map((v: any) => ({ x: v.x ?? 0, y: v.y ?? 0 })));
      } else if (type === 'LINE') {
        const s = ent.startPoint, e = ent.endPoint;
        if (s && e) addRoadPolyline(layer, [{ x: s.x ?? 0, y: s.y ?? 0 }, { x: e.x ?? 0, y: e.y ?? 0 }]);
      }
      continue;
    }

    // Layer filter
    if (layerOk && !layerOk.test(layer)) continue;

    // ── LWPOLYLINE (Z có thể ở .elevation, .z, per-vertex .z, hoặc extrusion) ─
    if (type === 'LWPOLYLINE') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ea = ent as any;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const verts: any[] = ea.vertices ?? [];
      if (verts.length < 2) continue;

      // Ưu tiên: per-vertex Z (LibreDWG đôi khi embed Z vào vertex dù LWPOLYLINE là 2D)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const vertZs = verts.map((v: any) => (typeof v.z === 'number' ? v.z : 0));
      const hasVertZ = vertZs.some(z => Math.abs(z) > 0.001);
      let elev: number;
      if (hasVertZ) {
        const sorted = [...vertZs].sort((a, b) => a - b);
        elev = sorted[Math.floor(sorted.length / 2)];
      } else {
        // Thử các field khác nhau của entity
        const cands = [ea.elevation, ea.z, ea.extrusionPoint?.z]
          .filter((v): v is number => typeof v === 'number' && v !== 0);
        elev = cands[0] ?? 0;
      }

      const points = verts.map((v: any) => ({ x: v.x ?? 0, y: v.y ?? 0 }));
      for (const p of points) trackBounds(p.x, p.y);
      if (elev < minZ) minZ = elev;
      if (elev > maxZ) maxZ = elev;
      contours.push({ elevation: elev, points, layer, closed: !!(ea.flag & 1) });
      pointCount += points.length;
      continue;
    }

    // ── POLYLINE2D (elevation chung, có thể có per-vertex Z) ──────────────
    if (type === 'POLYLINE2D') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ea2 = ent as any;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const verts: any[] = ea2.vertices ?? [];
      if (verts.length < 2) continue;
      const filtVerts = verts.filter((v: { flag?: number }) => {
        const f = v.flag ?? 0; return !(f & 64) && !(f & 16);
      });
      if (filtVerts.length < 2) continue;

      // Kiểm tra per-vertex Z
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const vZs = filtVerts.map((v: any) => (typeof v.z === 'number' ? v.z : 0));
      const hasVZ = vZs.some((z: number) => Math.abs(z) > 0.001);
      let elev: number;
      if (hasVZ) {
        const sorted = [...vZs].sort((a: number, b: number) => a - b);
        elev = sorted[Math.floor(sorted.length / 2)];
      } else {
        const cands = [ea2.elevation, ea2.z]
          .filter((v): v is number => typeof v === 'number' && v !== 0);
        elev = cands[0] ?? 0;
      }

      const points = filtVerts.map((v: any) => ({ x: v.x ?? 0, y: v.y ?? 0 }));
      for (const p of points) trackBounds(p.x, p.y);
      if (elev < minZ) minZ = elev;
      if (elev > maxZ) maxZ = elev;
      contours.push({ elevation: elev, points, layer, closed: !!(ea2.flag & 1) });
      pointCount += points.length;
      continue;
    }

    // ── POLYLINE3D (per-vertex Z) ──────────────────────────────────────────
    if (type === 'POLYLINE3D') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const verts: any[] = ent.vertices ?? [];
      if (verts.length < 2) continue;
      const pts3d = verts.map((v: any) => ({ x: v.x ?? 0, y: v.y ?? 0, z: v.z ?? 0 }));
      const zVals = pts3d.map(p => p.z);
      const zMin = Math.min(...zVals), zMax = Math.max(...zVals);
      const points = pts3d.map(p => ({ x: p.x, y: p.y }));
      for (const p of points) trackBounds(p.x, p.y);
      if (zMax - zMin < 0.05) {
        const elev = (zMin + zMax) / 2;
        if (elev < minZ) minZ = elev;
        if (elev > maxZ) maxZ = elev;
        contours.push({ elevation: elev, points, layer, closed: !!(ent.flag & 1) });
      } else {
        const sorted = [...zVals].sort((a, b) => a - b);
        const medianZ = sorted[Math.floor(sorted.length / 2)];
        for (const z of zVals) { if (z < minZ) minZ = z; if (z > maxZ) maxZ = z; }
        contours.push({ elevation: medianZ, points, layer, closed: !!(ent.flag & 1) });
      }
      pointCount += points.length;
      continue;
    }

    // ── LINE ───────────────────────────────────────────────────────────────
    if (type === 'LINE') {
      const s = ent.startPoint, e = ent.endPoint;
      if (!s || !e) continue;
      const z = ((s.z ?? 0) + (e.z ?? 0)) / 2;
      if (z === 0 && ent.elevation == null) continue;
      const pts = [{ x: s.x ?? 0, y: s.y ?? 0 }, { x: e.x ?? 0, y: e.y ?? 0 }];
      for (const p of pts) trackBounds(p.x, p.y);
      if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
      contours.push({ elevation: z, points: pts, layer });
      pointCount += 2;
    }
  }

  // ── Bước 4b: TERRAIN PHẲNG → thử tái tạo Z ───────────────────────────────
  // Kiểm tra: nếu ΔZ < 1m (tất cả contour Z≈0), thử 2 chiến lược
  if (Math.abs(maxZ - minZ) < 1 && contours.length > 0) {
    _debugDump();  // Dump entity structure để diagnose
    console.log(`[parseDwg] Terrain phẳng (Z: ${minZ}–${maxZ}), bắt đầu tái tạo cao độ...`);
    console.log(`[parseDwg] Số nhãn TEXT: ${textLabels.length}`);
    if (textLabels.length > 0) {
      console.log('[parseDwg] Mẫu TEXT labels (5 đầu):',
        textLabels.slice(0, 5).map(l => `${l.value}@(${l.x.toFixed(0)},${l.y.toFixed(0)})`).join(', '));
    }

    let reconstructed = false;

    // ── CHIẾN LƯỢC 1: trích xuất cao độ từ tên LAYER ─────────────────────
    {
      // Với mỗi layer duy nhất, thử parse số cao độ
      const layerElevMap = new Map<string, number>();
      for (const c of contours) {
        const lyr = c.layer ?? '';
        if (!layerElevMap.has(lyr)) {
          const e = extractElevFromLayerName(lyr);
          if (e !== null) layerElevMap.set(lyr, e);
        }
      }

      console.log(`[parseDwg] Layer name → elevation: ${layerElevMap.size} layers có số cao độ`);
      if (layerElevMap.size > 0) {
        console.log('[parseDwg] Mẫu layer elev:',
          [...layerElevMap.entries()].slice(0, 8)
            .map(([l, e]) => `${l}→${e}`).join(', '));
      }

      if (layerElevMap.size >= 2) {
        const layerElevs = Array.from(layerElevMap.values());
        const layerMin = Math.min(...layerElevs);
        const layerMax = Math.max(...layerElevs);

        if (layerMax - layerMin >= 1) {
          // Gán elevation từ layer name cho từng contour
          const updated = contours.map(c => {
            const e = layerElevMap.get(c.layer ?? '');
            return e !== undefined ? { ...c, elevation: e } : c;
          });
          const assignedCount = updated.filter((c, i) => c.elevation !== contours[i].elevation).length;
          console.log(`[parseDwg] Chiến lược 1 (Layer name): gán được ${assignedCount}/${contours.length} contours`);
          console.log(`[parseDwg] Dải Z: ${layerMin.toFixed(1)} – ${layerMax.toFixed(1)} m`);

          if (assignedCount > contours.length * 0.2) {
            // Đủ contours được gán → dùng kết quả này
            contours.length = 0;
            contours.push(...updated);
            minZ = layerMin;
            maxZ = layerMax;
            reconstructed = true;
          }
        }
      }
    }

    // ── CHIẾN LƯỢC 2: TEXT proximity matching (nếu chiến lược 1 thất bại) ─
    if (!reconstructed && textLabels.length > 0) {
      const diag = Math.hypot(maxX - minX, maxY - minY);
      console.log(`[parseDwg] Chiến lược 2 (TEXT proximity), diag=${diag.toFixed(0)}m`);
      const updated = assignElevFromTextLabels(contours, textLabels, diag);
      let newMinZ = Infinity, newMaxZ = -Infinity;
      for (const c of updated) {
        if (c.elevation < newMinZ) newMinZ = c.elevation;
        if (c.elevation > newMaxZ) newMaxZ = c.elevation;
      }
      if (newMaxZ > newMinZ + 0.5) {
        contours.length = 0;
        contours.push(...updated);
        minZ = newMinZ;
        maxZ = newMaxZ;
        reconstructed = true;
        console.log(`[parseDwg] Chiến lược 2 thành công: ${newMinZ.toFixed(1)} – ${newMaxZ.toFixed(1)} m`);
      } else {
        console.warn('[parseDwg] Chiến lược 2 thất bại: TEXT labels không match đủ contours');
      }
    }

    if (!reconstructed) {
      throw new Error(
        'File DWG này không chứa cao độ Z, nhãn TEXT, hoặc layer mã hoá cao độ.\n\n' +
        'Giải pháp:\n' +
        '  1. Mở file trong AutoCAD\n' +
        '  2. File → Save As → DXF (R2018)\n' +
        '  3. Tải file DXF lên app\n\n' +
        'DXF thường giữ đầy đủ Z + TEXT spot heights mà DWG đã mất khi flatten.'
      );
    }
  }

  // ── Bước 5: lọc Z outlier (IQR ×3) ──────────────────────────────────────
  if (contours.length > 4) {
    const elevs = contours.map(c => c.elevation).sort((a, b) => a - b);
    const q1 = elevs[Math.floor(elevs.length * 0.25)];
    const q3 = elevs[Math.floor(elevs.length * 0.75)];
    const iqr = q3 - q1;
    const zLo = q1 - iqr * 3;
    const zHi = q3 + iqr * 3;
    const filtered = contours.filter(c => c.elevation >= zLo && c.elevation <= zHi);
    if (filtered.length > 0) {
      contours.length = 0;
      contours.push(...filtered);
      minZ = Infinity; maxZ = -Infinity;
      for (const c of filtered) {
        if (c.elevation < minZ) minZ = c.elevation;
        if (c.elevation > maxZ) maxZ = c.elevation;
      }
    }
  }

  if (contours.length === 0) {
    throw new Error(
      'Không tìm thấy đường đồng mức trong DWG.\n' +
      'Kiểm tra: (1) file có layer "DM", "DC", "CONTOUR" không? ' +
      '(2) Nhập tên layer vào ô "Lọc layer". ' +
      '(3) Xem console (F12) để biết các layer có trong file.',
    );
  }

  if (!Number.isFinite(minX)) { minX = 0; maxX = 1000; minY = 0; maxY = 1000; }
  if (!Number.isFinite(minZ)) { minZ = 0; maxZ = 100; }

  // ── Build rawRoads ────────────────────────────────────────────────────────
  const rawRoads: RawRoadPolyline[] = [];
  for (const [layer, { color, pts }] of rawRoadMap.entries()) {
    for (const points of pts) rawRoads.push({ layer, color, points });
  }

  console.log(`[parseDwg] Kết quả: ${contours.length} contours, Z: ${minZ.toFixed(1)}–${maxZ.toFixed(1)} m`);

  return {
    contours,
    bounds: { minX, minY, maxX, maxY, minZ, maxZ },
    pointCount,
    rawRoads: rawRoads.length > 0 ? rawRoads : undefined,
  };
}
