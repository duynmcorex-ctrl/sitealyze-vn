import type { Heightmap } from '../types';

export interface SlopeData {
  slopeDeg: Float32Array;
  aspectDeg: Float32Array; // 0 = North, 90 = East, ... clockwise
  classes: Uint8Array;     // index vào SLOPE_CLASSES đang dùng
  mode: SlopeClassMode;
}

export type SlopeClassMode = 'degree' | 'percent';

/** Lớp theo góc độ (6 lớp) */
export const SLOPE_CLASSES_DEG = [
  { range: [0,  5],   label: '0–5°   Bằng phẳng',  color: '#bfe8b6' },
  { range: [5,  15],  label: '5–15°  Trung bình',   color: '#fde68a' },
  { range: [15, 25],  label: '15–25° Hơi dốc',      color: '#fbbf24' },
  { range: [25, 35],  label: '25–35° Dốc',           color: '#f97316' },
  { range: [35, 45],  label: '35–45° Rất dốc',       color: '#dc2626' },
  { range: [45, 999], label: '>45°   Nguy hiểm',     color: '#7c3aed' },
];

/**
 * Lớp theo % độ dốc (4 lớp) — chuẩn quy hoạch Việt Nam
 * tương đương GIS: 0-10%, 10-20%, 20-30%, >30%
 * chuyển đổi: 10% ≈ 5.7°, 20% ≈ 11.3°, 30% ≈ 16.7°
 */
export const SLOPE_CLASSES_PCT = [
  { range: [0,  10],  label: '0–10%   Bằng phẳng',  color: '#4ade80' },
  { range: [10, 20],  label: '10–20%  Hơi dốc',      color: '#fde047' },
  { range: [20, 30],  label: '20–30%  Dốc',           color: '#f97316' },
  { range: [30, 999], label: '>30%    Rất dốc',        color: '#dc2626' },
];

/** Trả về bảng lớp theo mode đang dùng */
export const SLOPE_CLASSES = SLOPE_CLASSES_DEG; // compat alias — Legend dùng

export function getSlopeClasses(mode: SlopeClassMode) {
  return mode === 'percent' ? SLOPE_CLASSES_PCT : SLOPE_CLASSES_DEG;
}

export function computeSlope(hm: Heightmap, mode: SlopeClassMode = 'degree'): SlopeData {
  const { width: w, height: h, cellSize, data, mask } = hm;
  const slopeDeg  = new Float32Array(w * h);
  const aspectDeg = new Float32Array(w * h);
  const classes   = new Uint8Array(w * h);
  const RAD2DEG   = 180 / Math.PI;
  const classTable = getSlopeClasses(mode);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;

      // Ô nằm ngoài terrain (mask=0) → bỏ qua, giữ slope=0
      if (mask && !mask[i]) { classes[i] = 0; continue; }

      // Dùng láng giềng hợp lệ (mask=1) để tránh artifact biên
      let xm = x, xp = x, ym = y, yp = y;
      if (x > 0     && (!mask || mask[y * w + (x-1)])) xm = x - 1;
      if (x < w - 1 && (!mask || mask[y * w + (x+1)])) xp = x + 1;
      if (y > 0     && (!mask || mask[(y-1) * w + x])) ym = y - 1;
      if (y < h - 1 && (!mask || mask[(y+1) * w + x])) yp = y + 1;

      const dx = (xp - xm) || 1;
      const dy = (yp - ym) || 1;
      const dzdx = (data[y * w + xp] - data[y * w + xm]) / (dx * cellSize);
      const dzdy = (data[yp * w + x] - data[ym * w + x]) / (dy * cellSize);

      const slopeRad = Math.atan(Math.hypot(dzdx, dzdy));
      const deg = slopeRad * RAD2DEG;
      slopeDeg[i] = deg;

      let asp = Math.atan2(dzdy, -dzdx) * RAD2DEG;
      asp = 90 - asp;
      if (asp < 0) asp += 360;
      aspectDeg[i] = asp;

      // Phân lớp: degree → dùng trực tiếp, percent → chuyển tan*100
      const val = mode === 'percent' ? Math.tan(slopeRad) * 100 : deg;
      let cls = classTable.length - 1;
      for (let ci = 0; ci < classTable.length; ci++) {
        const [lo, hi] = classTable[ci].range;
        if (val >= lo && val < hi) { cls = ci; break; }
      }
      classes[i] = cls;
    }
  }
  return { slopeDeg, aspectDeg, classes, mode };
}
