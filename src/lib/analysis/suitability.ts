import type { Heightmap } from '../types';
import type { SlopeData } from './slope';
import type { HydrologyData } from './hydrology';

export interface SuitabilityData {
  score: Float32Array; // 0..100
  classes: Uint8Array; // 0..3
}

export const SUITABILITY_CLASSES = [
  { label: 'Rất phù hợp', color: '#15803d', range: [75, 101] },
  { label: 'Phù hợp', color: '#84cc16', range: [50, 75] },
  { label: 'Hạn chế', color: '#fb923c', range: [25, 50] },
  { label: 'Không phù hợp', color: '#7f1d1d', range: [0, 25] },
];

/** Gaussian blur 1 pass trên Float32Array 2D — xoá vệt từ bước nhảy score */
function gaussianSmooth(arr: Float32Array, w: number, h: number): Float32Array {
  const out = new Float32Array(arr.length);
  const K = [0.0625, 0.125, 0.0625, 0.125, 0.25, 0.125, 0.0625, 0.125, 0.0625];
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      out[i] =
        K[0] * arr[(y-1)*w+(x-1)] + K[1] * arr[(y-1)*w+x] + K[2] * arr[(y-1)*w+(x+1)] +
        K[3] * arr[ y   *w+(x-1)] + K[4] * arr[ y   *w+x] + K[5] * arr[ y   *w+(x+1)] +
        K[6] * arr[(y+1)*w+(x-1)] + K[7] * arr[(y+1)*w+x] + K[8] * arr[(y+1)*w+(x+1)];
    }
  }
  // Copy biên không đổi
  for (let x = 0; x < w; x++) { out[x] = arr[x]; out[(h-1)*w+x] = arr[(h-1)*w+x]; }
  for (let y = 0; y < h; y++) { out[y*w] = arr[y*w]; out[y*w+w-1] = arr[y*w+w-1]; }
  return out;
}

/** Nội suy tuyến tính độ dốc → điểm (tránh vệt cứng ở ngưỡng 8°/15°/25°) */
function slopeScore(sl: number): number {
  if (sl <= 5)  return 40;
  if (sl <= 10) return 40 - (sl - 5) * (10 / 5);   // 40→30
  if (sl <= 15) return 30 - (sl - 10) * (10 / 5);  // 30→20
  if (sl <= 25) return 20 - (sl - 15) * (20 / 10); // 20→0
  return 0;
}

export function computeSuitability(
  hm: Heightmap,
  slope: SlopeData,
  hydro: HydrologyData
): SuitabilityData {
  const { width: w, height: h } = hm;
  const n = w * h;
  const score = new Float32Array(n);
  const classes = new Uint8Array(n);

  // Chuẩn hoá flow accumulation log
  let maxAccumLog = 0;
  for (let i = 0; i < n; i++) {
    const v = Math.log10(1 + hydro.flowAccum[i]);
    if (v > maxAccumLog) maxAccumLog = v;
  }
  if (maxAccumLog === 0) maxAccumLog = 1;

  for (let i = 0; i < n; i++) {
    const sl = slope.slopeDeg[i];

    // VETO: dốc > 25° → đất không xây được kể cả các yếu tố khác (hướng/cao độ) tốt
    if (sl > 25) { score[i] = 0; continue; }

    // Slope factor 0..1 — nội suy tuyến tính, dùng làm hệ số nhân (multiplicative)
    // sl<=5°: factor=1; sl=15°: factor≈0.5; sl=25°: factor=0
    const slopeFactor = slopeScore(sl) / 40;

    // Thủy văn (0–30 điểm, nghịch chiều) — vùng tích nước cao = lụt
    const accumNorm = Math.log10(1 + hydro.flowAccum[i]) / maxAccumLog;
    const hydroPts = (1 - accumNorm) * 30;

    // Hướng phơi đông/nam (45–225°) — gradient 7→15 quanh ngưỡng ±15°
    const asp = slope.aspectDeg[i];
    const inFav = (asp >= 45 && asp <= 225);
    const nearBound = (asp >= 30 && asp < 45) || (asp > 225 && asp <= 240);
    const aspectPts = inFav ? 15 : nearBound ? 11 : 7;

    // Tránh đáy quá thấp — gradient thay vì bậc nhảy 0.1
    const zNorm = (hm.data[i] - hm.minZ) / Math.max(1e-6, hm.maxZ - hm.minZ);
    const zPts = zNorm < 0.05 ? 0 : zNorm < 0.15 ? (zNorm - 0.05) / 0.10 * 15 : 15;

    // Multiplicative: slope là hệ số nhân lên điểm slope (0-40) + bonus khác
    // → slope dốc => slopeFactor nhỏ => tổng score nhỏ, kể cả bonus khác cao
    const otherBonuses = hydroPts + aspectPts + zPts;
    score[i] = slopeFactor * 40 + slopeFactor * otherBonuses;
  }

  // Làm mịn score 3 passes để xóa vệt còn lại từ accumulation flow
  let smoothed: Float32Array = score;
  for (let pass = 0; pass < 3; pass++) smoothed = gaussianSmooth(smoothed, w, h);

  for (let i = 0; i < n; i++) {
    const s = smoothed[i];
    score[i] = s;
    let cls = 3;
    for (let k = 0; k < SUITABILITY_CLASSES.length; k++) {
      const [lo, hi] = SUITABILITY_CLASSES[k].range;
      if (s >= lo && s < hi) { cls = k; break; }
    }
    classes[i] = cls;
  }
  return { score, classes };
}
