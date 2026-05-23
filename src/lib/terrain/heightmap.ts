import type { Heightmap } from '../types';
import type { TIN } from './triangulate';
import { pointInPolygon } from '../util/pointInPolygon';

interface Bounds {
  minX: number; minY: number; maxX: number; maxY: number;
}

interface Point2D { x: number; y: number; }

// Resample TIN sang heightmap đều bằng cách rasterize từng tam giác (barycentric).
// KHÔNG còn boundary clip ở đây — clip được tách ra `applyBoundaryClip()` riêng
// để gọi sau khi user pick boundary qua dropdown (tránh re-run TIN tốn kém).
export function rasterizeTinToHeightmap(
  tin: TIN,
  bounds: Bounds,
  targetCells = 256,
  _boundary?: Point2D[],  // legacy param — kept for backward compat, unused
): Heightmap {
  void _boundary;
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

  // Tính độ phủ ban đầu (% cell được rasterize từ TIN)
  let initCovered = 0;
  for (let i = 0; i < mask.length; i++) if (mask[i]) initCovered++;
  const coveragePct = (initCovered / mask.length) * 100;

  // ── Pass A: Mask dilation — ÍT pass khi terrain sparse ───────────────────
  // Bug LLE-xr Exit: contour chỉ phủ ~5% diện tích → dilation 3 pass + fillHoles
  // mở rộng vùng mesh quá xa data → TIN extrapolate ra wedge nghiêng.
  // Fix: nếu coverage < 25%, chỉ dilate 1 pass (vừa đủ kín rìa, không over-extend).
  const dilatePasses = coveragePct < 25 ? 1 : 3;
  if (coveragePct < 25) {
    console.warn(
      `[heightmap] Terrain sparse: ${coveragePct.toFixed(1)}% coverage TIN ` +
      `→ giảm dilation xuống ${dilatePasses} pass (tránh wedge nghiêng).`
    );
  }
  for (let pass = 0; pass < dilatePasses; pass++) {
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
  // SKIP khi sparse: terrain phủ <25% → coi tất cả "bên ngoài" là exterior thật,
  // KHÔNG seal interior (tránh extrapolate Z qua nửa site).
  if (coveragePct >= 25) {
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

  // Cập nhật min/max sau khi lấp (tất cả cells — chưa có boundary clip)
  for (let i = 0; i < data.length; i++) {
    const z = data[i];
    if (Number.isFinite(z)) {
      if (z < minZ) minZ = z;
      if (z > maxZ) maxZ = z;
    }
  }

  const safeMinZ = Number.isFinite(minZ) ? minZ : 0;
  const safeMaxZ = Number.isFinite(maxZ) ? maxZ : 0;
  // Lưu originalMask + originalMin/Max để applyBoundaryClip có thể restore khi
  // user switch giữa boundary candidates (mask gốc không bị phá khi clip).
  return {
    width, height, cellSize,
    origin: { x: bounds.minX, y: bounds.minY },
    data, mask,
    minZ: safeMinZ,
    maxZ: safeMaxZ,
    originalMask: new Uint8Array(mask),
    originalMinZ: safeMinZ,
    originalMaxZ: safeMaxZ,
  };
}

/**
 * applyBoundaryClip — Tạo Heightmap mới với mask đã clip theo polygon ranh giới.
 *
 * Dùng khi user pick boundary qua dropdown sau khi parse:
 *  - Clone mask
 *  - Set mask[i] = 0 cho cell có tâm nằm NGOÀI boundary polygon
 *  - Recompute minZ/maxZ chỉ từ cells trong mask
 *  - Return heightmap mới (data[] giữ nguyên, mask khác)
 *
 * Caller cần `buildMeshFromHeightmap(newHm)` để rebuild mesh sau đó.
 *
 * @param hm Heightmap gốc (đã rasterize, fillHoles, smooth)
 * @param bounds DXF bounds (để map cell → world coord)
 * @param boundary Polygon ranh giới (DXF coords)
 * @returns Heightmap mới với mask clipped + minZ/maxZ recomputed
 */
export function applyBoundaryClip(
  hm: Heightmap,
  bounds: Bounds,
  boundary: Point2D[],
): Heightmap {
  if (boundary.length < 3) return hm;
  const { width, height, cellSize, data } = hm;
  // Bắt đầu từ originalMask (mask gốc trước khi clip lần đầu) → switch giữa
  // các candidate không phá data. Nếu chưa có originalMask, dùng mask hiện tại.
  const baseMask = hm.originalMask ?? hm.mask ?? new Uint8Array(width * height).fill(1);
  const newMask = new Uint8Array(baseMask);

  let clipped = 0, kept = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (!newMask[i]) continue;
      const wx = bounds.minX + (x + 0.5) * cellSize;
      const wy = bounds.minY + (y + 0.5) * cellSize;
      if (pointInPolygon({ x: wx, y: wy }, boundary)) {
        kept++;
      } else {
        newMask[i] = 0;
        clipped++;
      }
    }
  }

  // Recompute min/max CHỈ từ cells trong mask
  let newMinZ = Infinity, newMaxZ = -Infinity;
  for (let i = 0; i < data.length; i++) {
    if (!newMask[i]) continue;
    const z = data[i];
    if (Number.isFinite(z)) {
      if (z < newMinZ) newMinZ = z;
      if (z > newMaxZ) newMaxZ = z;
    }
  }
  if (!Number.isFinite(newMinZ)) { newMinZ = hm.minZ; newMaxZ = hm.maxZ; }

  console.log(
    `[applyBoundaryClip] Clipped ${clipped} cells ngoài ranh giới, ` +
    `giữ ${kept} cells (${(kept / (kept + clipped) * 100).toFixed(1)}% terrain). ` +
    `Z range: ${newMinZ.toFixed(1)} → ${newMaxZ.toFixed(1)} m`
  );

  return {
    ...hm,
    mask: newMask,
    minZ: newMinZ,
    maxZ: newMaxZ,
    // Giữ originalMask + originalMinZ/MaxZ để có thể switch tiếp
    originalMask: hm.originalMask ?? baseMask,
    originalMinZ: hm.originalMinZ ?? hm.minZ,
    originalMaxZ: hm.originalMaxZ ?? hm.maxZ,
  };
}

