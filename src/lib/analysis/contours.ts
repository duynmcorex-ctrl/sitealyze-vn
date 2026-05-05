import { contours as d3contours } from 'd3-contour';
import type { ContourPolyline, Heightmap } from '../types';

export interface ContourLineSegment {
  elevation: number;
  // mảng polyline trong toạ độ world XY (pre-centered so với mesh)
  paths: { x: number; y: number }[][];
}

/**
 * Adapter: convert ContourPolyline[] (toạ độ DXF gốc) → ContourLineSegment[]
 * (toạ độ Three.js world space, đã center và flip Y), nhóm theo cao độ.
 *
 * Dùng khi muốn render đường đồng mức **nguyên bản từ DXF** thay vì
 * tái tạo từ heightmap (tránh đường giả do rasterize/smooth).
 */
export function originalContoursToSegments(
  contours: ContourPolyline[],
  bounds: { minX: number; minY: number; maxX: number; maxY: number },
): ContourLineSegment[] {
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cy = (bounds.minY + bounds.maxY) / 2;

  // Gom polyline theo cao độ để label hiển thị 1 lần/cao độ
  const byElev = new Map<number, { x: number; y: number }[][]>();
  for (const poly of contours) {
    if (poly.points.length < 2) continue;
    const path = poly.points.map((p) => ({
      x: p.x - cx,
      y: -(p.y - cy), // flip Y nhất quán buildMesh & overlay
    }));
    // Polyline khép kín → nối điểm đầu vào cuối để vẽ đoạn cuối
    if (poly.closed) {
      const first = path[0];
      const last = path[path.length - 1];
      if (first.x !== last.x || first.y !== last.y) path.push({ ...first });
    }
    const key = poly.elevation;
    let list = byElev.get(key);
    if (!list) {
      list = [];
      byElev.set(key, list);
    }
    list.push(path);
  }

  return Array.from(byElev.entries())
    .sort(([a], [b]) => a - b)
    .map(([elevation, paths]) => ({ elevation, paths }));
}

export function computeContourLines(
  hm: Heightmap,
  interval: number,
  centered = true,
  mask?: Uint8Array,
): ContourLineSegment[] {
  const { width, height, cellSize, data, minZ, maxZ } = hm;
  const start = Math.floor(minZ / interval) * interval;
  const end = Math.ceil(maxZ / interval) * interval;
  const thresholds: number[] = [];
  for (let v = start; v <= end; v += interval) thresholds.push(v);

  const generator = d3contours().size([width, height]).thresholds(thresholds);

  // Clip theo mask: cell ngoài terrain → giá trị rất thấp (dưới mọi threshold)
  // nên d3-contour không sinh đường trong vùng đó.
  let inputData: number[];
  if (mask) {
    const fillVal = minZ - interval * 200;
    inputData = Array.from(data).map((v, i) => (mask[i] ? v : fillVal));
  } else {
    inputData = Array.from(data);
  }

  const polygons = generator(inputData);

  const cx = centered ? (width * cellSize) / 2 : 0;
  const cy = centered ? (height * cellSize) / 2 : 0;

  const result: ContourLineSegment[] = [];
  for (const poly of polygons) {
    const z = poly.value;
    const paths: { x: number; y: number }[][] = [];
    for (const ring of poly.coordinates) {
      for (const subring of ring) {
        const path = subring.map(([gx, gy]) => ({
          x: gx * cellSize - cx,
          y: -(gy * cellSize - cy), // flip Y nhất quán với buildMesh (DXF-north → -Z)
        }));
        if (path.length >= 2) paths.push(path);
      }
    }
    if (paths.length) result.push({ elevation: z, paths });
  }
  return result;
}
