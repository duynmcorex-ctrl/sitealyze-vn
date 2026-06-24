/**
 * Dữ liệu 34 tỉnh/thành Việt Nam SAU SÁP NHẬP — căn cứ:
 *  - Nghị quyết 202/2025/QH15 ngày 12/6/2025 về sắp xếp ĐVHC cấp tỉnh
 *  - 34 NQ ngày 16/6/2025 về sắp xếp ĐVHC cấp xã
 *  - Tổng số: 6 thành phố TW + 28 tỉnh = 34 ĐVHC
 *
 * BBox = union bbox của các tỉnh nguồn trước sáp nhập (xấp xỉ WGS-84).
 * Dùng cho: auto-detect tỉnh từ toạ độ VN-2000, đối chiếu vùng khí hậu,
 * suggest gió/mưa/nắng theo địa phương.
 *
 * 6 vùng khí hậu xây dựng:
 *  BB  = Bắc Bộ (Tây Bắc + đồng bằng sông Hồng)
 *  DB  = Đông Bắc Bộ (núi đông bắc, ven biển QN)
 *  BTB = Bắc Trung Bộ (Thanh Hóa → Huế)
 *  NTB = Nam Trung Bộ (Đà Nẵng → Khánh Hòa, ven biển)
 *  TN  = Tây Nguyên
 *  NB  = Nam Bộ (Đông Nam Bộ + ĐBSCL)
 */

export type ClimateZone = 'BB' | 'DB' | 'BTB' | 'NTB' | 'TN' | 'NB';

export interface Province {
  /** Tên chính thức sau sáp nhập */
  name: string;
  /** Cấu thành (để hiển thị tham chiếu cho user) */
  composedOf?: string;
  bbox: { minLat: number; maxLat: number; minLon: number; maxLon: number };
  climateZone: ClimateZone;
}

