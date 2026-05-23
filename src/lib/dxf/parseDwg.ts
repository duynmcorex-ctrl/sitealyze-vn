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
 * Nguồn Z DUY NHẤT (giống parseDxf.ts):
 *   - vertex.z của LWPOLYLINE / POLYLINE2D / POLYLINE3D
 *   - entity.elevation
 *   - LINE start/end z
 * KHÔNG đoán Z từ tên layer hay TEXT label — file Z=0 → render mặt phẳng.
 */
import type { ParsedDxf, ContourPolyline, RawRoadPolyline } from '../types';
// NOTE: detectBoundary chỉ áp dụng cho DXF (cần raw entities). DWG parser
// chưa expose entities → boundary clip skip cho DWG. User export DXF để có clip.
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

// ── ĐÃ GỠ: Toàn bộ helpers cho "đoán Z" ──
//   getEntityText, getEntityPos, parseNumericText (TEXT/MTEXT inference)
//   pt2seg2, assignElevFromTextLabels (TEXT proximity)
//   extractElevFromLayerName (đoán Z từ tên layer "DM0950")
//   Lý do: gây terrain giả với file QH/2D. User chốt: Z=0 → mặt phẳng.

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

    // Bỏ qua các entity không tạo polyline geometry (gồm cả TEXT/MTEXT —
    // không còn dùng để đoán Z)
    if (type === 'TEXT' || type === 'MTEXT' || type === 'ATTRIB' || type === 'ATTDEF') {
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

  // ── Bước 4b: File Z=0 → render mặt phẳng (KHÔNG đoán Z) ────────────────
  // Parser KHÔNG còn đoán Z từ TEXT label/layer name → file Z=0 luôn → flat terrain.
  if (Math.abs(maxZ - minZ) < 0.5) {
    console.warn(
      '[parseDwg] ⓘ File không có cao độ Z thật trong polyline/vertex — ' +
      'render địa hình PHẲNG (Z=0). Bản vẽ 2D sẽ drape lên mặt phẳng.\n' +
      '  Nếu cần địa hình 3D: file CAD phải có Z trong POLYLINE3D vertex, ' +
      'hoặc export DXF R2018 từ AutoCAD để bảo toàn Z.'
    );
    // Ép range tối thiểu để rasterizer hoạt động bình thường; mọi cell sẽ ~0
    minZ = -0.01;
    maxZ = 0.01;
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
