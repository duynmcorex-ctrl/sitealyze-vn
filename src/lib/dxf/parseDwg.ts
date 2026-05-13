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
 * Entity types trong DwgDatabase:
 *   - 'LWPOLYLINE'  → DwgLWPolylineEntity  (.elevation, .vertices[]{x,y})
 *   - 'POLYLINE2D'  → DwgPolyline2dEntity  (.elevation, .vertices[]{x,y,z})
 *   - 'POLYLINE3D'  → DwgPolyline3dEntity  (.vertices[]{x,y,z} — per-vertex Z)
 *   - 'LINE'        → DwgLineEntity        (.startPoint{x,y,z}, .endPoint{x,y,z})
 */
import type { ParsedDxf, ContourPolyline, RawRoadPolyline } from '../types';
import { ROAD_LAYER_RE } from '../analysis/roads';

// ── Helpers tái tạo Z từ nhãn TEXT (giống parseDxf.ts) ──────────────────────

/** Thử parse giá trị số từ text CAD */
function parseNumericTextDwg(raw: string): number | null {
  if (!raw) return null;
  const clean = raw.replace(/\\[A-Za-z][^;]*;|[{}\\]|\\P/g, '').trim();
  const m = clean.match(/^(-?\d+(?:[.,]\d+)?)$/);
  if (!m) return null;
  const v = parseFloat(m[1].replace(',', '.'));
  return Number.isFinite(v) ? v : null;
}

/** Khoảng cách bình phương từ điểm đến đoạn thẳng (2D) */
function pt2seg2Dwg(px: number, py: number,
                   ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-12) return (px - ax) ** 2 + (py - ay) ** 2;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  return (px - ax - t * dx) ** 2 + (py - ay - t * dy) ** 2;
}

/**
 * Gán cao độ từ nhãn TEXT gần nhất cho mỗi contour polyline (khi Z=0).
 * Cùng thuật toán với parseDxf.ts — max dist = 5% đường chéo terrain.
 */
function assignElevFromLabels(
  contours: ContourPolyline[],
  labels: { x: number; y: number; value: number }[],
  diag: number,
): ContourPolyline[] {
  if (labels.length === 0) return contours;
  const maxDist2 = (diag * 0.05) ** 2;
  return contours.map((c) => {
    let bestDist2 = Infinity;
    let bestVal: number | null = null;
    for (const lbl of labels) {
      for (let i = 0; i < c.points.length - 1; i++) {
        const d2 = pt2seg2Dwg(lbl.x, lbl.y,
          c.points[i].x, c.points[i].y,
          c.points[i + 1].x, c.points[i + 1].y);
        if (d2 < bestDist2) { bestDist2 = d2; bestVal = lbl.value; }
      }
      if (c.points.length === 1) {
        const d2 = (lbl.x - c.points[0].x) ** 2 + (lbl.y - c.points[0].y) ** 2;
        if (d2 < bestDist2) { bestDist2 = d2; bestVal = lbl.value; }
      }
    }
    if (bestVal !== null && bestDist2 <= maxDist2) return { ...c, elevation: bestVal };
    return c;
  });
}

// ── Layer pattern auto-detect (giống parseDxf.ts) ────────────────────────────
const DEFAULT_CONTOUR_LAYER_RE =
  /(DM|DC|DG|DONGMUC|DUONG[_-]?DONG[_-]?MUC|CONTOUR|TOPO|ELEV|TERRAIN|HEIGHT|BINHDO)/i;

// ── Lazy load LibreDWG WASM ──────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _libPromise: Promise<any> | null = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getLib(): Promise<any> {
  if (!_libPromise) {
    // LibreDwg.create(wasmDir) → Emscripten locateFile('libredwg-web.wasm') = `${wasmDir}/libredwg-web.wasm`
    // Truyền '' → '/libredwg-web.wasm' (file được copy vào public/ bởi plugin Vite)
    _libPromise = import('@mlightcad/libredwg-web').then((mod) => mod.LibreDwg.create(''));
  }
  return _libPromise;
}

