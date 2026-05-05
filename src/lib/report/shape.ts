import type { Heightmap } from '../types';
import type { TerrainFeatures } from '../analysis/features';
import type { SlopeData } from '../analysis/slope';
import type { AspectHistogram } from './stats';
import { histogramSlopeClass, terrainArea } from './stats';

export type TerrainShape =
  | 'flat'         // Bằng phẳng
  | 'turtle_back'  // Mai rùa (đỉnh giữa, sườn ra xung quanh)
  | 'basin'        // Lòng chảo (đáy giữa)
  | 'slope'        // Sườn dốc 1 hướng
  | 'peak'         // Đỉnh núi nhọn
  | 'ridge'        // Sống núi kéo dài
  | 'valley'       // Thung lũng
  | 'complex';     // Phức tạp

export interface ShapeResult {
  shape: TerrainShape;
  label: string;       // tên tiếng Việt
  description: string; // 1-2 câu mô tả chi tiết
  confidence: number;  // 0-1
}

const SHAPE_LABELS: Record<TerrainShape, string> = {
  flat:        'Bằng phẳng',
  turtle_back: 'Mai rùa',
  basin:       'Lòng chảo',
  slope:       'Sườn dốc',
  peak:        'Đỉnh núi',
  ridge:       'Sống núi',
  valley:      'Thung lũng',
  complex:     'Đa địa hình',
};

