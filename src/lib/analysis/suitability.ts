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

export function computeSuitability(
  hm: Heightmap,
  slope: SlopeData,
  hydro: HydrologyData
): SuitabilityData {
  const n = hm.width * hm.height;
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
    let s = 0;
    const sl = slope.slopeDeg[i];
    if (sl < 8) s += 40;
    else if (sl < 15) s += 25;
    else if (sl < 25) s += 10;

    const accumNorm = Math.log10(1 + hydro.flowAccum[i]) / maxAccumLog;
    s += (1 - accumNorm) * 30;

    // Aspect đông/nam (45–225° nhận điểm)
    const asp = slope.aspectDeg[i];
    if (asp >= 45 && asp <= 225) s += 15;
    else s += 7;

    // Tránh đáy quá thấp (top 10% z)
    const zNorm = (hm.data[i] - hm.minZ) / Math.max(1e-6, hm.maxZ - hm.minZ);
    if (zNorm > 0.1) s += 15;

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