/**
 * restoreOriginalMask — Trả lại mask gốc (bỏ clip).
 * Dùng khi user chọn "Không clip" trong dropdown.
 */
export function restoreOriginalMask(hm: Heightmap): Heightmap {
  if (!hm.originalMask) return hm;
  return {
    ...hm,
    mask: new Uint8Array(hm.originalMask),
    minZ: hm.originalMinZ ?? hm.minZ,
    maxZ: hm.originalMaxZ ?? hm.maxZ,
  };
}

// Gaussian smoothing 3x3 nhẹ để làm mượt mesh + cập nhật min/max
// QUAN TRỌNG: chỉ tính min/max trong mask (sau boundary clip ở rasterize).
// Smoothing toàn bộ data nhưng min/max chỉ phản ánh cells SẼ RENDER.
export function smoothHeightmap(hm: Heightmap, passes = 1): Heightmap {
  const { width: w, height: h, data, mask } = hm;
  let src: Float32Array = data;
  let dst: Float32Array = new Float32Array(src.length);
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
  // Copy result về data, tính min/max CHỈ trong mask
  let minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < data.length; i++) {
    data[i] = src[i];
    if (mask && !mask[i]) continue; // skip cells ngoài mask (sau boundary clip)
    if (src[i] < minZ) minZ = src[i];
    if (src[i] > maxZ) maxZ = src[i];
  }
  // Fallback nếu mask trống (KHÔNG có boundary)
  if (!Number.isFinite(minZ)) {
    for (let i = 0; i < data.length; i++) {
      if (src[i] < minZ) minZ = src[i];
      if (src[i] > maxZ) maxZ = src[i];
    }
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
