import type { Heightmap } from '../types';
import type { TIN } from './triangulate';

interface Bounds {
  minX: number; minY: number; maxX: number; maxY: number;
}

// Resample TIN sang heightmap đều bằng cách rasterize từng tam giác (barycentric).
export function rasterizeTinToHeightmap(
  tin: TIN,
  bounds: Bounds,
  targetCells = 256
): Heightmap {
  const w = bounds.maxX - bounds.minX;
  const h = bounds.maxY - bounds.minY;
  const aspect = w / h;
  let width: number, height: number;
  if (aspect >= 1) {
    width = targetCells;
    height = Math.max(8, Math.round(targetCells / aspect));
  } else {
    height = targetCells;
    width = Math.max(8, Math.round(targetCells * aspect));
  }
  const cellSize = w / width;

  const data = new Float32Array(width * height);
  const filled = new Uint8Array(width * height);
  data.fill(NaN);

  let minZ = Infinity, maxZ = -Infinity;

  const verts = tin.vertices;
  const tris = tin.triangles;

  // ── Adaptive median filter: tính ngưỡng dựa trên phân phối edge length thực tế ──
  // Lý do: filter cố định 15% × map dimension không thích nghi được với mật độ contour.
  // Vùng dày contour → median edge nhỏ → filter chặt → loại convex-hull artifacts.
  // Vùng thưa hợp lệ → median to → filter rộng → giữ tam giác cần thiết.
  const triLongestEdges: number[] = [];
  for (let t = 0; t < tris.length; t += 3) {
    const ai = tris[t] * 3, bi = tris[t + 1] * 3, ci = tris[t + 2] * 3;
    const ax = verts[ai], ay = verts[ai + 1];
    const bx = verts[bi], by = verts[bi + 1];
    const cx = verts[ci], cy = verts[ci + 1];
    const eAB = Math.hypot(bx - ax, by - ay);
    const eBC = Math.hypot(cx - bx, cy - by);
    const eCA = Math.hypot(ax - cx, ay - cy);
    triLongestEdges.push(Math.max(eAB, eBC, eCA));
  }
  triLongestEdges.sort((a, b) => a - b);
  const medianEdge = triLongestEdges[Math.floor(triLongestEdges.length / 2)] || 1;
  // Factor 4×: tam giác dài hơn 4 lần median → coi là artifact (qua vùng trống)
  const edgeThreshold = medianEdge * 4;
  console.log(`[heightmap] Adaptive filter: median edge=${medianEdge.toFixed(1)}m, threshold=${edgeThreshold.toFixed(1)}m`);
  let droppedTri = 0;

  for (let t = 0; t < tris.length; t += 3) {
    const ai = tris[t] * 3;
    const bi = tris[t + 1] * 3;
    const ci = tris[t + 2] * 3;
    const ax = verts[ai], ay = verts[ai + 1], az = verts[ai + 2];
    const bx = verts[bi], by = verts[bi + 1], bz = verts[bi + 2];
    const cx = verts[ci], cy = verts[ci + 1], cz = verts[ci + 2];

    const triMinX = Math.min(ax, bx, cx);
    const triMinY = Math.min(ay, by, cy);
    const triMaxX = Math.max(ax, bx, cx);
    const triMaxY = Math.max(ay, by, cy);

    // Adaptive filter: tính longest edge thực sự (không chỉ bbox)
    const eAB = Math.hypot(bx - ax, by - ay);
    const eBC = Math.hypot(cx - bx, cy - by);
    const eCA = Math.hypot(ax - cx, ay - cy);
    const longEdge = Math.max(eAB, eBC, eCA);
    if (longEdge > edgeThreshold) { droppedTri++; continue; }

    const x0 = Math.max(0, Math.floor((triMinX - bounds.minX) / cellSize));
    const x1 = Math.min(width - 1, Math.ceil((triMaxX - bounds.minX) / cellSize));
    const y0 = Math.max(0, Math.floor((triMinY - bounds.minY) / cellSize));
    const y1 = Math.min(height - 1, Math.ceil((triMaxY - bounds.minY) / cellSize));

    const denom = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
    if (Math.abs(denom) < 1e-12) continue;

    for (let py = y0; py <= y1; py++) {
      const yWorld = bounds.minY + (py + 0.5) * cellSize;
      for (let px = x0; px <= x1; px++) {
        const xWorld = bounds.minX + (px + 0.5) * cellSize;
        const wA = ((by - cy) * (xWorld - cx) + (cx - bx) * (yWorld - cy)) / denom;
        const wB = ((cy - ay) * (xWorld - cx) + (ax - cx) * (yWorld - cy)) / denom;
        const wC = 1 - wA - wB;
        if (wA < -1e-6 || wB < -1e-6 || wC < -1e-6) continue;
        const z = wA * az + wB * bz + wC * cz;
        const idx = py * width + px;
        data[idx] = z;
        filled[idx] = 1;
        if (z < minZ) minZ = z;
        if (z > maxZ) maxZ = z;
      }
    }
  }

  const totalTri = tris.length / 3;
  console.log(`[heightmap] Filtered ${droppedTri}/${totalTri} triangles (${(droppedTri/totalTri*100).toFixed(1)}%) as convex-hull artifacts`);

  // Lưu mask trước khi lấp — mask=1 nghĩa là cell đã được rasterize thực sự
  const mask = new Uint8Array(filled); // copy trước khi fillHoles thay đổi filled

  // Lấp các cell rỗng (rìa) bằng láng giềng gần nhất qua passes
  fillHoles(data, filled, width, height);

  // Cập nhật min/max sau khi lấp
  for (let i = 0; i < data.length; i++) {
    const z = data[i];
    if (Number.isFinite(z)) {
      if (z < minZ) minZ = z;
      if (z > maxZ) maxZ = z;
    }
  }

  return {
    width, height, cellSize,
    origin: { x: bounds.minX, y: bounds.minY },
    data, mask,
    minZ: Number.isFinite(minZ) ? minZ : 0,
    maxZ: Number.isFinite(maxZ) ? maxZ : 0,
  };
}

