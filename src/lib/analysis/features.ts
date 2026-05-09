import type { Heightmap } from '../types';

export interface TerrainFeatures {
  peaks: { x: number; y: number; z: number }[];
  pits: { x: number; y: number; z: number }[];
  ridges: number[];   // mask 0/1
  valleys: number[];  // mask 0/1
}

export function detectFeatures(hm: Heightmap, radius = 3): TerrainFeatures {
  const { width: w, height: h, cellSize, data } = hm;
  const peaks: TerrainFeatures['peaks'] = [];
  const pits: TerrainFeatures['pits'] = [];
  const ridges = new Array<number>(w * h).fill(0);
  const valleys = new Array<number>(w * h).fill(0);
  const cx = (w * cellSize) / 2;
  const cy = (h * cellSize) / 2;

  for (let y = radius; y < h - radius; y++) {
    for (let x = radius; x < w - radius; x++) {
      const z = data[y * w + x];
      let isPeak = true, isPit = true;
      for (let dy = -radius; dy <= radius && (isPeak || isPit); dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nz = data[(y + dy) * w + (x + dx)];
          if (nz >= z) isPeak = false;
          if (nz <= z) isPit = false;
        }
      }
      // Z negated nhất quán với buildMesh flip
      if (isPeak) peaks.push({ x: x * cellSize - cx, y: z, z: -(y * cellSize - cy) });
      if (isPit)  pits.push({ x: x * cellSize - cx, y: z, z: -(y * cellSize - cy) });
    }
  }

  // Ridge / valley qua curvature 2 chiều (Laplacian + signed second derivative)
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const z = data[i];
      const zL = data[i - 1], zR = data[i + 1];
      const zU = data[i - w], zD = data[i + w];
      const ddx = zL + zR - 2 * z;
      const ddy = zU + zD - 2 * z;
      // Ridge: cong xuống cả 2 hướng (lồi)
      if (ddx < -0.05 && ddy < -0.05) ridges[i] = 1;
      // Valley: cong lên (lõm)
      if (ddx > 0.05 && ddy > 0.05) valleys[i] = 1;
    }
  }

  return { peaks, pits, ridges, valleys };
}

/**
 * Chuyển mask ridge/valley thành các polyline liên tục.
 * Thuật toán: scan từng pixel có mask=1, nối 8-neighbors liên tiếp thành chain.
 * Trả về mảng các polyline 3D (tọa độ Three.js world space).
 */
export function traceRidgePolylines(
  mask: number[],
  hm: Heightmap,
  minLength = 4,
): { x: number; y: number; z: number }[][] {
  const { width: w, height: h, cellSize, data } = hm;
  const cx = (w * cellSize) / 2;
  const cy = (h * cellSize) / 2;

  const visited = new Uint8Array(w * h);
  const polylines: { x: number; y: number; z: number }[][] = [];

  // Hướng 8 lân cận theo thứ tự ưu tiên ngang/đứng trước, chéo sau
  const DIRS = [
    [1, 0], [-1, 0], [0, 1], [0, -1],
    [1, 1], [1, -1], [-1, 1], [-1, -1],
  ];

  for (let sy = 1; sy < h - 1; sy++) {
    for (let sx = 1; sx < w - 1; sx++) {
      const si = sy * w + sx;
      if (!mask[si] || visited[si]) continue;

      // Bắt đầu 1 chain từ điểm này
      const chain: { x: number; y: number; z: number }[] = [];
      let cx2 = sx, cy2 = sy;

      while (true) {
        const i = cy2 * w + cx2;
        visited[i] = 1;
        chain.push({
          x: cx2 * cellSize - cx,
          y: data[i],
          z: -(cy2 * cellSize - cy),
        });

        // Tìm neighbor chưa thăm có mask=1
        let found = false;
        for (const [dx, dy] of DIRS) {
          const nx = cx2 + dx, ny = cy2 + dy;
          if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
          const ni = ny * w + nx;
          if (mask[ni] && !visited[ni]) {
            cx2 = nx; cy2 = ny;
            found = true;
            break;
          }
        }
        if (!found) break;
      }

      if (chain.length >= minLength) polylines.push(chain);
    }
  }

  return polylines;
}
