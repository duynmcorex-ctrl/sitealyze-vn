/**
 * Dữ liệu 63 tỉnh/thành Việt Nam: bbox WGS-84 xấp xỉ + vùng khí hậu.
 *
 * Vùng khí hậu theo phân vùng xây dựng VN (6 vùng):
 *  BB  = Bắc Bộ (Tây Bắc + đồng bằng sông Hồng)
 *  DB  = Đông Bắc Bộ (Quảng Ninh, Lạng Sơn, Cao Bằng, Hà Giang …)
 *  BTB = Bắc Trung Bộ (Thanh Hóa → Thừa Thiên Huế)
 *  NTB = Nam Trung Bộ (Đà Nẵng → Bình Thuận, ven biển)
 *  TN  = Tây Nguyên
 *  NB  = Nam Bộ (Đông Nam Bộ + đồng bằng sông Cửu Long)
 */

export type ClimateZone = 'BB' | 'DB' | 'BTB' | 'NTB' | 'TN' | 'NB';

export interface Province {
  name: string;
  bbox: { minLat: number; maxLat: number; minLon: number; maxLon: number };
  climateZone: ClimateZone;
}

/** 63 tỉnh/thành phố trực thuộc TW */
export const PROVINCES: Province[] = [
  // ── Bắc Bộ (BB) ──────────────────────────────────────────────────────────
  { name: 'Lai Châu',   bbox: { minLat: 21.7, maxLat: 22.9, minLon: 102.1, maxLon: 103.6 }, climateZone: 'BB' },
  { name: 'Điện Biên',  bbox: { minLat: 20.7, maxLat: 22.6, minLon: 102.1, maxLon: 103.6 }, climateZone: 'BB' },
  { name: 'Sơn La',     bbox: { minLat: 20.5, maxLat: 21.8, minLon: 103.2, maxLon: 105.0 }, climateZone: 'BB' },
  { name: 'Lào Cai',    bbox: { minLat: 21.9, maxLat: 22.9, minLon: 103.3, maxLon: 104.5 }, climateZone: 'BB' },
  { name: 'Yên Bái',    bbox: { minLat: 21.4, maxLat: 22.3, minLon: 103.7, maxLon: 105.0 }, climateZone: 'BB' },
  { name: 'Tuyên Quang',bbox: { minLat: 21.5, maxLat: 22.7, minLon: 104.7, maxLon: 105.7 }, climateZone: 'BB' },
  { name: 'Phú Thọ',    bbox: { minLat: 21.0, maxLat: 21.9, minLon: 104.6, maxLon: 105.5 }, climateZone: 'BB' },
  { name: 'Thái Nguyên',bbox: { minLat: 21.2, maxLat: 22.0, minLon: 105.4, maxLon: 106.3 }, climateZone: 'BB' },
  { name: 'Vĩnh Phúc',  bbox: { minLat: 21.1, maxLat: 21.5, minLon: 105.4, maxLon: 105.9 }, climateZone: 'BB' },
  { name: 'Hòa Bình',   bbox: { minLat: 20.2, maxLat: 21.1, minLon: 104.6, maxLon: 105.9 }, climateZone: 'BB' },
  { name: 'Hà Nội',     bbox: { minLat: 20.5, maxLat: 21.4, minLon: 105.3, maxLon: 106.1 }, climateZone: 'BB' },
  { name: 'Bắc Ninh',   bbox: { minLat: 21.0, maxLat: 21.3, minLon: 106.0, maxLon: 106.5 }, climateZone: 'BB' },
  { name: 'Hưng Yên',   bbox: { minLat: 20.6, maxLat: 21.0, minLon: 105.9, maxLon: 106.3 }, climateZone: 'BB' },
  { name: 'Hà Nam',     bbox: { minLat: 20.4, maxLat: 20.7, minLon: 105.8, maxLon: 106.2 }, climateZone: 'BB' },
  { name: 'Hải Dương',  bbox: { minLat: 20.7, maxLat: 21.2, minLon: 106.2, maxLon: 106.8 }, climateZone: 'BB' },
  { name: 'Thái Bình',  bbox: { minLat: 20.1, maxLat: 20.7, minLon: 106.1, maxLon: 106.7 }, climateZone: 'BB' },
  { name: 'Nam Định',   bbox: { minLat: 19.9, maxLat: 20.5, minLon: 105.9, maxLon: 106.6 }, climateZone: 'BB' },
  { name: 'Ninh Bình',  bbox: { minLat: 19.9, maxLat: 20.5, minLon: 105.6, maxLon: 106.2 }, climateZone: 'BB' },
  { name: 'Hải Phòng',  bbox: { minLat: 20.5, maxLat: 21.2, minLon: 106.5, maxLon: 107.2 }, climateZone: 'BB' },

  // ── Đông Bắc Bộ (DB) ─────────────────────────────────────────────────────
  { name: 'Hà Giang',   bbox: { minLat: 22.1, maxLat: 23.5, minLon: 104.4, maxLon: 105.6 }, climateZone: 'DB' },
  { name: 'Cao Bằng',   bbox: { minLat: 22.4, maxLat: 23.2, minLon: 105.3, maxLon: 106.6 }, climateZone: 'DB' },
  { name: 'Bắc Kạn',    bbox: { minLat: 21.9, maxLat: 22.7, minLon: 105.4, maxLon: 106.2 }, climateZone: 'DB' },
  { name: 'Lạng Sơn',   bbox: { minLat: 21.4, maxLat: 22.6, minLon: 106.1, maxLon: 107.2 }, climateZone: 'DB' },
  { name: 'Bắc Giang',  bbox: { minLat: 21.1, maxLat: 21.7, minLon: 105.9, maxLon: 107.0 }, climateZone: 'DB' },
  { name: 'Quảng Ninh', bbox: { minLat: 20.7, maxLat: 21.7, minLon: 106.4, maxLon: 108.1 }, climateZone: 'DB' },

  // ── Bắc Trung Bộ (BTB) ───────────────────────────────────────────────────
  { name: 'Thanh Hóa',       bbox: { minLat: 19.2, maxLat: 20.7, minLon: 104.4, maxLon: 106.1 }, climateZone: 'BTB' },
  { name: 'Nghệ An',         bbox: { minLat: 18.3, maxLat: 20.0, minLon: 103.7, maxLon: 105.8 }, climateZone: 'BTB' },
  { name: 'Hà Tĩnh',         bbox: { minLat: 17.7, maxLat: 19.0, minLon: 104.6, maxLon: 106.3 }, climateZone: 'BTB' },
  { name: 'Quảng Bình',      bbox: { minLat: 16.9, maxLat: 18.2, minLon: 105.1, maxLon: 106.7 }, climateZone: 'BTB' },
  { name: 'Quảng Trị',       bbox: { minLat: 16.2, maxLat: 17.2, minLon: 106.3, maxLon: 107.4 }, climateZone: 'BTB' },
  { name: 'Thừa Thiên Huế',  bbox: { minLat: 15.9, maxLat: 16.9, minLon: 107.1, maxLon: 108.3 }, climateZone: 'BTB' },

  // ── Nam Trung Bộ (NTB) ───────────────────────────────────────────────────
  { name: 'Đà Nẵng',    bbox: { minLat: 15.8, maxLat: 16.2, minLon: 107.9, maxLon: 108.6 }, climateZone: 'NTB' },
  { name: 'Quảng Nam',  bbox: { minLat: 14.8, maxLat: 16.1, minLon: 107.3, maxLon: 108.9 }, climateZone: 'NTB' },
  { name: 'Quảng Ngãi', bbox: { minLat: 14.4, maxLat: 15.5, minLon: 108.1, maxLon: 109.1 }, climateZone: 'NTB' },
  { name: 'Bình Định',  bbox: { minLat: 13.5, maxLat: 14.6, minLon: 108.4, maxLon: 109.5 }, climateZone: 'NTB' },
  { name: 'Phú Yên',    bbox: { minLat: 12.7, maxLat: 13.7, minLon: 108.7, maxLon: 109.6 }, climateZone: 'NTB' },
  { name: 'Khánh Hòa',  bbox: { minLat: 11.8, maxLat: 13.1, minLon: 108.4, maxLon: 109.5 }, climateZone: 'NTB' },
  { name: 'Ninh Thuận', bbox: { minLat: 11.2, maxLat: 12.2, minLon: 108.4, maxLon: 109.2 }, climateZone: 'NTB' },
  { name: 'Bình Thuận', bbox: { minLat: 10.3, maxLat: 11.7, minLon: 107.3, maxLon: 108.9 }, climateZone: 'NTB' },

  // ── Tây Nguyên (TN) ───────────────────────────────────────────────────────
  { name: 'Kon Tum',   bbox: { minLat: 13.4, maxLat: 15.4, minLon: 107.2, maxLon: 108.8 }, climateZone: 'TN' },
  { name: 'Gia Lai',   bbox: { minLat: 12.8, maxLat: 14.6, minLon: 107.4, maxLon: 109.0 }, climateZone: 'TN' },
  { name: 'Đắk Lắk',  bbox: { minLat: 11.8, maxLat: 13.5, minLon: 107.5, maxLon: 108.9 }, climateZone: 'TN' },
  { name: 'Đắk Nông', bbox: { minLat: 11.3, maxLat: 12.8, minLon: 107.2, maxLon: 108.3 }, climateZone: 'TN' },
  { name: 'Lâm Đồng', bbox: { minLat: 11.0, maxLat: 12.7, minLon: 107.3, maxLon: 108.9 }, climateZone: 'TN' },

  // ── Nam Bộ (NB) ──────────────────────────────────────────────────────────
  { name: 'Bình Phước',         bbox: { minLat: 11.2, maxLat: 12.4, minLon: 106.3, maxLon: 107.5 }, climateZone: 'NB' },
  { name: 'Tây Ninh',           bbox: { minLat: 10.9, maxLat: 11.9, minLon: 105.7, maxLon: 106.6 }, climateZone: 'NB' },
  { name: 'Bình Dương',         bbox: { minLat: 10.7, maxLat: 11.5, minLon: 106.3, maxLon: 107.0 }, climateZone: 'NB' },
  { name: 'Đồng Nai',           bbox: { minLat: 10.5, maxLat: 11.6, minLon: 106.8, maxLon: 107.8 }, climateZone: 'NB' },
  { name: 'Bà Rịa - Vũng Tàu', bbox: { minLat: 10.2, maxLat: 11.0, minLon: 107.0, maxLon: 107.8 }, climateZone: 'NB' },
  { name: 'TP. Hồ Chí Minh',    bbox: { minLat: 10.4, maxLat: 11.2, minLon: 106.3, maxLon: 107.1 }, climateZone: 'NB' },
  { name: 'Long An',            bbox: { minLat: 10.3, maxLat: 11.1, minLon: 105.5, maxLon: 106.8 }, climateZone: 'NB' },
  { name: 'Tiền Giang',         bbox: { minLat: 10.0, maxLat: 10.7, minLon: 105.7, maxLon: 106.8 }, climateZone: 'NB' },
  { name: 'Bến Tre',            bbox: { minLat:  9.8, maxLat: 10.4, minLon: 105.8, maxLon: 106.7 }, climateZone: 'NB' },
  { name: 'Trà Vinh',           bbox: { minLat:  9.7, maxLat: 10.3, minLon: 105.7, maxLon: 106.5 }, climateZone: 'NB' },
  { name: 'Vĩnh Long',          bbox: { minLat:  9.8, maxLat: 10.4, minLon: 105.5, maxLon: 106.2 }, climateZone: 'NB' },
  { name: 'Đồng Tháp',          bbox: { minLat:  9.9, maxLat: 11.0, minLon: 105.1, maxLon: 106.0 }, climateZone: 'NB' },
  { name: 'An Giang',           bbox: { minLat: 10.0, maxLat: 11.0, minLon: 104.7, maxLon: 105.6 }, climateZone: 'NB' },
  { name: 'Kiên Giang',         bbox: { minLat:  9.1, maxLat: 10.6, minLon: 103.8, maxLon: 105.4 }, climateZone: 'NB' },
  { name: 'Cần Thơ',            bbox: { minLat:  9.8, maxLat: 10.3, minLon: 105.4, maxLon: 105.9 }, climateZone: 'NB' },
  { name: 'Hậu Giang',          bbox: { minLat:  9.6, maxLat: 10.2, minLon: 105.4, maxLon: 106.0 }, climateZone: 'NB' },
  { name: 'Sóc Trăng',          bbox: { minLat:  9.2, maxLat: 10.1, minLon: 105.4, maxLon: 106.3 }, climateZone: 'NB' },
  { name: 'Bạc Liêu',           bbox: { minLat:  8.9, maxLat:  9.7, minLon: 105.1, maxLon: 106.0 }, climateZone: 'NB' },
  { name: 'Cà Mau',             bbox: { minLat:  8.3, maxLat:  9.5, minLon: 104.4, maxLon: 105.4 }, climateZone: 'NB' },
];

