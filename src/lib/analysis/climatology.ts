/**
 * Climatology: gió mùa & mưa theo vùng khí hậu Việt Nam.
 *
 * Dữ liệu thống kê đại diện theo QCVN-01 & WMO Vietnam normals.
 * Độ chính xác phù hợp phân tích định hướng quy hoạch (±15° hướng gió, ±0.5 m/s).
 */

import type { ClimateZone } from '../coord/provinces';

export interface WindClimate {
  /** Hướng gió thống trị (độ khí tượng: 0=Bắc, 90=Đông, 180=Nam, 270=Tây) */
  dominantDirDeg: number;
  /** Tốc độ gió trung bình (m/s) */
  avgSpeedMs: number;
  /** Mô tả gió tháng đó */
  label: string;
}

export interface RainfallClimate {
  /** Lượng mưa năm trung bình (mm) */
  annualMm: number;
  /** Tháng mưa nhiều nhất (1–12) */
  peakMonth: number;
  /** Các tháng mùa khô (lượng mưa <50mm/tháng) */
  dryMonths: number[];
  /** Mô tả ngắn */
  label: string;
}

// ── Bảng gió tháng theo vùng ──────────────────────────────────────────────
// [dir_deg, speed_ms, label]
type MonthRow = [number, number, string];

const WIND_TABLE: Record<ClimateZone, MonthRow[]> = {
  // Bắc Bộ: Đông Bắc mùa đông, Nam/Đông Nam mùa hè
  BB: [
    [45,  2.5, 'Gió Đông Bắc (mùa đông)'],        // T1
    [45,  2.5, 'Gió Đông Bắc (mùa đông)'],        // T2
    [90,  2.0, 'Gió Đông — chuyển mùa'],           // T3
    [135, 2.0, 'Gió Đông Nam — chuyển mùa'],       // T4
    [160, 2.5, 'Gió Nam/Đông Nam (mùa hè)'],       // T5
    [180, 3.0, 'Gió Nam (mùa mưa)'],               // T6
    [180, 3.0, 'Gió Nam (mùa mưa)'],               // T7
    [180, 2.5, 'Gió Nam (mùa mưa)'],               // T8
    [135, 2.5, 'Gió Đông Nam — chuyển mùa'],       // T9
    [45,  2.5, 'Gió Đông Bắc (đầu mùa đông)'],    // T10
    [45,  3.0, 'Gió Đông Bắc (mùa đông)'],        // T11
    [45,  3.0, 'Gió Đông Bắc (mùa đông)'],        // T12
  ],

  // Đông Bắc: giống BB nhưng gió NE mạnh hơn, ảnh hưởng biển
  DB: [
    [40,  3.5, 'Gió Đông Bắc mạnh (mùa đông)'],  // T1
    [40,  3.5, 'Gió Đông Bắc mạnh (mùa đông)'],  // T2
    [80,  2.5, 'Gió Đông — chuyển mùa'],           // T3
    [120, 2.5, 'Gió Đông Nam — chuyển mùa'],       // T4
    [150, 3.0, 'Gió Đông Nam (mùa hè)'],          // T5
    [165, 3.5, 'Gió Nam/Đông Nam (mùa mưa)'],     // T6
    [165, 3.5, 'Gió Nam/Đông Nam (mùa mưa)'],     // T7
    [160, 3.0, 'Gió Nam (mùa mưa)'],              // T8
    [120, 3.0, 'Gió Đông Nam — chuyển mùa'],       // T9
    [40,  3.5, 'Gió Đông Bắc (đầu mùa đông)'],   // T10
    [40,  4.0, 'Gió Đông Bắc mạnh (mùa đông)'],  // T11
    [40,  4.0, 'Gió Đông Bắc mạnh (mùa đông)'],  // T12
  ],

  // Bắc Trung Bộ: NE mùa đông, "gió Lào" Tây Nam khô nóng T5-8, mưa T9-10
  BTB: [
    [60,  2.5, 'Gió Đông Bắc (mùa đông)'],        // T1
    [60,  2.5, 'Gió Đông Bắc (mùa đông)'],        // T2
    [70,  2.0, 'Gió Đông Bắc — chuyển mùa'],      // T3
    [90,  2.0, 'Gió Đông — chuyển mùa'],           // T4
    [240, 4.0, 'Gió Tây Nam khô nóng (gió Lào)'], // T5
    [240, 4.5, 'Gió Tây Nam khô nóng (gió Lào)'], // T6
    [240, 4.0, 'Gió Tây Nam khô nóng (gió Lào)'], // T7
    [240, 3.5, 'Gió Tây Nam (giảm dần)'],          // T8
    [70,  3.5, 'Gió Đông — mùa mưa chính'],        // T9
    [60,  3.0, 'Gió Đông Bắc (đầu mùa đông)'],   // T10
    [60,  3.0, 'Gió Đông Bắc (mùa đông)'],        // T11
    [60,  3.0, 'Gió Đông Bắc (mùa đông)'],        // T12
  ],

  // Nam Trung Bộ: NE mạnh T10-3 (mưa bão), W-SW T5-8
  NTB: [
    [50,  3.0, 'Gió Đông Bắc (mùa khô)'],         // T1
    [50,  3.0, 'Gió Đông Bắc (mùa khô)'],         // T2
    [80,  2.5, 'Gió Đông — chuyển mùa'],           // T3
    [100, 2.5, 'Gió Đông — chuyển mùa'],           // T4
    [260, 2.5, 'Gió Tây Nam (mùa khô)'],           // T5
    [260, 2.5, 'Gió Tây Nam (mùa khô)'],           // T6
    [260, 3.0, 'Gió Tây Nam (mùa khô)'],           // T7
    [260, 2.5, 'Gió Tây/Tây Nam (chuyển mùa)'],    // T8
    [50,  3.5, 'Gió Đông Bắc (mùa mưa)'],         // T9
    [45,  4.5, 'Gió Đông Bắc mạnh (mưa bão)'],    // T10
    [45,  4.5, 'Gió Đông Bắc mạnh (mưa bão)'],    // T11
    [50,  3.5, 'Gió Đông Bắc (mùa khô bắt đầu)'], // T12
  ],

  // Tây Nguyên: NE T11-4 (mùa khô), W-SW T5-10 (mùa mưa)
  TN: [
    [50,  1.5, 'Gió Đông Bắc (mùa khô)'],          // T1
    [50,  1.5, 'Gió Đông Bắc (mùa khô)'],          // T2
    [80,  1.5, 'Gió Đông — cuối mùa khô'],          // T3
    [100, 1.5, 'Gió Đông — đầu mùa mưa'],           // T4
    [240, 2.5, 'Gió Tây Nam (mùa mưa)'],            // T5
    [240, 3.0, 'Gió Tây Nam (mùa mưa)'],            // T6
    [240, 3.0, 'Gió Tây Nam (mùa mưa)'],            // T7
    [240, 2.5, 'Gió Tây Nam (mùa mưa)'],            // T8
    [240, 2.0, 'Gió Tây Nam (mùa mưa)'],            // T9
    [240, 2.0, 'Gió Tây/Tây Nam — chuyển mùa'],     // T10
    [50,  2.0, 'Gió Đông Bắc (đầu mùa khô)'],      // T11
    [50,  2.0, 'Gió Đông Bắc (mùa khô)'],           // T12
  ],

  // Nam Bộ: SW T5-10 (mùa mưa), NE T11-4 (mùa khô)
  NB: [
    [50,  2.5, 'Gió Đông Bắc (mùa khô)'],          // T1
    [50,  2.5, 'Gió Đông Bắc (mùa khô)'],          // T2
    [90,  2.0, 'Gió Đông — chuyển mùa'],            // T3
    [120, 2.0, 'Gió Đông Nam — đầu mùa mưa'],       // T4
    [225, 3.5, 'Gió Tây Nam (mùa mưa)'],            // T5
    [225, 4.0, 'Gió Tây Nam (mùa mưa)'],            // T6
    [225, 4.0, 'Gió Tây Nam (mùa mưa)'],            // T7
    [225, 3.5, 'Gió Tây Nam (mùa mưa)'],            // T8
    [225, 3.0, 'Gió Tây Nam (mùa mưa)'],            // T9
    [50,  3.0, 'Gió Đông Bắc (chuyển mùa)'],        // T10
    [50,  3.0, 'Gió Đông Bắc (mùa khô)'],           // T11
    [50,  3.0, 'Gió Đông Bắc (mùa khô)'],           // T12
  ],
};