// Gaussian smoothing 3x3 nhẹ để làm mượt mesh + cập nhật min/max
export function smoothHeightmap(hm: Heightmap, passes = 1): Heightmap {
  const { width: w, height: h, data } = hm;
  let src: Float32Array = data;
  let dst: Float32Array = new Float32Array(src.length);
  // Kernel Gaussian 3x3, sigma~1
  const k = [1, 2, 1, 2, 4, 2, 1, 2, 1];
  const kSum = 16;
  for (let p = 0; p < passes; p++) {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let sum = 0;
        let i = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const xx = Math.min(w - 1, Math.max(0, x + dx));
            const yy = Math.min(h - 1, Math.max(0, y + dy));
            sum += src[yy * w + xx] * k[i++];
          }
        }
        dst[y * w + x] = sum / kSum;
      }
    }
    [src, dst] = [dst, src];
  }
  // src giờ chứa kết quả; copy về data gốc
  let minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < data.length; i++) {
    data[i] = src[i];
    if (src[i] < minZ) minZ = src[i];
    if (src[i] > maxZ) maxZ = src[i];
  }
  return { ...hm, minZ, maxZ };
}

function fillHoles(data: Float32Array, filled: Uint8Array, w: number, h: number) {
  const queue: number[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (filled[y * w + x]) queue.push(y * w + x);
    }
  }
  let head = 0;
  while (head < queue.length) {
    const idx = queue[head++];
    const x = idx % w;
    const y = (idx / w) | 0;
    const z = data[idx];
    const neigh = [
      [x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1],
    ];
    for (const [nx, ny] of neigh) {
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const ni = ny * w + nx;
      if (!filled[ni]) {
        data[ni] = z;
        filled[ni] = 1;
        queue.push(ni);
      }
    }
  }
}