export interface GeoInfo {
  lat: number;
  lon: number;
  province: string;
  climateZone: ClimateZone;
  /** Mô tả vùng khí hậu bằng tiếng Việt */
  climateLabel: string;
}

const CLIMATE_LABELS: Record<ClimateZone, string> = {
  BB:  'Bắc Bộ',
  DB:  'Đông Bắc Bộ',
  BTB: 'Bắc Trung Bộ',
  NTB: 'Nam Trung Bộ',
  TN:  'Tây Nguyên',
  NB:  'Nam Bộ',
};

/**
 * Tìm tỉnh chứa điểm (lat, lon).
 * Sử dụng bbox xấp xỉ; nếu nhiều tỉnh match, ưu tiên tỉnh có bbox nhỏ nhất
 * (= khoanh vùng chính xác hơn).
 */
export function findProvince(lat: number, lon: number): GeoInfo | null {
  let best: Province | null = null;
  let bestArea = Infinity;

  for (const p of PROVINCES) {
    const { minLat, maxLat, minLon, maxLon } = p.bbox;
    if (lat >= minLat && lat <= maxLat && lon >= minLon && lon <= maxLon) {
      const area = (maxLat - minLat) * (maxLon - minLon);
      if (area < bestArea) {
        best = p;
        bestArea = area;
      }
    }
  }

  if (!best) return null;
  return {
    lat,
    lon,
    province: best.name,
    climateZone: best.climateZone,
    climateLabel: CLIMATE_LABELS[best.climateZone],
  };
}