/** 34 ĐVHC cấp tỉnh sau sáp nhập (NQ 202/2025/QH15) */
export const PROVINCES: Province[] = [
  // ── 6 Thành phố trực thuộc Trung ương ────────────────────────────────────
  { name: 'Thủ đô Hà Nội',           bbox: { minLat: 20.5, maxLat: 21.4, minLon: 105.3, maxLon: 106.1 }, climateZone: 'BB'  },
  { name: 'TP. Hồ Chí Minh',         composedOf: 'TP.HCM + Bà Rịa-Vũng Tàu + Bình Dương',
    bbox: { minLat: 10.2, maxLat: 11.5, minLon: 106.3, maxLon: 107.8 }, climateZone: 'NB'  },
  { name: 'TP. Hải Phòng',           composedOf: 'Hải Phòng + Hải Dương',
    bbox: { minLat: 20.5, maxLat: 21.2, minLon: 106.2, maxLon: 107.2 }, climateZone: 'BB'  },
  { name: 'TP. Đà Nẵng',             composedOf: 'Đà Nẵng + Quảng Nam',
    bbox: { minLat: 14.8, maxLat: 16.2, minLon: 107.3, maxLon: 108.9 }, climateZone: 'NTB' },
  { name: 'TP. Cần Thơ',             composedOf: 'Cần Thơ + Sóc Trăng + Hậu Giang',
    bbox: { minLat:  9.2, maxLat: 10.3, minLon: 105.4, maxLon: 106.3 }, climateZone: 'NB'  },
  { name: 'TP. Huế',                 composedOf: 'Thừa Thiên Huế (giữ nguyên)',
    bbox: { minLat: 15.9, maxLat: 16.9, minLon: 107.1, maxLon: 108.3 }, climateZone: 'BTB' },

  // ── 28 Tỉnh ──────────────────────────────────────────────────────────────
  { name: 'Tỉnh An Giang',           composedOf: 'Kiên Giang + An Giang',
    bbox: { minLat:  9.1, maxLat: 11.0, minLon: 103.8, maxLon: 105.6 }, climateZone: 'NB'  },
  { name: 'Tỉnh Bắc Ninh',           composedOf: 'Bắc Giang + Bắc Ninh',
    bbox: { minLat: 21.0, maxLat: 21.7, minLon: 105.9, maxLon: 107.0 }, climateZone: 'BB'  },
  { name: 'Tỉnh Cà Mau',             composedOf: 'Bạc Liêu + Cà Mau',
    bbox: { minLat:  8.3, maxLat:  9.7, minLon: 104.4, maxLon: 106.0 }, climateZone: 'NB'  },
  { name: 'Tỉnh Cao Bằng',           composedOf: 'Giữ nguyên',
    bbox: { minLat: 22.4, maxLat: 23.2, minLon: 105.3, maxLon: 106.6 }, climateZone: 'DB'  },
  { name: 'Tỉnh Đắk Lắk',            composedOf: 'Phú Yên + Đắk Lắk',
    bbox: { minLat: 11.8, maxLat: 13.7, minLon: 107.5, maxLon: 109.6 }, climateZone: 'TN'  },
  { name: 'Tỉnh Điện Biên',          composedOf: 'Giữ nguyên',
    bbox: { minLat: 20.7, maxLat: 22.6, minLon: 102.1, maxLon: 103.6 }, climateZone: 'BB'  },
  { name: 'Tỉnh Đồng Nai',           composedOf: 'Bình Phước + Đồng Nai',
    bbox: { minLat: 10.5, maxLat: 12.4, minLon: 106.3, maxLon: 107.8 }, climateZone: 'NB'  },
  { name: 'Tỉnh Đồng Tháp',          composedOf: 'Tiền Giang + Đồng Tháp',
    bbox: { minLat:  9.9, maxLat: 11.0, minLon: 105.1, maxLon: 106.8 }, climateZone: 'NB'  },
  { name: 'Tỉnh Gia Lai',            composedOf: 'Bình Định + Gia Lai',
    bbox: { minLat: 12.8, maxLat: 14.6, minLon: 107.4, maxLon: 109.5 }, climateZone: 'TN'  },
  { name: 'Tỉnh Hà Tĩnh',            composedOf: 'Giữ nguyên',
    bbox: { minLat: 17.7, maxLat: 19.0, minLon: 104.6, maxLon: 106.3 }, climateZone: 'BTB' },
  { name: 'Tỉnh Hưng Yên',           composedOf: 'Thái Bình + Hưng Yên',
    bbox: { minLat: 20.1, maxLat: 21.0, minLon: 105.9, maxLon: 106.7 }, climateZone: 'BB'  },
  { name: 'Tỉnh Khánh Hòa',          composedOf: 'Ninh Thuận + Khánh Hòa',
    bbox: { minLat: 11.2, maxLat: 13.1, minLon: 108.4, maxLon: 109.5 }, climateZone: 'NTB' },
  { name: 'Tỉnh Lai Châu',           composedOf: 'Giữ nguyên',
    bbox: { minLat: 21.7, maxLat: 22.9, minLon: 102.1, maxLon: 103.6 }, climateZone: 'BB'  },
  { name: 'Tỉnh Lâm Đồng',           composedOf: 'Đắk Nông + Bình Thuận + Lâm Đồng',
    bbox: { minLat: 10.3, maxLat: 12.8, minLon: 107.2, maxLon: 108.9 }, climateZone: 'TN'  },
  { name: 'Tỉnh Lạng Sơn',           composedOf: 'Giữ nguyên',
    bbox: { minLat: 21.4, maxLat: 22.6, minLon: 106.1, maxLon: 107.2 }, climateZone: 'DB'  },
  { name: 'Tỉnh Lào Cai',            composedOf: 'Yên Bái + Lào Cai',
    bbox: { minLat: 21.4, maxLat: 22.9, minLon: 103.3, maxLon: 105.0 }, climateZone: 'BB'  },
  { name: 'Tỉnh Nghệ An',            composedOf: 'Giữ nguyên',
    bbox: { minLat: 18.3, maxLat: 20.0, minLon: 103.7, maxLon: 105.8 }, climateZone: 'BTB' },
  { name: 'Tỉnh Ninh Bình',          composedOf: 'Hà Nam + Nam Định + Ninh Bình',
    bbox: { minLat: 19.9, maxLat: 20.7, minLon: 105.6, maxLon: 106.6 }, climateZone: 'BB'  },
  { name: 'Tỉnh Phú Thọ',            composedOf: 'Vĩnh Phúc + Hòa Bình + Phú Thọ',
    bbox: { minLat: 20.2, maxLat: 21.9, minLon: 104.6, maxLon: 105.9 }, climateZone: 'BB'  },
  { name: 'Tỉnh Quảng Ngãi',         composedOf: 'Kon Tum + Quảng Ngãi',
    bbox: { minLat: 13.4, maxLat: 15.5, minLon: 107.2, maxLon: 109.1 }, climateZone: 'NTB' },
  { name: 'Tỉnh Quảng Ninh',         composedOf: 'Giữ nguyên',
    bbox: { minLat: 20.7, maxLat: 21.7, minLon: 106.4, maxLon: 108.1 }, climateZone: 'DB'  },
  { name: 'Tỉnh Quảng Trị',          composedOf: 'Quảng Bình + Quảng Trị',
    bbox: { minLat: 16.2, maxLat: 18.2, minLon: 105.1, maxLon: 107.4 }, climateZone: 'BTB' },
  { name: 'Tỉnh Sơn La',             composedOf: 'Giữ nguyên',
    bbox: { minLat: 20.5, maxLat: 21.8, minLon: 103.2, maxLon: 105.0 }, climateZone: 'BB'  },
  { name: 'Tỉnh Tây Ninh',           composedOf: 'Long An + Tây Ninh',
    bbox: { minLat: 10.3, maxLat: 11.9, minLon: 105.5, maxLon: 106.8 }, climateZone: 'NB'  },
  { name: 'Tỉnh Thái Nguyên',        composedOf: 'Bắc Kạn + Thái Nguyên',
    bbox: { minLat: 21.2, maxLat: 22.7, minLon: 105.4, maxLon: 106.3 }, climateZone: 'BB'  },
  { name: 'Tỉnh Thanh Hóa',          composedOf: 'Giữ nguyên',
    bbox: { minLat: 19.2, maxLat: 20.7, minLon: 104.4, maxLon: 106.1 }, climateZone: 'BTB' },
  { name: 'Tỉnh Tuyên Quang',        composedOf: 'Hà Giang + Tuyên Quang',
    bbox: { minLat: 21.5, maxLat: 23.5, minLon: 104.4, maxLon: 105.7 }, climateZone: 'DB'  },
  { name: 'Tỉnh Vĩnh Long',          composedOf: 'Bến Tre + Trà Vinh + Vĩnh Long',
    bbox: { minLat:  9.7, maxLat: 10.4, minLon: 105.5, maxLon: 106.7 }, climateZone: 'NB'  },
];

