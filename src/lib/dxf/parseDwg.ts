/**
 * parseDwg.ts
 * Đọc file DWG (AutoCAD) và trả về cùng format ParsedDxf như parseDxf.ts.
 * Dùng thư viện @mlightcad/libredwg-web (WASM port của LibreDWG).
 *
 * Hỗ trợ: DWG R13–R2024 (~90% file thực tế).
 * Hạn chế: DWG là định dạng đóng của Autodesk, một số file phức tạp có thể lỗi.
 */
import type { ParsedDxf, ContourPolyline } from '../types';

// ── Lazy load LibreDWG WASM ──────────────────────────────────────────────────

let _libredwgPromise: Promise<unknown> | null = null;

async function getLibreDwg() {
  if (!_libredwgPromise) {
    // Dynamic import để không ảnh hưởng bundle size khi chỉ dùng DXF
    _libredwgPromise = import('@mlightcad/libredwg-web').then(async (mod) => {
      return mod.LibreDwg.create();
    });
  }
  return _libredwgPromise;
}

// ── Main parser ──────────────────────────────────────────────────────────────

export async function parseDwgBuffer(
  buffer: ArrayBuffer,
  layerPattern?: string,
): Promise<ParsedDxf> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lib = await getLibreDwg() as any;
  const { Dwg_File_Type } = await import('@mlightcad/libredwg-web');

  // Parse DWG binary
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let dwg: any;
  try {
    dwg = lib.dwg_read_data(buffer, Dwg_File_Type.DWG);
  } catch (e) {
    throw new Error(`Không thể đọc file DWG: ${e instanceof Error ? e.message : String(e)}`);
  }

  if (!dwg) {
    throw new Error('File DWG không hợp lệ hoặc phiên bản không được hỗ trợ (cần R13 trở lên).');
  }

  // Layer filter
  const layerRe = layerPattern ? new RegExp(layerPattern, 'i') : null;

  const contours: ContourPolyline[] = [];
  let pointCount = 0;
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

  // Lấy entities từ model space
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const entities: any[] = dwg.modelSpace ?? dwg.entities ?? [];

  for (const ent of entities) {
    const type: string = ent?.type ?? ent?.typeName ?? '';
    const layer: string = ent?.layer ?? '';

    // Filter theo layer pattern
    if (layerRe && !layerRe.test(layer)) continue;

    // ── LWPOLYLINE (2D polyline với elevation) ──
    if (type === 'LWPOLYLINE' || type === 'POLYLINE_2D') {
      const elev: number = ent.elevation ?? ent.z ?? 0;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const verts: any[] = ent.vertices ?? ent.points ?? [];
      if (verts.length < 2) continue;

      const points: { x: number; y: number }[] = [];
      for (const v of verts) {
        const x = v.x ?? v[0] ?? 0;
        const y = v.y ?? v[1] ?? 0;
        points.push({ x, y });
        minX = Math.min(minX, x); maxX = Math.max(maxX, x);
        minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      }

      if (points.length >= 2) {
        minZ = Math.min(minZ, elev); maxZ = Math.max(maxZ, elev);
        contours.push({
          elevation: elev,
          points,
          layer,
          closed: !!(ent.closed ?? ent.flag & 1),
        });
        pointCount += points.length;
      }
      continue;
    }

    // ── POLYLINE / 3DPOLYLINE (per-vertex Z) ──
    if (
      type === 'POLYLINE' || type === 'POLYLINE_3D' ||
      type === '3DPOLYLINE' || type === 'SEQEND'
    ) {
      if (type === 'SEQEND') continue; // marker entity, skip
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const verts: any[] = ent.vertices ?? [];
      if (verts.length < 2) continue;

      // Nếu tất cả Z giống nhau → giống LWPOLYLINE
      const zValues = verts.map((v: { z?: number }) => v.z ?? 0);
      const zMin = Math.min(...zValues);
      const zMax = Math.max(...zValues);

      if (zMax - zMin < 0.01) {
        // Flat polyline — dùng elevation đồng nhất
        const elev = zMin;
        const points = verts.map((v: { x?: number; y?: number }) => ({
          x: v.x ?? 0,
          y: v.y ?? 0,
        }));
        if (points.length >= 2) {
          verts.forEach((v: { x?: number; y?: number }) => {
            const x = v.x ?? 0; const y = v.y ?? 0;
            minX = Math.min(minX, x); maxX = Math.max(maxX, x);
            minY = Math.min(minY, y); maxY = Math.max(maxY, y);
          });
          minZ = Math.min(minZ, elev); maxZ = Math.max(maxZ, elev);
          contours.push({ elevation: elev, points, layer,
            closed: !!(ent.closed ?? ent.flag & 1) });
          pointCount += points.length;
        }
      } else {
        // 3D polyline với Z khác nhau: nhóm thành segment phẳng
        // (trường hợp hiếm trong bản đồ địa hình — thường là đường 3D)
        // Lấy Z median làm elevation
        const sortedZ = [...zValues].sort((a, b) => a - b);
        const medianZ = sortedZ[Math.floor(sortedZ.length / 2)];
        const points = verts.map((v: { x?: number; y?: number }) => ({
          x: v.x ?? 0,
          y: v.y ?? 0,
        }));
        if (points.length >= 2) {
          verts.forEach((v: { x?: number; y?: number; z?: number }) => {
            const x = v.x ?? 0; const y = v.y ?? 0; const z = v.z ?? 0;
            minX = Math.min(minX, x); maxX = Math.max(maxX, x);
            minY = Math.min(minY, y); maxY = Math.max(maxY, y);
            minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
          });
          contours.push({ elevation: medianZ, points, layer,
            closed: !!(ent.closed ?? ent.flag & 1) });
          pointCount += points.length;
        }
      }
    }
  }

  // Giải phóng WASM memory
  try { lib.dwg_free?.(dwg); } catch { /* bỏ qua */ }

  if (contours.length === 0) {
    throw new Error(
      'Không tìm thấy đường đồng mức (LWPOLYLINE/POLYLINE) trong file DWG.\n' +
      'Hãy kiểm tra: file có chứa đường đồng mức chưa? Layer pattern có đúng không?'
    );
  }

  // Fallback bounds
  if (!isFinite(minX)) { minX = 0; maxX = 1000; minY = 0; maxY = 1000; }
  if (!isFinite(minZ)) { minZ = 0; maxZ = 100; }

  return {
    contours,
    bounds: { minX, minY, maxX, maxY, minZ, maxZ },
    pointCount,
  };
}