// ── Main parser ──────────────────────────────────────────────────────────────

export async function parseDwgBuffer(
  buffer: ArrayBuffer,
  layerPattern?: string,
): Promise<ParsedDxf> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lib = await getLib();
  const { Dwg_File_Type } = await import('@mlightcad/libredwg-web');

  // ── Bước 1: đọc binary → con trỏ WASM (Dwg_Data_Ptr) ───────────────────
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

  // ── Bước 2: chuyển pointer → DwgDatabase (typed JS) ─────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let db: any;
  try {
    db = lib.convert(dwgPtr);
  } catch (e) {
    lib.dwg_free?.(dwgPtr);
    throw new Error(`Lỗi chuyển đổi DWG: ${e instanceof Error ? e.message : String(e)}`);
  }
  // Giải phóng raw pointer ngay sau khi convert (không cần nữa)
  try { lib.dwg_free?.(dwgPtr); } catch { /* bỏ qua */ }

  // ── Bước 3: xác định layer filter ────────────────────────────────────────
  const userRe = layerPattern ? (() => { try { return new RegExp(layerPattern, 'i'); } catch { return null; } })() : null;

  // Auto-detect: nếu user không set pattern, tìm layer tên giống đường đồng mức
  let autoRe: RegExp | null = null;
  if (!userRe) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const hasContourLayer = (db.entities as any[]).some(
      (e: any) => e.layer && DEFAULT_CONTOUR_LAYER_RE.test(e.layer),
    );
    if (hasContourLayer) autoRe = DEFAULT_CONTOUR_LAYER_RE;
  }
  const layerOk = userRe ?? autoRe; // null = chấp nhận tất cả

  // ── Bước 4: extract contour polylines + road polylines ───────────────────
  const contours: ContourPolyline[] = [];
  /** TEXT / MTEXT có giá trị số — dùng để tái tạo Z khi terrain phẳng */
  const textLabels: { x: number; y: number; value: number }[] = [];
  let minX = Infinity, minY = Infinity;
  let maxX = -Infinity, maxY = -Infinity;
  let minZ = Infinity, maxZ = -Infinity;
  let pointCount = 0;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const entities: any[] = db.entities ?? [];

  // Road polylines thô (DXF 2D)
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
    const type: string = ent?.type ?? '';
    const layer: string = ent?.layer ?? '';

    // ── Thu thập nhãn TEXT / MTEXT có giá trị số (cao độ) ───────────────────
    if (type === 'TEXT' || type === 'MTEXT') {
      // LibreDWG: .text hoặc .textString
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const raw: string = (ent as any).text ?? (ent as any).textString ?? '';
      const val = parseNumericTextDwg(raw);
      if (val !== null) {
        // Vị trí: insertionPoint hoặc position hoặc point
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const pos = (ent as any).insertionPoint ?? (ent as any).position ?? (ent as any).point;
        if (pos && typeof pos.x === 'number' && typeof pos.y === 'number') {
          textLabels.push({ x: pos.x, y: pos.y, value: val });
        }
      }
      continue; // TEXT không tạo contour
    }

    // ── Road detection: CHỈ chạy nếu layer KHÔNG phải contour layer ────────
    // Defense-in-depth: ưu tiên contour nếu match cả 2 pattern.
    const isContourLayer = layer && DEFAULT_CONTOUR_LAYER_RE.test(layer);
    if (!isContourLayer && layer && ROAD_LAYER_RE.test(layer)) {
      if (type === 'LWPOLYLINE') {
        const verts: { x?: number; y?: number }[] = ent.vertices ?? [];
        const pts = verts
          .filter(v => typeof v.x === 'number' && typeof v.y === 'number')
          .map(v => ({ x: v.x ?? 0, y: v.y ?? 0 }));
        addRoadPolyline(layer, pts);
      } else if (type === 'POLYLINE2D') {
        const verts: { x?: number; y?: number }[] = ent.vertices ?? [];
        const pts = verts.map(v => ({ x: v.x ?? 0, y: v.y ?? 0 }));
        addRoadPolyline(layer, pts);
      } else if (type === 'POLYLINE3D') {
        const verts: { x?: number; y?: number }[] = ent.vertices ?? [];
        const pts = verts.map(v => ({ x: v.x ?? 0, y: v.y ?? 0 }));
        addRoadPolyline(layer, pts);
      } else if (type === 'LINE') {
        const s = ent.startPoint, e = ent.endPoint;
        if (s && e) addRoadPolyline(layer, [{ x: s.x ?? 0, y: s.y ?? 0 }, { x: e.x ?? 0, y: e.y ?? 0 }]);
      }
      continue; // Road không dùng cho contour
    }

    // Bỏ qua nếu không khớp filter
    if (layerOk && !layerOk.test(layer)) continue;

    // ── LWPOLYLINE ─────────────────────────────────────────────────────────
    // Elevation lưu trên entity, vertices chỉ có X/Y
    if (type === 'LWPOLYLINE') {
      const elev: number = ent.elevation ?? 0;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const verts: any[] = ent.vertices ?? [];
      if (verts.length < 2) continue;

      const points = verts.map((v: { x?: number; y?: number }) => ({
        x: v.x ?? 0,
        y: v.y ?? 0,
      }));
      for (const p of points) trackBounds(p.x, p.y);

      if (elev < minZ) minZ = elev;
      if (elev > maxZ) maxZ = elev;
      contours.push({ elevation: elev, points, layer, closed: !!(ent.flag & 1) });
      pointCount += points.length;
      continue;
    }

    // ── POLYLINE2D (đường đồng mức phẳng — elevation chung) ───────────────
    // DwgPolyline2dEntity: .elevation + .vertices[] (DwgVertex2dEntity)
    if (type === 'POLYLINE2D') {
      const elev: number = ent.elevation ?? 0;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const verts: any[] = ent.vertices ?? [];
      if (verts.length < 2) continue;

      const points = verts
        // VERTEX entities cho polyface/polygon mesh không phải đường đồng mức → lọc
        .filter((v: { flag?: number }) => {
          const f = v.flag ?? 0;
          return !(f & 64) && !(f & 16); // bỏ polyface + polygon mesh vertices
        })
        .map((v: { x?: number; y?: number }) => ({
          x: v.x ?? 0,
          y: v.y ?? 0,
        }));
      if (points.length < 2) continue;
      for (const p of points) trackBounds(p.x, p.y);

      if (elev < minZ) minZ = elev;
      if (elev > maxZ) maxZ = elev;
      contours.push({ elevation: elev, points, layer, closed: !!(ent.flag & 1) });
      pointCount += points.length;
      continue;
    }

    // ── POLYLINE3D (đường 3D — per-vertex Z) ──────────────────────────────
    // DwgPolyline3dEntity: .vertices[] (DwgVertex3dEntity, mỗi vertex có x,y,z)
    if (type === 'POLYLINE3D') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const verts: any[] = ent.vertices ?? [];
      if (verts.length < 2) continue;

      const pts3d = verts.map((v: { x?: number; y?: number; z?: number }) => ({
        x: v.x ?? 0,
        y: v.y ?? 0,
        z: v.z ?? 0,
      }));

      const zVals = pts3d.map(p => p.z);
      const zMin = Math.min(...zVals);
      const zMax = Math.max(...zVals);

      const points = pts3d.map(p => ({ x: p.x, y: p.y }));
      for (const p of points) trackBounds(p.x, p.y);

      if (zMax - zMin < 0.05) {
        // Flat 3D polyline → dùng elevation đồng nhất (trường hợp phổ biến)
        const elev = (zMin + zMax) / 2;
        if (elev < minZ) minZ = elev;
        if (elev > maxZ) maxZ = elev;
        contours.push({ elevation: elev, points, layer, closed: !!(ent.flag & 1) });
      } else {
        // 3D polyline thực — dùng Z trung vị làm elevation đại diện
        const sorted = [...zVals].sort((a, b) => a - b);
        const medianZ = sorted[Math.floor(sorted.length / 2)];
        for (const z of zVals) {
          if (z < minZ) minZ = z;
          if (z > maxZ) maxZ = z;
        }
        contours.push({ elevation: medianZ, points, layer, closed: !!(ent.flag & 1) });
      }
      pointCount += points.length;
      continue;
    }

    // ── LINE (segment ngắn — ít dùng cho đồng mức) ────────────────────────
    // DwgLineEntity dùng startPoint / endPoint (không phải start / end)
    if (type === 'LINE') {
      const s = ent.startPoint, e = ent.endPoint;
      if (!s || !e) continue;
      const z = ((s.z ?? 0) + (e.z ?? 0)) / 2;
      if (z === 0 && ent.elevation == null) continue; // bỏ line Z=0 không rõ cao độ
      const pts = [{ x: s.x ?? 0, y: s.y ?? 0 }, { x: e.x ?? 0, y: e.y ?? 0 }];
      for (const p of pts) trackBounds(p.x, p.y);
      if (z < minZ) minZ = z;
      if (z > maxZ) maxZ = z;
      contours.push({ elevation: z, points: pts, layer });
      pointCount += 2;
    }
  }

  // ── Bước 4b: tái tạo Z từ nhãn TEXT nếu terrain phẳng (Z≈0) ────────────────
  if (Math.abs(maxZ - minZ) < 1 && textLabels.length > 0) {
    console.log(`[parseDwg] Phát hiện ${textLabels.length} nhãn TEXT — thử tái tạo Z...`);
    const diag = Math.hypot(maxX - minX, maxY - minY);
    const updated = assignElevFromLabels(contours, textLabels, diag);
    let newMinZ = Infinity, newMaxZ = -Infinity;
    for (const c of updated) {
      if (c.elevation < newMinZ) newMinZ = c.elevation;
      if (c.elevation > newMaxZ) newMaxZ = c.elevation;
    }
    if (newMaxZ > newMinZ + 0.5) {
      contours.length = 0;
      for (const c of updated) contours.push(c);
      minZ = newMinZ;
      maxZ = newMaxZ;
      console.log(`[parseDwg] Tái tạo Z từ TEXT: ${newMinZ.toFixed(1)} – ${newMaxZ.toFixed(1)} m`);
    }
  }

  // ── Bước 5: lọc Z outlier (IQR ×3, giống parseDxf.ts) ───────────────────
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
      // Recalculate bounds
      minZ = Infinity; maxZ = -Infinity;
      for (const c of filtered) {
        if (c.elevation < minZ) minZ = c.elevation;
        if (c.elevation > maxZ) maxZ = c.elevation;
      }
    }
  }

  if (contours.length === 0) {
    throw new Error(
      'Không tìm thấy đường đồng mức (LWPOLYLINE / POLYLINE) trong file DWG.\n' +
      'Hãy kiểm tra: file có layer đường đồng mức không? Tên layer có chứa "DM", "DC", "CONTOUR" không?\n' +
      'Hoặc nhập tên layer vào ô "Lọc layer" trước khi mở file.',
    );
  }

  if (!Number.isFinite(minX)) { minX = 0; maxX = 1000; minY = 0; maxY = 1000; }
  if (!Number.isFinite(minZ)) { minZ = 0; maxZ = 100; }

  // ── Build rawRoads ────────────────────────────────────────────────────────
  const rawRoads: RawRoadPolyline[] = [];
  for (const [layer, { color, pts }] of rawRoadMap.entries()) {
    for (const points of pts) rawRoads.push({ layer, color, points });
  }

  return {
    contours,
    bounds: { minX, minY, maxX, maxY, minZ, maxZ },
    pointCount,
    rawRoads: rawRoads.length > 0 ? rawRoads : undefined,
  };
}
