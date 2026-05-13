/**
 * VN-2000 ↔ WGS-84 lat/lon converter (inverse Transverse Mercator).
 *
 * VN-2000 dùng Transverse Mercator với:
 *  - Ellipsoid: WGS-84 (a=6378137, f=1/298.257223563) — VN-2000 datum sai khác
 *    vài cm so với WGS-84, không quan trọng cho phân tích quy hoạch
 *  - 8 kinh tuyến trục có thể: 102°, 103°, 104°30', 105°, 105°30',
 *    106°, 107°30', 108°30'
 *  - False easting 500000m, false northing 0
 *  - Scale factor k0 = 0.9996 cho 6° zone, 0.9999 cho 3° zone
 *
 * File này không phụ thuộc proj4js — code Krüger series ~30 dòng,
 * sai số <1m cho mọi vùng VN.
 */

const A = 6378137; // semi-major axis WGS-84 (m)
const F = 1 / 298.257223563;
const E2 = 2 * F - F * F; // first eccentricity squared
const EP2 = E2 / (1 - E2); // second eccentricity squared

export interface VN2000Options {
  /** Kinh tuyến trục (degrees). Mặc định: 105 */
  centralMeridian?: number;
  /** Scale factor. Mặc định: 0.9996 (6° zone) */
  k0?: number;
  /** False easting. Mặc định: 500000 */
  falseEasting?: number;
  /** False northing. Mặc định: 0 */
  falseNorthing?: number;
}

const DEFAULT_OPTS: Required<VN2000Options> = {
  centralMeridian: 105,
  k0: 0.9996,
  falseEasting: 500000,
  falseNorthing: 0,
};

/** Inverse Transverse Mercator: (E, N) → (lat, lon) bằng độ */
export function vn2000ToLatLon(
  easting: number,
  northing: number,
  opts?: VN2000Options,
): { lat: number; lon: number } {
  const o = { ...DEFAULT_OPTS, ...opts };
  const lambda0 = (o.centralMeridian * Math.PI) / 180;

  const x = (easting - o.falseEasting) / o.k0;
  const M = (northing - o.falseNorthing) / o.k0;

  // Footpoint latitude (Snyder eq. 7-19)
  const mu =
    M / (A * (1 - E2 / 4 - (3 * E2 * E2) / 64 - (5 * E2 * E2 * E2) / 256));

  const e1 = (1 - Math.sqrt(1 - E2)) / (1 + Math.sqrt(1 - E2));
  const e1_2 = e1 * e1;
  const e1_3 = e1_2 * e1;
  const e1_4 = e1_3 * e1;

  const phi1 =
    mu +
    ((3 * e1) / 2 - (27 * e1_3) / 32) * Math.sin(2 * mu) +
    ((21 * e1_2) / 16 - (55 * e1_4) / 32) * Math.sin(4 * mu) +
    ((151 * e1_3) / 96) * Math.sin(6 * mu) +
    ((1097 * e1_4) / 512) * Math.sin(8 * mu);

  const sinPhi1 = Math.sin(phi1);
  const cosPhi1 = Math.cos(phi1);
  const tanPhi1 = Math.tan(phi1);

  const C1 = EP2 * cosPhi1 * cosPhi1;
  const T1 = tanPhi1 * tanPhi1;
  const N1 = A / Math.sqrt(1 - E2 * sinPhi1 * sinPhi1);
  const R1 = (A * (1 - E2)) / Math.pow(1 - E2 * sinPhi1 * sinPhi1, 1.5);
  const D = x / N1;

  const D2 = D * D;
  const D3 = D2 * D;
  const D4 = D2 * D2;
  const D5 = D4 * D;
  const D6 = D5 * D;

  const phi =
    phi1 -
    ((N1 * tanPhi1) / R1) *
      (D2 / 2 -
        ((5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * EP2) * D4) / 24 +
        ((61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * EP2 - 3 * C1 * C1) *
          D6) /
          720);

  const lambda =
    lambda0 +
    (D -
      ((1 + 2 * T1 + C1) * D3) / 6 +
      ((5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * EP2 + 24 * T1 * T1) * D5) /
        120) /
      cosPhi1;

  return {
    lat: (phi * 180) / Math.PI,
    lon: (lambda * 180) / Math.PI,
  };
}

/** Bbox của Việt Nam (mở rộng 0.5° mỗi chiều để không bỏ sót biên giới) */
const VN_BBOX = { minLat: 7.5, maxLat: 24.0, minLon: 101.5, maxLon: 110.5 };