export function detectTerrainShape(
  hm: Heightmap,
  features: TerrainFeatures,
  slope: SlopeData,
  aspect: AspectHistogram,
): ShapeResult {
  const area = terrainArea(hm);
  const slopeHist = histogramSlopeClass(slope.classes, hm.mask, 8);

  // Tổng % vùng phẳng (slope < 5°)
  // Class index 0 = lớp đầu tiên (luôn là 0–5° hoặc 0–10%). Nó luôn = "phẳng".
  const flatPct = slopeHist.pct[0] ?? 0;

  // Tỉ lệ peaks vs pits (để phân biệt mai rùa vs lòng chảo)
  const peakDensity = features.peaks.length / Math.max(0.1, area);
  const pitDensity  = features.pits.length  / Math.max(0.1, area);

  // Aspect concentration: nếu 1 hướng > 35% → sườn dốc
  const aspectMaxPct = Math.max(...Object.values(aspect.pct));
  const aspectSpread = aspectMaxPct;

  // Average elevation Z relative position (đỉnh giữa hay đáy giữa?)
  const centerVsMean = computeCenterTendency(hm);

  // ── Quyết định ──────────────────────────────────────────────────────────
  // 1. Bằng phẳng: > 70% slope < 5°
  if (flatPct > 70) {
    return {
      shape: 'flat',
      label: SHAPE_LABELS.flat,
      description: `Khu vực địa hình ${SHAPE_LABELS.flat.toLowerCase()}, ${flatPct.toFixed(0)}% diện tích có độ dốc dưới 5°. Phù hợp cho hầu hết loại hình xây dựng.`,
      confidence: Math.min(1, flatPct / 100 + 0.2),
    };
  }

  // 2. Sườn dốc một hướng: aspect > 40% tập trung 1 hướng + slope đa số > 10°
  if (aspectSpread > 40 && flatPct < 20) {
    const dirVi = vietnameseDir(aspect.dominant);
    return {
      shape: 'slope',
      label: SHAPE_LABELS.slope,
      description: `Địa hình ${SHAPE_LABELS.slope.toLowerCase()} hướng ${dirVi} (${aspectSpread.toFixed(0)}% diện tích phơi cùng hướng). Sườn dốc đồng đều, thoát nước tốt một chiều.`,
      confidence: Math.min(1, aspectSpread / 60),
    };
  }

  // 3. Mai rùa: peakDensity cao, pitDensity thấp, center cao hơn mean, aspect đa hướng
  if (peakDensity >= 0.5 && peakDensity > pitDensity * 1.5 && centerVsMean > 0.1 && aspectSpread < 35) {
    return {
      shape: 'turtle_back',
      label: SHAPE_LABELS.turtle_back,
      description: `Địa hình dạng ${SHAPE_LABELS.turtle_back.toLowerCase()} với ${features.peaks.length} đỉnh tập trung phần trung tâm, sườn đổ ra mọi phía. Đặc trưng đồi núi vùng Tây Bắc.`,
      confidence: 0.7,
    };
  }

  // 4. Lòng chảo: pitDensity > peakDensity, center thấp hơn mean
  if (pitDensity > peakDensity && centerVsMean < -0.1) {
    return {
      shape: 'basin',
      label: SHAPE_LABELS.basin,
      description: `Địa hình dạng ${SHAPE_LABELS.basin.toLowerCase()}, đáy ở trung tâm. Có nguy cơ tích tụ nước, cần thiết kế hệ thống thoát nước.`,
      confidence: 0.6,
    };
  }

  // 5. Đỉnh núi: 1-3 đỉnh, slope toàn bộ > 15°
  const steepPct = (slopeHist.pct.slice(2).reduce((s, v) => s + v, 0));
  if (features.peaks.length <= 3 && steepPct > 60 && centerVsMean > 0.2) {
    return {
      shape: 'peak',
      label: SHAPE_LABELS.peak,
      description: `Địa hình ${SHAPE_LABELS.peak.toLowerCase()} với ${features.peaks.length} đỉnh chính, ${steepPct.toFixed(0)}% diện tích dốc trên 15°. Phù hợp cảnh quan, ít phù hợp xây dựng quy mô lớn.`,
      confidence: 0.65,
    };
  }

  // 6. Sống núi: ridges chiếm tỉ lệ cao + extent dài theo 1 chiều
  const ridgePct = countMask(features.ridges) / hm.data.length * 100;
  if (ridgePct > 8 && features.peaks.length > 1) {
    return {
      shape: 'ridge',
      label: SHAPE_LABELS.ridge,
      description: `Địa hình ${SHAPE_LABELS.ridge.toLowerCase()} kéo dài, có ${features.peaks.length} đỉnh nối nhau. Sườn đổ về hai phía của sống.`,
      confidence: 0.6,
    };
  }

  // 7. Thung lũng: valleys cao + center thấp
  const valleyPct = countMask(features.valleys) / hm.data.length * 100;
  if (valleyPct > 8 && centerVsMean < -0.05) {
    return {
      shape: 'valley',
      label: SHAPE_LABELS.valley,
      description: `Địa hình ${SHAPE_LABELS.valley.toLowerCase()}, lòng chính chạy theo địa hình. Thoát nước tự nhiên dọc theo trục thung lũng.`,
      confidence: 0.55,
    };
  }

  // Default: complex
  return {
    shape: 'complex',
    label: SHAPE_LABELS.complex,
    description: `Địa hình ${SHAPE_LABELS.complex.toLowerCase()} với ${features.peaks.length} đỉnh, ${features.pits.length} đáy. Cần phân tích chi tiết theo từng tiểu khu.`,
    confidence: 0.4,
  };
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Trả về chỉ số xu hướng cao độ trung tâm:
 * > 0  : trung tâm cao hơn rìa (mai rùa / đỉnh)
 * < 0  : trung tâm thấp hơn rìa (lòng chảo / thung lũng)
 *  = 0 : đồng đều
 * Giá trị normalized (-1 đến 1)
 */
function computeCenterTendency(hm: Heightmap): number {
  const { width: w, height: h, data, mask, minZ, maxZ } = hm;
  const range = Math.max(1e-6, maxZ - minZ);
  const cx = w / 2, cy = h / 2;
  const innerR = Math.min(w, h) * 0.25;
  const outerRMin = Math.min(w, h) * 0.4;

  let innerSum = 0, innerN = 0;
  let outerSum = 0, outerN = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (mask && !mask[i]) continue;
      const r = Math.hypot(x - cx, y - cy);
      if (r < innerR) {
        innerSum += data[i]; innerN++;
      } else if (r > outerRMin) {
        outerSum += data[i]; outerN++;
      }
    }
  }
  if (innerN === 0 || outerN === 0) return 0;
  const innerMean = innerSum / innerN;
  const outerMean = outerSum / outerN;
  return (innerMean - outerMean) / range;
}

function countMask(arr: number[]): number {
  let n = 0;
  for (const v of arr) if (v) n++;
  return n;
}

function vietnameseDir(d: string): string {
  const map: Record<string, string> = {
    N: 'Bắc', NE: 'Đông Bắc', E: 'Đông', SE: 'Đông Nam',
    S: 'Nam', SW: 'Tây Nam', W: 'Tây', NW: 'Tây Bắc',
  };
  return map[d] ?? d;
}
