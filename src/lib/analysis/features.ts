import type { Heightmap } from '../types';
import { sampleHMWorld } from '../terrain/sample';

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

/**
 * isRidgeContinuous — Kiểm tra terrain giữa 2 đỉnh có "liên tục" (cùng một dãy)
 * hay không, bằng cách sample heightmap dọc theo đoạn nối XZ.
 *
 * Logic: line nối A→B chỉ hợp lệ nếu mọi điểm sample dọc đoạn KHÔNG dip xuống
 * thấp hơn min(zA, zB) - dropThreshold. Nếu dip sâu hơn → đoạn cắt qua
 * thung lũng → 2 đỉnh thực sự ở 2 dãy khác nhau, không nối.
 *
 * @param dropThreshold Cho phép dip tối đa bao nhiêu mét dưới min peak
 */
export function isRidgeContinuous(
  a: { x: number; y: number; z: number },
  b: { x: number; y: number; z: number },
  hm: Heightmap,
  dropThreshold: number,
  samples = 15,
): boolean {
  const minPeakZ = Math.min(a.y, b.y);
  // Sample các điểm bên trong đoạn (bỏ 2 đầu vì đó chính là 2 đỉnh)
  for (let i = 1; i < samples; i++) {
    const t = i / samples;
    const sx = a.x + (b.x - a.x) * t;
    const sz = a.z + (b.z - a.z) * t;
    const z  = sampleHMWorld(sx, sz, hm, minPeakZ);
    if (minPeakZ - z > dropThreshold) return false;
  }
  return true;
}

/**
 * connectPeaksMST — Tạo "đường sống núi" bằng cách nối các đỉnh phát hiện được
 * theo Minimum Spanning Tree (Prim's algorithm) + kiểm tra terrain continuity.
 *
 * @param peaks  Danh sách đỉnh (đã ở Three.js world space)
 * @param maxLinkDistance Bỏ qua link dài hơn ngưỡng này (tránh nối qua thung lũng rộng)
 * @param hm Heightmap để check continuity. Nếu undefined → không check (legacy)
 * @returns Mảng segment [start, end] để render bằng Line
 */
export function connectPeaksMST(
  peaks: { x: number; y: number; z: number }[],
  maxLinkDistance = Infinity,
  hm?: Heightmap,
): { a: { x: number; y: number; z: number }; b: { x: number; y: number; z: number } }[] {
  if (peaks.length < 2) return [];

  // Drop threshold thích nghi: 10% của relief, tối thiểu 5m (chống noise)
  const dropThreshold = hm
    ? Math.max(5, (hm.maxZ - hm.minZ) * 0.10)
    : Infinity;

  const n = peaks.length;
  const inTree = new Array<boolean>(n).fill(false);
  // Bắt đầu từ đỉnh cao nhất
  let startIdx = 0;
  for (let i = 1; i < n; i++) if (peaks[i].y > peaks[startIdx].y) startIdx = i;
  inTree[startIdx] = true;

  // minDist[i] = khoảng cách ngắn nhất từ đỉnh i tới tree
  const minDist = new Array<number>(n).fill(Infinity);
  const parent  = new Array<number>(n).fill(-1);

  // Cập nhật minDist cho các đỉnh chưa thuộc tree từ startIdx
  for (let i = 0; i < n; i++) {
    if (i === startIdx) continue;
    const dx = peaks[i].x - peaks[startIdx].x;
    const dz = peaks[i].z - peaks[startIdx].z;
    minDist[i] = Math.hypot(dx, dz);
    parent[i]  = startIdx;
  }

  const segments: { a: { x: number; y: number; z: number }; b: { x: number; y: number; z: number } }[] = [];

  // Lặp n-1 lần để nối hết
  for (let k = 0; k < n - 1; k++) {
    // Tìm đỉnh ngoài tree có minDist nhỏ nhất
    let bestI = -1, bestD = Infinity;
    for (let i = 0; i < n; i++) {
      if (!inTree[i] && minDist[i] < bestD) {
        bestD = minDist[i];
        bestI = i;
      }
    }
    if (bestI < 0) break;

    inTree[bestI] = true;
    if (parent[bestI] >= 0 && bestD <= maxLinkDistance) {
      const pA = peaks[parent[bestI]];
      const pB = peaks[bestI];
      // Chỉ nối nếu line đi qua "vùng cao" — không dip xuống thung lũng
      if (!hm || isRidgeContinuous(pA, pB, hm, dropThreshold)) {
        segments.push({ a: pA, b: pB });
      }
    }

    // Cập nhật minDist cho các đỉnh ngoài tree
    for (let i = 0; i < n; i++) {
      if (inTree[i]) continue;
      const dx = peaks[i].x - peaks[bestI].x;
      const dz = peaks[i].z - peaks[bestI].z;
      const d = Math.hypot(dx, dz);
      if (d < minDist[i]) {
        minDist[i] = d;
        parent[i]  = bestI;
      }
    }
  }

  return segments;
}