/** Các kinh tuyến trục VN-2000 phổ biến nhất (6°, 3°, và zone địa phương 1.5°) */
const CANDIDATE_MERIDIANS: { meridian: number; k0: number; label: string }[] = [
  { meridian: 105,   k0: 0.9996, label: "105° (6° zone, quốc gia)" },
  { meridian: 105,   k0: 0.9999, label: "105° (3° zone)" },
  { meridian: 105.5, k0: 0.9999, label: "105°30' (3° zone)" },
  { meridian: 106,   k0: 0.9999, label: "106° (3° zone, miền Nam)" },
  { meridian: 107.5, k0: 0.9999, label: "107°30' (3° zone, đông VN)" },
  { meridian: 107.75, k0: 0.9999, label: "107°45' (zone địa phương Lâm Đồng)" },
  { meridian: 108.25, k0: 0.9999, label: "108°15' (zone địa phương Khánh Hoà)" },
  { meridian: 108.5, k0: 0.9999, label: "108°30' (3° zone, ven biển Trung)" },
  { meridian: 104.5, k0: 0.9999, label: "104°30' (3° zone, tây VN)" },
  { meridian: 103,   k0: 0.9999, label: "103° (3° zone, Sơn La)" },
  { meridian: 102,   k0: 0.9999, label: "102° (3° zone, Lai Châu)" },
];

export interface DetectedZone {
  centralMeridian: number;
  k0: number;
  label: string;
  lat: number;
  lon: number;
  /** 0–1, càng cao càng tin */
  confidence: number;
  /** Có thuộc một tỉnh nào không (đã verify với provinces.ts) */
  matchedProvince?: string;
}

/** Bbox tỉnh để verify zone detection (subset của provinces.ts) */
const PROVINCE_BBOXES: Array<{ name: string; minLat: number; maxLat: number; minLon: number; maxLon: number }> = [
  // Các tỉnh có zone địa phương đặc biệt (108°+ lon)
  { name: 'Lâm Đồng',   minLat: 10.3, maxLat: 12.8, minLon: 107.2, maxLon: 108.9 },
  { name: 'Khánh Hoà',  minLat: 11.2, maxLat: 13.1, minLon: 108.4, maxLon: 109.5 },
  { name: 'Đà Nẵng',    minLat: 14.8, maxLat: 16.2, minLon: 107.3, maxLon: 108.9 },
  { name: 'Đồng Nai',   minLat: 10.5, maxLat: 12.4, minLon: 106.3, maxLon: 107.8 },
];

/**
 * Đoán kinh tuyến trục VN-2000 từ một điểm (E, N).
 *
 * Thuật toán mới (sau bug Lâm Đồng → Đồng Nai):
 *  1. Thử TẤT CẢ candidate meridians
 *  2. Lọc lấy candidates có lat/lon nằm trong VN bbox
 *  3. Ưu tiên candidate có lon CÁCH XA central meridian của mình ÍT NHẤT
 *     (logic: zone đúng = file ở gần trục, sai zone = file đi xa khỏi trục)
 *  4. Trong các candidate equal-tier, ưu tiên cái match được tên tỉnh
 *
 * BUG cũ: dùng confidence = lonCenter (gần CM của mình) làm tiêu chí chính
 *   → zone SAI vẫn có thể có lon gần CM của zone đó, gây nhầm lẫn
 */
export function detectVN2000Zone(easting: number, northing: number): DetectedZone | null {
  if (Math.abs(easting) < 1000 && Math.abs(northing) < 1000) return null;

  // Xử lý easting có tiền tố zone (vd 18500000, 19500000 → lấy 6 chữ số cuối)
  let e = easting;
  if (e > 1_000_000) {
    let tmp = e;
    while (tmp > 900_000) tmp = tmp % 1_000_000;
    if (tmp > 100_000 && tmp < 900_000) e = tmp;
  }

  const candidates: DetectedZone[] = [];

  for (const c of CANDIDATE_MERIDIANS) {
    const { lat, lon } = vn2000ToLatLon(e, northing, {
      centralMeridian: c.meridian,
      k0: c.k0,
    });
    const inVN =
      lat >= VN_BBOX.minLat && lat <= VN_BBOX.maxLat &&
      lon >= VN_BBOX.minLon && lon <= VN_BBOX.maxLon;
    if (!inVN) continue;

    // Tìm tỉnh match
    const province = PROVINCE_BBOXES.find(p =>
      lat >= p.minLat && lat <= p.maxLat && lon >= p.minLon && lon <= p.maxLon
    );

    // Confidence: ưu tiên (1) match tỉnh, (2) easting gần 500k (file CAD ít khi xa trục >100km)
    const provinceBonus = province ? 0.5 : 0;
    const easCenter = 1 - Math.min(1, Math.abs(e - 500000) / 200000);
    // Nếu lon nằm trong khoảng 3° của CM (±1.5°), zone hợp lý
    const lonInZone = Math.abs(lon - c.meridian) <= 1.5 ? 0.3 : 0;
    const confidence = provinceBonus + easCenter * 0.2 + lonInZone;

    candidates.push({
      centralMeridian: c.meridian,
      k0: c.k0,
      label: c.label,
      lat,
      lon,
      confidence,
      matchedProvince: province?.name,
    });
  }

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.confidence - a.confidence);

  // Debug: log top 3 candidates để dễ chẩn đoán
  console.log('[VN2000] Top 3 candidates:',
    candidates.slice(0, 3).map(c => ({
      meridian: c.centralMeridian,
      lat: c.lat.toFixed(3),
      lon: c.lon.toFixed(3),
      province: c.matchedProvince ?? '(không match)',
      conf: c.confidence.toFixed(2),
    }))
  );

  return candidates[0];
}
