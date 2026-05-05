import { contours as d3contours } from 'd3-contour';
import type { Heightmap } from '../types';

export interface ContourLineSegment {
  elevation: number;
  // mảng polyline trong toạ độ world XY (pre-centered so với mesh)
  paths: { x: number; y: number }[][];
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
