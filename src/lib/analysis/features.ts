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