export interface GeoInfo {
  lat: number;
  lon: number;
  province: string;
  climateZone: ClimateZone;
  /** Mô tả vùng khí hậu bằng tiếng Việt */
  climateLabel: string;
  /** Cấu thành (sau sáp nhập) */
  composedOf?: string;
}

const CLIMATE_LABELS: Record<ClimateZone, string> = {
  BB:  'Bắc Bộ',
  DB:  'Đông Bắc Bộ',
  BTB: 'Bắc Trung Bộ',
  NTB: 'Nam Trung Bộ',
  TN:  'Tây Nguyên',
  NB:  'Nam Bộ',
};

function toGeoInfo(p: Province, lat: number, lon: number): GeoInfo {
  return {
    lat,
    lon,
    province: p.name,
    climateZone: p.climateZone,
    climateLabel: CLIMATE_LABELS[p.climateZone],
    composedOf: p.composedOf,
  };
}

/**
 * Tìm tỉnh chứa điểm (lat, lon).
 *
 * Sử dụng bbox xấp xỉ; bbox các tỉnh lân cận (vd Lâm Đồng/Đồng Nai, Gia Lai/Bình Định cũ)
 * chồng lấp nhau ở vùng biên. Khi nhiều tỉnh match:
 *   1. Nếu có elevationHint (cao độ trung bình MSL của terrain) → ưu tiên tỉnh Tây Nguyên
 *      (climateZone='TN', vùng cao) khi elevation > 500m, ưu tiên tỉnh KHÔNG phải Tây Nguyên
 *      khi elevation < 200m — tránh chọn nhầm tỉnh đồng bằng cho terrain núi cao
 *      (vd: trước đây luôn chọn "Đồng Nai" cho mọi điểm chồng lấp vì bbox Đồng Nai nhỏ hơn
 *      Lâm Đồng, dù terrain rõ ràng là núi >1000m — sai hoàn toàn).
 *   2. Nếu không có hint hoặc elevation không đủ để phân biệt → fallback bbox nhỏ nhất (cũ).
 */
export function findProvince(lat: number, lon: number, elevationHint?: number): GeoInfo | null {
  const matches: Province[] = [];
  for (const p of PROVINCES) {
    const { minLat, maxLat, minLon, maxLon } = p.bbox;
    if (lat >= minLat && lat <= maxLat && lon >= minLon && lon <= maxLon) matches.push(p);
  }
  if (matches.length === 0) return null;
  if (matches.length === 1) return toGeoInfo(matches[0], lat, lon);

  let best = matches[0];
  let bestScore = -Infinity;
  for (const p of matches) {
    const area = (p.bbox.maxLat - p.bbox.minLat) * (p.bbox.maxLon - p.bbox.minLon);
    let score = -area; // baseline: bbox nhỏ hơn = score cao hơn (hành vi cũ)
    if (elevationHint != null) {
      const isHighland = p.climateZone === 'TN';
      if (elevationHint > 500 && isHighland) score += 100;
      if (elevationHint > 500 && !isHighland) score -= 100;
      if (elevationHint < 200 && isHighland) score -= 100;
    }
    if (score > bestScore) { bestScore = score; best = p; }
  }
  return toGeoInfo(best, lat, lon);
}

/**
 * Tạo GeoInfo thủ công từ tên tỉnh (dùng khi user override).
 * Lat/lon = tâm bbox của tỉnh đó.
 */
export function makeGeoFromProvinceName(name: string): GeoInfo | null {
  const p = PROVINCES.find(p => p.name === name);
  if (!p) return null;
  const lat = (p.bbox.minLat + p.bbox.maxLat) / 2;
  const lon = (p.bbox.minLon + p.bbox.maxLon) / 2;
  return {
    lat,
    lon,
    province: p.name,
    climateZone: p.climateZone,
    climateLabel: CLIMATE_LABELS[p.climateZone],
    composedOf: p.composedOf,
  };
}
