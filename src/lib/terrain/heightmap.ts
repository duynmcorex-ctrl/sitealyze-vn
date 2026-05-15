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

  // ── Adaptive filter rất rộng: chỉ drop convex-hull extreme outliers ──────
  // Chiến lược: ƯU TIÊN không thủng lỗ trong terrain > không có rìa bịa.
  // Dùng p99 × 2 để giữ HẦU HẾT tam giác hợp lệ, chỉ loại extreme outliers.
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
  const p50 = triLongestEdges[Math.floor(triLongestEdges.length * 0.50)] || 1;
  const p95 = triLongestEdges[Math.floor(triLongestEdges.length * 0.95)] || 1;
  const p99 = triLongestEdges[Math.floor(triLongestEdges.length * 0.99)] || 1;
  // p99 × 2: chỉ drop ~0.5-1% tam giác cực dài (convex hull extreme)
  // → giữ TOÀN BỘ tam giác bridge hợp lệ trong lòng terrain → không thủng lỗ
  const edgeThreshold = p99 * 2;
  console.log(`[heightmap] Filter: median=${p50.toFixed(1)}m, p95=${p95.toFixed(1)}m, p99=${p99.toFixed(1)}m, threshold=${edgeThreshold.toFixed(1)}m`);
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

  // ── Pass A: Mask dilation 3 passes (lấp rìa + lỗ nhỏ gần bề mặt) ─────────
  for (let pass = 0; pass < 3; pass++) {
    const next = new Uint8Array(mask);
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const i = y * width + x;
        if (mask[i]) continue;
        if (mask[i - 1] || mask[i + 1] || mask[i - width] || mask[i + width]) {
          next[i] = 1;
        }
      }
    }
    mask.set(next);
  }

  // ── Pass B: Exterior flood-fill → lấp lỗ thủng nội bộ triệt để ─────────
  // Flood fill từ 4 viền canvas để tìm tất cả cell "bên ngoài" terrain.
  // Mọi cell không-bên-ngoài và không-trong-mask = lỗ thủng nội bộ → thêm vào mask.
  // Phương pháp này lấp lỗ bất kỳ kích thước BÊN TRONG terrain mà KHÔNG mở rộng rìa ngoài.
  {
    const exterior = new Uint8Array(width * height);
    const extQ: number[] = [];
    for (let x = 0; x < width; x++) {
      if (!mask[x])                         { exterior[x] = 1;                      extQ.push(x); }
      const bi = (height - 1) * width + x;
      if (!mask[bi])                        { exterior[bi] = 1;                     extQ.push(bi); }
    }
    for (let y = 1; y < height - 1; y++) {
      if (!mask[y * width])                 { exterior[y * width] = 1;              extQ.push(y * width); }
      const ri = y * width + (width - 1);
      if (!mask[ri])                        { exterior[ri] = 1;                     extQ.push(ri); }
    }
    let eh = 0;
    while (eh < extQ.length) {
      const idx = extQ[eh++];
      const ex = idx % width, ey = (idx / width) | 0;
      for (const [ddx, ddy] of [[-1,0],[1,0],[0,-1],[0,1]] as const) {
        const nx = ex + ddx, ny = ey + ddy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const ni = ny * width + nx;
        if (!exterior[ni] && !mask[ni]) { exterior[ni] = 1; extQ.push(ni); }
      }
    }
    let interiorFilled = 0;
    for (let i = 0; i < mask.length; i++) {
      if (!mask[i] && !exterior[i]) { mask[i] = 1; interiorFilled++; }
    }
    if (interiorFilled > 0) {
      console.log(`[heightmap] Interior holes sealed: +${interiorFilled} cells (${(interiorFilled/(width*height)*100).toFixed(1)}%)`);
    }
  }

  // Lấp data của các cell rỗng (rìa + lỗ) bằng láng giềng gần nhất
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
