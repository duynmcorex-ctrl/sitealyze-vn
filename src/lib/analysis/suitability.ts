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

export interface SuitabilityOptions {
  /** Bật phạt vùng ngập (Z < waterLevel × 0.3, gần mặt nước × 0.5-1.0).
   *  Khắc phục lỗi: thung lũng phẳng được điểm cao dù dễ ngập. */
  applyFloodPenalty?: boolean;
  /** Mực nước mô phỏng từ flood mode (m). Nếu không truyền/<minZ:
   *  fallback dùng percentile 5% heightmap (proxy cho lòng sông/đáy thấp). */
  waterLevel?: number;
}

/** Compute distance-to-water mask: cells với Z ≤ waterZ HOẶC mask=0 */
function buildDistToWater(hm: Heightmap, waterZ: number): Float32Array {
  const n = hm.width * hm.height;
  const dist = new Float32Array(n);
  const INF = Infinity;
  for (let i = 0; i < n; i++) {
    const z = hm.data[i];
    dist[i] = (!Number.isFinite(z) || z <= waterZ) ? 0 : INF;
  }
  // 2-pass Chamfer 3-4 distance transform
  const w = hm.width, h = hm.height;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (dist[i] === 0) continue;
      let d = dist[i];
      if (y > 0)             d = Math.min(d, dist[(y-1)*w + x] + 1);
      if (x > 0)             d = Math.min(d, dist[ y   *w + x-1] + 1);
      if (x > 0 && y > 0)    d = Math.min(d, dist[(y-1)*w + x-1] + 1.4142);
      if (x < w-1 && y > 0)  d = Math.min(d, dist[(y-1)*w + x+1] + 1.4142);
      dist[i] = d;
    }
  }
  for (let y = h - 1; y >= 0; y--) {
    for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x;
      if (dist[i] === 0) continue;
      let d = dist[i];
      if (y < h-1)              d = Math.min(d, dist[(y+1)*w + x] + 1);
      if (x < w-1)              d = Math.min(d, dist[ y   *w + x+1] + 1);
      if (x < w-1 && y < h-1)   d = Math.min(d, dist[(y+1)*w + x+1] + 1.4142);
      if (x > 0 && y < h-1)     d = Math.min(d, dist[(y+1)*w + x-1] + 1.4142);
      dist[i] = d;
    }
  }
  for (let i = 0; i < n; i++) {
    if (dist[i] === INF) dist[i] = 1e6;
    else dist[i] *= hm.cellSize;
  }
  return dist;
}

/** Quantile của Z thực (loại NaN) */
function quantileZ(hm: Heightmap, q: number): number {
  const arr: number[] = [];
  for (let i = 0; i < hm.data.length; i++) {
    const z = hm.data[i];
    if (Number.isFinite(z)) arr.push(z);
  }
  if (arr.length === 0) return hm.minZ;
  arr.sort((a, b) => a - b);
  const idx = Math.min(arr.length - 1, Math.max(0, Math.floor(arr.length * q)));
  return arr[idx];
}

export function computeSuitability(
  hm: Heightmap,
  slope: SlopeData,
  hydro: HydrologyData,
  opt: SuitabilityOptions = {},
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

  // ── Flood-aware penalty (cải tiến mới) ─────────────────────────────────
  // Lấy waterZ: ưu tiên waterLevel từ flood mode; nếu không có → percentile 5%
  // (proxy cho đáy thấp / lòng sông). distToWater cho mỗi cell tính qua BFS.
  const applyFlood = opt.applyFloodPenalty !== false;
  const lowQ = quantileZ(hm, 0.05);
  const waterZ = (typeof opt.waterLevel === 'number' && opt.waterLevel > hm.minZ)
    ? opt.waterLevel : lowQ;
  const distWater = applyFlood ? buildDistToWater(hm, waterZ) : null;

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
    let s = slopeFactor * 40 + slopeFactor * otherBonuses;

    // ── Flood penalty (cải tiến) ────────────────────────────────────────
    if (applyFlood && distWater) {
      const z = hm.data[i];
      // Cell dưới mực nước → giảm điểm mạnh
      if (Number.isFinite(z) && z < waterZ) {
        s *= 0.3;
      } else {
        // Cell trong 30m từ mặt nước → smooth penalty 0.5..1.0
        const d = distWater[i];
        if (d < 30) {
          s *= 0.5 + 0.5 * (d / 30);
        }
      }
    }

    score[i] = s;
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
