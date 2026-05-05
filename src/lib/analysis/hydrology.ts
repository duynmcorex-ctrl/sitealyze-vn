import type { Heightmap } from '../types';

export interface HydrologyData {
  flowDir: Int8Array;       // 0..7 (D8: E,NE,N,NW,W,SW,S,SE)
  flowAccum: Float32Array;  // số cell tích tụ
  arrows: { x: number; y: number; angle: number; magnitude: number }[];
}

const D8_DX = [1, 1, 0, -1, -1, -1, 0, 1];
const D8_DY = [0, -1, -1, -1, 0, 1, 1, 1];
const D8_DIST = [1, Math.SQRT2, 1, Math.SQRT2, 1, Math.SQRT2, 1, Math.SQRT2];

export function computeHydrology(hm: Heightmap, arrowDensity = 1): HydrologyData {
  const { width: w, height: h, cellSize, data, mask } = hm;
  const flowDir = new Int8Array(w * h);
  const flowAccum = new Float32Array(w * h);
  flowDir.fill(-1);

  // ── Tính D8 flow direction (chỉ trên ô trong mask) ──────────────────────
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (mask && !mask[i]) continue; // bỏ ô ngoài terrain
      const z = data[i];
      let bestDir = -1;
      let bestSlope = 0;
      for (let d = 0; d < 8; d++) {
        const nx = x + D8_DX[d];
        const ny = y + D8_DY[d];
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        if (mask && !mask[ny * w + nx]) continue; // chỉ chảy vào ô trong mask
        const nz = data[ny * w + nx];
        const s = (z - nz) / D8_DIST[d];
        if (s > bestSlope) {
          bestSlope = s;
          bestDir = d;
        }
      }
      flowDir[i] = bestDir;
    }
  }

  // ── Topological flow accumulation (sort cells by Z desc) ────────────────
  const validCells: number[] = [];
  for (let i = 0; i < w * h; i++) {
    if (mask && !mask[i]) continue;
    validCells.push(i);
    flowAccum[i] = 1;
  }
  validCells.sort((a, b) => data[b] - data[a]);

  for (const idx of validCells) {
    const x = idx % w;
    const y = (idx / w) | 0;
    const d = flowDir[idx];
    if (d < 0) continue;
    const nx = x + D8_DX[d];
    const ny = y + D8_DY[d];
    if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
    if (mask && !mask[ny * w + nx]) continue;
    flowAccum[ny * w + nx] += flowAccum[idx];
  }

  // ── Sample arrows (chỉ trong mask) ──────────────────────────────────────
  const cx = (w * cellSize) / 2;
  const cy = (h * cellSize) / 2;
  // Bước lớn hơn → ít mũi tên hơn, dễ đọc hơn
  const step = Math.max(3, Math.round(14 / Math.max(0.5, arrowDensity)));
  const arrows: HydrologyData['arrows'] = [];
  for (let y = step; y < h - step; y += step) {
    for (let x = step; x < w - step; x += step) {
      const i = y * w + x;
      if (mask && !mask[i]) continue; // ← fix: không vẽ mũi tên ngoài terrain
      const d = flowDir[i];
      if (d < 0) continue;
      const dx = D8_DX[d];
      const dy = D8_DY[d];
      const angle = Math.atan2(-dy, dx); // flip DY cho Three.js Z-flip
      arrows.push({
        x: x * cellSize - cx,
        y: -(y * cellSize - cy), // Three.js world Z
        angle,
        magnitude: 1,
      });
    }
  }

  return { flowDir, flowAccum, arrows };
}