/**
 * Trả về gió thống trị theo vùng khí hậu + tháng (1–12).
 * `dominantDirDeg` là hướng gió thổi TỪ (meteorological convention).
 */
export function getWindClimate(zone: ClimateZone, month: number): WindClimate {
  const idx = Math.max(0, Math.min(11, month - 1));
  const [dir, spd, lbl] = WIND_TABLE[zone][idx];
  return { dominantDirDeg: dir, avgSpeedMs: spd, label: lbl };
}

// ── Bảng mưa theo vùng ───────────────────────────────────────────────────
const RAINFALL_TABLE: Record<ClimateZone, RainfallClimate> = {
  BB:  { annualMm: 1800, peakMonth: 7,  dryMonths: [12, 1, 2, 3],   label: 'Mưa tập trung T5–9; đông khô lạnh' },
  DB:  { annualMm: 2200, peakMonth: 8,  dryMonths: [12, 1, 2],       label: 'Mưa nhiều T6–9; ẩm hơn vùng BB' },
  BTB: { annualMm: 1700, peakMonth: 9,  dryMonths: [6, 7],           label: 'Mưa T9–11; gió Lào khô nóng T5–8' },
  NTB: { annualMm: 1600, peakMonth: 10, dryMonths: [1, 2, 3, 4, 5], label: 'Mưa bão T10–12; hạn nặng T2–8' },
  TN:  { annualMm: 2000, peakMonth: 7,  dryMonths: [1, 2, 3],        label: 'Mưa T5–10; mùa khô T11–4 rõ rệt' },
  NB:  { annualMm: 1900, peakMonth: 9,  dryMonths: [1, 2, 3, 4],    label: 'Mưa T5–10; mùa khô T11–4' },
};

/** Trả về đặc điểm mưa theo vùng khí hậu. */
export function getRainfallClimate(zone: ClimateZone): RainfallClimate {
  return RAINFALL_TABLE[zone];
}

/** Mô tả vắn tắt vùng khí hậu (dùng trong report). */
export function climateZoneDescription(zone: ClimateZone): string {
  const descs: Record<ClimateZone, string> = {
    BB:  'Nhiệt đới gió mùa ẩm; 4 mùa rõ rệt, đông lạnh',
    DB:  'Nhiệt đới gió mùa ẩm, ảnh hưởng biển; đông lạnh, mưa nhiều hè',
    BTB: 'Nhiệt đới gió mùa chuyển tiếp; gió Lào khô nóng, mưa bão thu-đông',
    NTB: 'Nhiệt đới khô ven biển; hạn nặng, mưa bão thu-đông',
    TN:  'Nhiệt đới cao nguyên; mùa mưa–khô rõ, biên độ nhiệt ngày lớn',
    NB:  'Nhiệt đới nóng quanh năm; 2 mùa mưa–khô phân biệt',
  };
  return descs[zone];
}
