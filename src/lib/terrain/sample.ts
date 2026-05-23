/**
 * sample.ts — Helpers sample heightmap tại 1 điểm world space.
 *
 * Dùng chung cho:
 *  - ContourLines.tsx (drape contour lên mặt mesh)
 *  - features.ts (check ridge continuity giữa 2 đỉnh)
 *  - LanduseLayer.tsx (drape khối 3D xuống mặt đất)
 */
import type { Heightmap } from '../types';

/**
 * Bilinear sample heightmap tại world (wx, wz).
 * Chuyển ngược: Three.js world → DXF coords → grid index → bilinear interp.
 * Returns `fallback` nếu điểm ngoài grid hoặc data NaN.
 */
export function sampleHM(
  wx: number, wz: number,
  bounds: { minX: number; minY: number; maxX: number; maxY: number },
  hm: Heightmap,
  fallback: number,
): number {
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cy = (bounds.minY + bounds.maxY) / 2;
  // Three.js world → DXF: X = wx + cx, Y = cy - wz (flip Z)
  const dxfX = wx + cx;
  const dxfY = cy - wz;
  const fx = (dxfX - hm.origin.x) / hm.cellSize;
  const fy = (dxfY - hm.origin.y) / hm.cellSize;
  const c0 = Math.max(0, Math.min(hm.width  - 2, Math.floor(fx)));
  const r0 = Math.max(0, Math.min(hm.height - 2, Math.floor(fy)));
  const c1 = c0 + 1, r1 = r0 + 1;
  const tx = fx - c0, ty = fy - r0;
  const h =
    hm.data[r0 * hm.width + c0] * (1 - tx) * (1 - ty) +
    hm.data[r0 * hm.width + c1] *       tx  * (1 - ty) +
    hm.data[r1 * hm.width + c0] * (1 - tx) *       ty  +
    hm.data[r1 * hm.width + c1] *       tx  *       ty;
  return Number.isFinite(h) ? h : fallback;
}

/**
 * sampleHM nhưng input world XZ Three.js trực tiếp (không cần bounds —
 * dùng khi đã trừ tâm). Phục vụ feature analysis trong world space.
 *
 * Giả định: features.ts đã build peaks với world XZ — terrain mesh được center
 * tại origin, nên Three world XZ = DXF (X - cx, -(Y - cy)).
 */
export function sampleHMWorld(
  wx: number, wz: number,
  hm: Heightmap,
  fallback: number,
): number {
  // Width/height in world space
  const W = hm.width  * hm.cellSize;
  const H = hm.height * hm.cellSize;
  // World origin = (-W/2, ?, -H/2); world wz dương = +Z = -Y_dxf (flip)
  // Cell index: col = (wx + W/2) / cellSize; row = (wz + H/2) / cellSize  (flip Z)
  const fx = (wx + W / 2) / hm.cellSize;
  const fy = (wz + H / 2) / hm.cellSize;
  const c0 = Math.max(0, Math.min(hm.width  - 2, Math.floor(fx)));
  const r0 = Math.max(0, Math.min(hm.height - 2, Math.floor(fy)));
  const c1 = c0 + 1, r1 = r0 + 1;
  const tx = fx - c0, ty = fy - r0;
  const h =
    hm.data[r0 * hm.width + c0] * (1 - tx) * (1 - ty) +
    hm.data[r0 * hm.width + c1] *       tx  * (1 - ty) +
    hm.data[r1 * hm.width + c0] * (1 - tx) *       ty  +
    hm.data[r1 * hm.width + c1] *       tx  *       ty;
  return Number.isFinite(h) ? h : fallback;
}
