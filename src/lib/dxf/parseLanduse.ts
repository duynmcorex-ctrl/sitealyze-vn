/**
 * parseLanduse.ts
 * Đọc bản vẽ quy hoạch chi tiết (CAD QH500/QH2000) và trích xuất:
 *   1. Các ô đất (closed polyline có hatch màu) → suy luận loại đất từ màu
 *   2. Các ô chỉ tiêu (vòng tròn nhỏ + text A/B/C/D/E/G xung quanh)
 *      → ParcelIndicator (mã ô, diện tích, mật độ XD, tầng cao, FAR, dân số)
 *
 * Không phụ thuộc parseDxf.ts/parseOverlayDxf.ts — đọc lại từ đầu vì:
 *   - Cần access TEXT/MTEXT entity (parseOverlay đã skip)
 *   - Cần CIRCLE entity dùng cho indicator (parseOverlay chỉ lấy cây)
 *   - Cần entity color rõ ràng để map sang LanduseType
 */
import DxfParser from 'dxf-parser';
import { aciToHex, trueColorToHex } from './parseOverlayDxf';
import type { LanduseData, LanduseParcel, LanduseType, ParcelIndicator } from '../types';

// ── Parcel noise filter ──────────────────────────────────────────────────────
// Nhiều file CAD QH có hàng trăm polyline phụ (đường viền nhà, sub-feature, decoration)
// → tăng threshold để loại nhiễu, giữ ô đất thực

/** Diện tích tối thiểu để polyline được coi là parcel (m²) */
const MIN_PARCEL_AREA = 50;

/** Layer name pattern KHÔNG phải parcel — bỏ qua khi parse.
 *  CHỈ filter layer rõ là decoration/dim/text. KHÔNG filter "nha/cay/tuong/le..."
 *  vì có thể trùng tên layer parcel thực tế (vd "NHA O", "CAY XANH"). */
const PARCEL_NOISE_LAYER_RE = /^(text|dim|hatch|grid|axis|frame|title|legend|leader|note|dim_.*|defpoints|0)$/i;

// ── Color → LanduseType lookup ────────────────────────────────────────────────
// Dựa trên CHÚ THÍCH KÝ HIỆU chuẩn QH VN + bảng ACI AutoCAD đầy đủ.
// Mỗi entry là [hex, type]. Match bằng khoảng cách Euclidean RGB (closest wins).
//
// ACI (AutoCAD Color Index) phổ biến trong file QH VN:
//   1=#FF0000  2=#FFFF00  3=#00FF00  4=#00FFFF  5=#0000FF  6=#FF00FF
//   7=#F0F0F0  8=#808080  9=#C0C0C0
//  20=#FF8040 21=#FFB080 22=#BF5F00
//  30=#FFBF00 31=#FFDF80 32=#BF8F00
// 250=#333333 251=#505050 252=#696969 253=#828282 254=#BEBEBE 255=#F0F0F0

interface ColorMapEntry {
  hex: string;
  type: LanduseType;
}

const LANDUSE_COLOR_MAP: ColorMapEntry[] = [
  // ── Đỏ → TMDV (thương mại dịch vụ) ───────────────────────────────────────
  { hex: '#FF0000', type: 'TMDV' },    // ACI 1
  { hex: '#FF4040', type: 'TMDV' },    // ACI 10
  { hex: '#E31A1C', type: 'TMDV' },
  { hex: '#CC0000', type: 'TMDV' },
  { hex: '#CC3300', type: 'TMDV' },
  { hex: '#FF3333', type: 'TMDV' },
  { hex: '#FF2020', type: 'TMDV' },

  // ── Đỏ sẫm → Trung tâm VHTT ───────────────────────────────────────────────
  { hex: '#8B0000', type: 'TRUNG_TAM_VHTT' },
  { hex: '#800000', type: 'TRUNG_TAM_VHTT' },
  { hex: '#BF0000', type: 'TRUNG_TAM_VHTT' },  // ACI 12
  { hex: '#9F1D1D', type: 'TRUNG_TAM_VHTT' },

  // ── Hồng đậm → Trường tiểu học ────────────────────────────────────────────
  { hex: '#FF1493', type: 'TRUONG_TIEU_HOC' },
  { hex: '#DC143C', type: 'TRUONG_TIEU_HOC' },

  // ── Tím/hồng → Trường mầm non ─────────────────────────────────────────────
  { hex: '#FF80C0', type: 'TRUONG_MAM_NON' },  // ACI 211
  { hex: '#FF99CC', type: 'TRUONG_MAM_NON' },
  { hex: '#FFB6C1', type: 'TRUONG_MAM_NON' },
  { hex: '#FF69B4', type: 'TRUONG_MAM_NON' },
  { hex: '#FF8080', type: 'TRUONG_MAM_NON' },  // ACI 11 — salmon (mầm non)

  // ── Tím → Nhà văn hoá ──────────────────────────────────────────────────────
  { hex: '#FF00FF', type: 'NHA_VAN_HOA' },     // ACI 6 magenta
  { hex: '#CC00CC', type: 'NHA_VAN_HOA' },
  { hex: '#9966CC', type: 'NHA_VAN_HOA' },
  { hex: '#993399', type: 'NHA_VAN_HOA' },
  { hex: '#BF0060', type: 'NHA_VAN_HOA' },     // ACI 212

  // ── Cam đậm → Nhà ở liên kế (row housing) ────────────────────────────────
  // Màu điển hình QH VN: cam #FF7F00 → #FFA040. ACI 20 = #FF8040, ACI 30 = #FFBF00
  { hex: '#FF8040', type: 'NHA_O_LIEN_KE' },  // ACI 20 ★ phổ biến nhất
  { hex: '#FF7F00', type: 'NHA_O_LIEN_KE' },
  { hex: '#FF8000', type: 'NHA_O_LIEN_KE' },
  { hex: '#FF9000', type: 'NHA_O_LIEN_KE' },
  { hex: '#FFA500', type: 'NHA_O_LIEN_KE' },
  { hex: '#FF9900', type: 'NHA_O_LIEN_KE' },
  { hex: '#FFAA00', type: 'NHA_O_LIEN_KE' },
  { hex: '#FFB347', type: 'NHA_O_LIEN_KE' },
  { hex: '#FFB080', type: 'NHA_O_LIEN_KE' },  // ACI 21
  { hex: '#FFCC66', type: 'NHA_O_LIEN_KE' },
  { hex: '#BF5F00', type: 'NHA_O_LIEN_KE' },  // ACI 22

  // ── Cam đỏ → Nhà ở xã hội ────────────────────────────────────────────────
  { hex: '#FF6633', type: 'NHA_O_XA_HOI' },
  { hex: '#FF6600', type: 'NHA_O_XA_HOI' },
  { hex: '#FF5500', type: 'NHA_O_XA_HOI' },
  { hex: '#FF4500', type: 'NHA_O_XA_HOI' },   // OrangeRed
  { hex: '#E8620A', type: 'NHA_O_XA_HOI' },
  { hex: '#FF8C00', type: 'NHA_O_XA_HOI' },   // dark orange

  // ── Vàng-cam → Biệt thự song lập ──────────────────────────────────────────
  { hex: '#FFBF00', type: 'BIET_THU_SONG_LAP' }, // ACI 30 ★
  { hex: '#FFD700', type: 'BIET_THU_SONG_LAP' },
  { hex: '#E6D700', type: 'BIET_THU_SONG_LAP' },
  { hex: '#FFD000', type: 'BIET_THU_SONG_LAP' },
  { hex: '#BF8F00', type: 'BIET_THU_SONG_LAP' }, // ACI 32

  // ── Vàng nhạt → Biệt thự đơn lập ─────────────────────────────────────────
  { hex: '#FFFF00', type: 'BIET_THU_DON_LAP' },  // ACI 2 ★
  { hex: '#FFFF99', type: 'BIET_THU_DON_LAP' },
  { hex: '#FFFFCC', type: 'BIET_THU_DON_LAP' },
  { hex: '#FFDF80', type: 'BIET_THU_DON_LAP' },  // ACI 31

  // ── Nâu → Chung cư hỗn hợp ───────────────────────────────────────────────
  { hex: '#A0522D', type: 'CHUNG_CU_HON_HOP' },
  { hex: '#8B4513', type: 'CHUNG_CU_HON_HOP' },
  { hex: '#CD853F', type: 'CHUNG_CU_HON_HOP' },

  // ── Xanh lá nhạt → Cây xanh công cộng ────────────────────────────────────
  { hex: '#00FF00', type: 'CAY_XANH_CONG_CONG' }, // ACI 3 ★
  { hex: '#7FFF00', type: 'CAY_XANH_CONG_CONG' },
  { hex: '#90EE90', type: 'CAY_XANH_CONG_CONG' },
  { hex: '#ADFF2F', type: 'CAY_XANH_CONG_CONG' },
  { hex: '#98FB98', type: 'CAY_XANH_CONG_CONG' },

  // ── Xanh lá đậm → Cây xanh thể dục ──────────────────────────────────────
  { hex: '#228B22', type: 'CAY_XANH_THE_DUC' },
  { hex: '#006400', type: 'CAY_XANH_THE_DUC' },
  { hex: '#008000', type: 'CAY_XANH_THE_DUC' },
  { hex: '#32CD32', type: 'CAY_XANH_THE_DUC' },

  // ── Tím/indigo → Hạ tầng kỹ thuật ───────────────────────────────────────
  { hex: '#6A5ACD', type: 'HA_TANG_KY_THUAT' },
  { hex: '#483D8B', type: 'HA_TANG_KY_THUAT' },
  { hex: '#7B68EE', type: 'HA_TANG_KY_THUAT' },
  { hex: '#333333', type: 'HA_TANG_KY_THUAT' },  // ACI 250 — dark gray
  { hex: '#505050', type: 'HA_TANG_KY_THUAT' },  // ACI 251

  // ── Xám trung → Bãi đỗ xe ────────────────────────────────────────────────
  // CHỈ các màu xám đặc trưng; KHÔNG để thành catch-all cho mọi màu xám
  { hex: '#808080', type: 'BAI_DO_XE' },  // ACI 8 ★ medium gray
  { hex: '#828282', type: 'BAI_DO_XE' },  // ACI 253
  { hex: '#A9A9A9', type: 'BAI_DO_XE' },  // DarkGray
  { hex: '#969696', type: 'BAI_DO_XE' },

  // ── Xám nhạt → Khoảng lùi (phân biệt với BAI_DO_XE) ─────────────────────
  { hex: '#696969', type: 'KHOANG_LUI' },  // ACI 252 — dim gray (re-assigned)
  { hex: '#C0C0C0', type: 'KHOANG_LUI' },  // ACI 9 silver
  { hex: '#BEBEBE', type: 'KHOANG_LUI' },  // ACI 254
  { hex: '#C8C8C8', type: 'KHOANG_LUI' },
  { hex: '#D3D3D3', type: 'KHOANG_LUI' },
  { hex: '#DDDDDD', type: 'KHOANG_LUI' },

  // ── Xanh dương/cyan → Mặt nước ────────────────────────────────────────────
  { hex: '#00FFFF', type: 'HO_AO_DAM' },  // ACI 4 cyan
  { hex: '#0000FF', type: 'HO_AO_DAM' },  // ACI 5 blue
  { hex: '#1E90FF', type: 'HO_AO_DAM' },
  { hex: '#4682B4', type: 'HO_AO_DAM' },
  { hex: '#00BFFF', type: 'HO_AO_DAM' },
  { hex: '#6495ED', type: 'HO_AO_DAM' },

  // ── Trắng/gần trắng → Đường giao thông ───────────────────────────────────
  { hex: '#FFFFFF', type: 'DUONG_GIAO_THONG' },
  { hex: '#F0F0F0', type: 'DUONG_GIAO_THONG' },  // ACI 7 & ACI 255
  { hex: '#F5F5F5', type: 'DUONG_GIAO_THONG' },
  { hex: '#E8E8E8', type: 'DUONG_GIAO_THONG' },
];

/** Màu hiển thị chính thức cho từng loại đất (dùng trong Legend + render) */
export const LANDUSE_DISPLAY_COLOR: Record<LanduseType, string> = {
  TRUNG_TAM_VHTT:    '#8B0000',
  NHA_VAN_HOA:       '#9966CC',
  TMDV:              '#E31A1C',
  TRUONG_MAM_NON:    '#FF99CC',
  TRUONG_TIEU_HOC:   '#FF1493',
  NHA_O_LIEN_KE:     '#FFA500',
  BIET_THU_DON_LAP:  '#FFFF99',
  BIET_THU_SONG_LAP: '#FFD700',
  NHA_O_XA_HOI:      '#FF8C00',
  CHUNG_CU_HON_HOP:  '#A0522D',
  CAY_XANH_CONG_CONG:'#7FFF00',
  CAY_XANH_THE_DUC:  '#228B22',
  HA_TANG_KY_THUAT:  '#6A5ACD',
  BAI_DO_XE:         '#A9A9A9',
  HO_AO_DAM:         '#1E90FF',
  DUONG_GIAO_THONG:  '#FFFFFF',
  KHOANG_LUI:        '#DDDDDD',
  CAU_BE_TONG:       '#666666',
  KHAC:              '#CCCCCC',
};

/** Nhãn tiếng Việt cho Legend */
export const LANDUSE_LABEL: Record<LanduseType, string> = {
  TRUNG_TAM_VHTT:    'Trung tâm văn hoá - thể thao',
  NHA_VAN_HOA:       'Đất nhà văn hoá',
  TMDV:              'Đất thương mại dịch vụ',
  TRUONG_MAM_NON:    'Đất trường mầm non',
  TRUONG_TIEU_HOC:   'Đất trường tiểu học',
  NHA_O_LIEN_KE:     'Đất nhà ở liên kế',
  BIET_THU_DON_LAP:  'Đất nhà ở biệt thự đơn lập',
  BIET_THU_SONG_LAP: 'Đất nhà ở biệt thự song lập',
  NHA_O_XA_HOI:      'Đất nhà ở xã hội',
  CHUNG_CU_HON_HOP:  'Đất nhà chung cư hỗn hợp',
  CAY_XANH_CONG_CONG:'Đất cây xanh sử dụng công cộng',
  CAY_XANH_THE_DUC:  'Đất cây xanh thể dục thể thao',
  HA_TANG_KY_THUAT:  'Đất hạ tầng kỹ thuật',
  BAI_DO_XE:         'Đất bãi đỗ xe',
  HO_AO_DAM:         'Hồ, ao, đầm',
  DUONG_GIAO_THONG:  'Đường giao thông',
  KHOANG_LUI:        'Khoảng lùi',
  CAU_BE_TONG:       'Cầu bê tông',
  KHAC:              'Loại khác',
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

/** Khoảng cách Euclidean trong RGB space */
function colorDistance(a: string, b: string): number {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  return Math.sqrt((r1-r2)**2 + (g1-g2)**2 + (b1-b2)**2);
}

/** Suy luận loại đất từ màu CSS hex — chọn entry có distance nhỏ nhất.
 *  Màu không xác định (#000001 sentinel hoặc hsl(...)) → trả về KHAC ngay. */
export function inferLanduseFromColor(color: string): LanduseType {
  // Sentinel "không có màu" → không phân loại
  if (!color || color === '#000001' || color.startsWith('hsl')) return 'KHAC';

  let bestType: LanduseType = 'KHAC';
  let bestDist = Infinity;
  for (const e of LANDUSE_COLOR_MAP) {
    const d = colorDistance(color, e.hex);
    if (d < bestDist) {
      bestDist = d;
      bestType = e.type;
    }
  }
  // Threshold 100 (giảm từ 120) để tránh nhầm màu xa
  return bestDist < 100 ? bestType : 'KHAC';
}

/** Diện tích polygon bằng công thức Shoelace */
function polygonArea(pts: { x: number; y: number }[]): number {
  if (pts.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    sum += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
  }
  return Math.abs(sum) / 2;
}

/** Point-in-polygon (ray casting) */
function pointInPolygon(
  pt: { x: number; y: number },
  polygon: { x: number; y: number }[],
): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x, yi = polygon[i].y;
    const xj = polygon[j].x, yj = polygon[j].y;
    const intersect =
      yi > pt.y !== yj > pt.y &&
      pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/** Resolve entity color.
 *  Fallback '#000001' thay vì '#AAAAAA': gần màu đen, khoảng cách >120 với
 *  tất cả entry real trong color map → inferLanduseFromColor trả về KHAC
 *  (không bị nhầm sang BAI_DO_XE như '#AAAAAA' gần #A9A9A9). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function entityColor(ent: any, layerColors: Record<string, string>): string {
  if (typeof ent.trueColor === 'number' && ent.trueColor > 0) {
    return trueColorToHex(ent.trueColor);
  }
  const ci = ent.colorIndex ?? ent.color;
  if (typeof ci === 'number' && ci > 0 && ci < 256) return aciToHex(ci);
  // BYLAYER (0) hoặc BYBLOCK (256) → dùng layer color
  return layerColors[ent.layer ?? '0'] ?? '#000001';
}

// ── Parse text indicator (A/B/C/D/E/G format) ────────────────────────────────

/**
 * Parse 1 dòng text từ ô chỉ tiêu — flexible format.
 * VD input: "A: DTMDV-01" → { key: 'A', value: 'DTMDV-01' }
 *           "B-1500"      → { key: 'B', value: '1500' }
 *           "C 60%"       → { key: 'C', value: '60' }
 *           "DTMDV-01"    → { key: 'A', value: 'DTMDV-01' } (nếu là dòng đầu)
 */
function parseIndicatorLine(line: string): { key: string; value: string } | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  // Pattern <KEY>: <VALUE> hoặc <KEY>-<VALUE> hoặc <KEY> <VALUE>
  const m = trimmed.match(/^([ABCDEG])\s*[:\-=]?\s*(.+)$/i);
  if (m) {
    return { key: m[1].toUpperCase(), value: m[2].trim().replace(/[%m²]/g, '').trim() };
  }
  return null;
}

/**
 * Parse 1 số từ chuỗi text — chấp nhận "86-90" (range, lấy trung bình),
 * "4,5" (Vietnamese decimal), "60%", "5 tầng"
 */
function parseNumeric(s: string): number | null {
  if (!s) return null;
  const clean = s.replace(/[%m²]/g, '').trim();
  // Range "86-90" or "86–90" → trung bình
  const rangeMatch = clean.match(/^(-?\d+(?:[.,]\d+)?)\s*[-–]\s*(-?\d+(?:[.,]\d+)?)$/);
  if (rangeMatch) {
    const a = parseFloat(rangeMatch[1].replace(',', '.'));
    const b = parseFloat(rangeMatch[2].replace(',', '.'));
    if (Number.isFinite(a) && Number.isFinite(b)) return (a + b) / 2;
  }
  // Số đơn — strip chữ
  const m = clean.match(/(-?\d+(?:[.,]\d+)?)/);
  if (!m) return null;
  const v = parseFloat(m[1].replace(',', '.'));
  return Number.isFinite(v) ? v : null;
}

/**
 * Vòng tròn chỉ tiêu QH chuẩn VN (positional):
 *
 *         A          (top center — Ký hiệu, vd "LK-21")
 *     B       C      (top-left: Diện tích | top-right: MĐXD %)
 *     D       E      (bot-left: Tầng cao | bot-right: FAR)
 *         G          (bot center — Dân số)
 *
 * Phân loại text theo GÓC từ tâm circle:
 *   A:  60°–120°   (top center)
 *   B: 120°–165°   (top-left)
 *   C:  15°–60°    (top-right)
 *   D: 195°–240°   (bot-left)
 *   E: 300°–345°   (bot-right)
 *   G: 240°–300°   (bot center)
 *
 * Mỗi vùng góc: chọn TEXT gần tâm nhất (loại trừ text bên trong circle nếu radius > 0).
 */
function buildIndicatorByPosition(
  center: { x: number; y: number },
  radius: number,
  texts: { center: { x: number; y: number }; text: string }[],
): ParcelIndicator | null {
  if (texts.length === 0) return null;

  // Bins theo góc: {key, [minDeg, maxDeg]}
  const BINS: { key: 'A' | 'B' | 'C' | 'D' | 'E' | 'G'; min: number; max: number }[] = [
    { key: 'A', min:  60, max: 120 },
    { key: 'B', min: 120, max: 165 },
    { key: 'C', min:  15, max:  60 },
    { key: 'D', min: 195, max: 240 },
    { key: 'E', min: 300, max: 345 },
    { key: 'G', min: 240, max: 300 },
  ];

  // Map mỗi bin → text gần tâm nhất (theo dist)
  const picks: Record<string, { text: string; dist: number } | undefined> = {};

  const searchR = Math.max(radius * 6, 50);
  for (const t of texts) {
    const dx = t.center.x - center.x;
    const dy = t.center.y - center.y;
    const dist = Math.hypot(dx, dy);
    if (dist > searchR) continue;
    // Bỏ text quá xa hoặc quá gần (trong circle thường là decoration)
    if (radius > 0.5 && dist < radius * 0.4) continue;

    // Atan2 → degree [0, 360)
    let deg = Math.atan2(dy, dx) * 180 / Math.PI;
    if (deg < 0) deg += 360;

    for (const bin of BINS) {
      const inBin = bin.min <= bin.max
        ? deg >= bin.min && deg <= bin.max
        : deg >= bin.min || deg <= bin.max;
      if (!inBin) continue;
      const prev = picks[bin.key];
      if (!prev || dist < prev.dist) {
        picks[bin.key] = { text: t.text.trim(), dist };
      }
    }
  }

  // Nếu không có pick nào → fail (fallback sẽ thử prefix-based)
  const pickedCount = Object.keys(picks).length;
  if (pickedCount < 2) return null;

  const ind: ParcelIndicator = {
    center,
    code: picks.A?.text ?? '',
    area:       parseNumeric(picks.B?.text ?? ''),
    maxDensity: parseNumeric(picks.C?.text ?? ''),
    maxFloors:  parseNumeric(picks.D?.text ?? ''),
    far:        parseNumeric(picks.E?.text ?? ''),
    population: parseNumeric(picks.G?.text ?? ''),
  };
  return ind;
}

/** Parse 1 cụm text/mtext → ParcelIndicator (best-effort) */
function buildIndicatorFromTexts(
  center: { x: number; y: number },
  texts: { text: string }[],
): ParcelIndicator {
  const ind: ParcelIndicator = {
    center,
    code: '',
    area: null,
    maxDensity: null,
    maxFloors: null,
    far: null,
    population: null,
  };

  // Mỗi MTEXT có thể chứa nhiều dòng (\P hoặc \n)
  const allLines: string[] = [];
  for (const t of texts) {
    const lines = (t.text ?? '').split(/\\P|\n|\r/).map(s => s.trim()).filter(Boolean);
    allLines.push(...lines);
  }

  for (const line of allLines) {
    const parsed = parseIndicatorLine(line);
    if (!parsed) continue;
    const num = parseFloat(parsed.value.replace(/,/g, '.'));
    switch (parsed.key) {
      case 'A': ind.code = parsed.value; break;
      case 'B': if (Number.isFinite(num)) ind.area = num; break;
      case 'C': if (Number.isFinite(num)) ind.maxDensity = num; break;
      case 'D': if (Number.isFinite(num)) ind.maxFloors = num; break;
      case 'E': if (Number.isFinite(num)) ind.far = num; break;
      case 'G': if (Number.isFinite(num)) ind.population = num; break;
    }
  }

  // Fallback: nếu không có A: code, dùng dòng đầu tiên không-numeric
  if (!ind.code) {
    const firstNonNum = allLines.find(l => /[A-Za-z]/.test(l));
    if (firstNonNum) ind.code = firstNonNum;
  }
  return ind;
}

// ── Main parser ──────────────────────────────────────────────────────────────

/** Parse DXF text → LanduseData */
export function parseLanduseDxf(text: string): LanduseData {
  const parser = new DxfParser();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dxf = parser.parseSync(text) as { entities: any[]; tables?: any } | null;
  if (!dxf?.entities) {
    return { parcels: [], indicators: [], totalAreaSqm: 0, byType: [] };
  }

  // Collect layer colors
  const layerColors: Record<string, string> = {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const layerTable = (dxf.tables as any)?.layer?.layers as Record<string, any> | undefined;
  if (layerTable) {
    for (const [name, info] of Object.entries(layerTable)) {
      if (typeof info.trueColor === 'number' && info.trueColor > 0) {
        layerColors[name] = trueColorToHex(info.trueColor);
      } else {
        const ci = Math.abs(info.color ?? info.colorIndex ?? 0);
        if (ci > 0 && ci < 256) layerColors[name] = aciToHex(ci);
      }
    }
  }

  const parcels: LanduseParcel[] = [];
  /** HATCH fill seeds: màu fill thực của vùng đất (ưu tiên hơn polyline color) */
  const hatches: { center: { x: number; y: number }; color: string }[] = [];
  const circles: { center: { x: number; y: number }; radius: number }[] = [];
  const allTexts: { center: { x: number; y: number }; text: string }[] = [];
  let parcelIdCounter = 0;
  let skippedNoiseLayer = 0, skippedSmall = 0;

  for (const ent of dxf.entities) {
    const type = (ent.type ?? '').toUpperCase();
    const layer = ent.layer ?? '0';

    // ── Closed polyline → parcel ─────────────────────────────────────────────
    if ((type === 'LWPOLYLINE' || type === 'POLYLINE') && ent.shape === true) {
      // Filter 1: bỏ layer noise (nhà, tường, cây, lề nhựa, decoration, ...)
      if (PARCEL_NOISE_LAYER_RE.test(layer)) {
        skippedNoiseLayer++;
        continue;
      }

      const verts = ent.vertices ?? [];
      if (verts.length < 3) continue;
      const polygon: { x: number; y: number }[] = [];
      for (const v of verts) {
        if (typeof v.x === 'number' && typeof v.y === 'number') {
          polygon.push({ x: v.x, y: v.y });
        }
      }
      if (polygon.length < 3) continue;

      const color = entityColor(ent, layerColors);
      const area = polygonArea(polygon);
      // Filter 2: bỏ polygon < 50 m² (sub-feature, chữ ký hiệu, marker)
      if (area < MIN_PARCEL_AREA) { skippedSmall++; continue; }

      parcels.push({
        id: `parcel-${parcelIdCounter++}`,
        polygon,
        inferredType: inferLanduseFromColor(color),
        rawColor: color,
        layer,
        areaSqm: area,
      });
    }

    // ── HATCH → lấy màu fill thực của ô đất ──────────────────────────────────
    // Trong file QH VN, màu loại đất thường nằm ở HATCH (fill solid/pattern)
    // chứ không phải ở outline polyline (hay có màu BYLAYER = trắng/đen).
    // Đọc seed points của HATCH → dùng để override màu parcel sau này.
    if (type === 'HATCH') {
      const color = entityColor(ent, layerColors);
      // Bỏ qua hatch màu "không xác định" hoặc pattern không đặc trưng
      if (color === '#000001') continue;
      // Lấy seed points (thường là array [{x,y,z}])
      // dxf-parser có thể dùng seedPoints hoặc seedPoint
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const seeds: any[] = ent.seedPoints ?? (ent.seedPoint ? [ent.seedPoint] : []);
      for (const s of seeds) {
        if (s && typeof s.x === 'number' && typeof s.y === 'number') {
          hatches.push({ center: { x: s.x, y: s.y }, color });
        }
      }
      // Fallback: nếu không có seed point, tính centroid đỉnh đầu tiên của boundary loop
      if (seeds.length === 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const loops: any[] = ent.boundary ?? ent.loops ?? [];
        if (loops.length > 0) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const pts: any[] = loops[0]?.polyline?.vertices ?? loops[0]?.vertices ?? [];
          if (pts.length >= 3) {
            let sx = 0, sy = 0, cnt = 0;
            for (const v of pts) {
              if (typeof v.x === 'number') { sx += v.x; sy += v.y; cnt++; }
            }
            if (cnt > 0) hatches.push({ center: { x: sx / cnt, y: sy / cnt }, color });
          }
        }
      }
    }

    // ── Circle → indicator marker (radius nhỏ ~1-15m) ────────────────────────
    if (type === 'CIRCLE' && typeof ent.radius === 'number' && ent.center) {
      if (ent.radius >= 0.5 && ent.radius <= 20) {
        circles.push({
          center: { x: ent.center.x, y: ent.center.y },
          radius: ent.radius,
        });
      }
    }

    // ── TEXT / MTEXT → gom lại để gắn với circle gần nhất ────────────────────
    if (type === 'TEXT' || type === 'MTEXT') {
      const pos = ent.position ?? ent.startPoint;
      const txt = ent.text ?? ent.string;
      if (pos && typeof pos.x === 'number' && typeof txt === 'string') {
        allTexts.push({ center: { x: pos.x, y: pos.y }, text: txt });
      }
    }
  }

  // ── Override màu parcel từ HATCH bên trong ─────────────────────────────────
  // HATCH fill có màu loại đất chính xác hơn outline polyline (thường BYLAYER).
  // Với mỗi parcel, tìm HATCH seed nằm bên trong polygon → lấy màu đó.
  if (hatches.length > 0) {
    let hatchOverrideCount = 0;
    for (const p of parcels) {
      for (const h of hatches) {
        if (pointInPolygon(h.center, p.polygon)) {
          const newType = inferLanduseFromColor(h.color);
          if (newType !== 'KHAC' || p.inferredType === 'KHAC') {
            p.rawColor = h.color;
            p.inferredType = newType;
          }
          hatchOverrideCount++;
          break;
        }
      }
    }
    console.log(`[parseLanduse] HATCH: ${hatches.length} seeds, override được ${hatchOverrideCount}/${parcels.length} parcel`);
  }

  // ── Diagnostic: top 10 rawColor phân bố để KTS dễ debug ─────────────────
  {
    const colorCount = new Map<string, number>();
    for (const p of parcels) {
      colorCount.set(p.rawColor, (colorCount.get(p.rawColor) ?? 0) + 1);
    }
    const topColors = [...colorCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
    console.log(
      `[parseLanduse] Top 10 rawColors:\n` +
      topColors.map(([c, n]) => `  ${c} (${n}ô) → ${inferLanduseFromColor(c)}`).join('\n')
    );
  }

  // ── Build indicators: ưu tiên positional (A/B/C/D/E/G theo vị trí ──
  // quanh vòng tròn — chuẩn VN), fallback sang prefix "A: code" / "B-1500"
  const indicators: ParcelIndicator[] = [];
  for (const c of circles) {
    // 1) Thử parse theo vị trí góc (positional)
    const positional = buildIndicatorByPosition(c.center, c.radius, allTexts);
    if (positional && positional.code) {
      indicators.push(positional);
      continue;
    }

    // 2) Fallback: prefix-based ("A: code")
    const nearbyTexts: { text: string }[] = [];
    const searchR = c.radius * 3.5;
    for (const t of allTexts) {
      const d = Math.hypot(t.center.x - c.center.x, t.center.y - c.center.y);
      if (d <= searchR) nearbyTexts.push({ text: t.text });
    }
    if (nearbyTexts.length === 0) continue;
    indicators.push(buildIndicatorFromTexts(c.center, nearbyTexts));
  }

  console.log(
    `[parseLanduse] Parcels: ${parcels.length} (skip ${skippedNoiseLayer} noise-layer + ${skippedSmall} < ${MIN_PARCEL_AREA}m²), ` +
    `${circles.length} vòng tròn chỉ tiêu, parse được ${indicators.filter(i => i.code).length} ô có ký hiệu`
  );

  // ── Bind indicators vào parcels — MULTI-STRATEGY ─────────────────────────
  // Strategy A (ưu tiên): match theo Mã — tìm TEXT BÊN TRONG parcel polygon
  //   có nội dung match indicator.code (vd parcel chứa text "LK-21" → bind
  //   với indicator có code="LK-21"). Xử lý case vòng tròn chỉ tiêu nằm
  //   NGOÀI parcel (bảng chú thích cạnh ô đất).
  // Strategy B (fallback): geometric — point-in-polygon (vòng tròn bên trong)

  // Normalize code: uppercase + bỏ space/dash/underscore
  const normalizeCode = (s: string): string =>
    s.toUpperCase().replace(/[\s_\-.]/g, '').trim();

  const indByCode = new Map<string, ParcelIndicator>();
  for (const ind of indicators) {
    if (ind.code) {
      const norm = normalizeCode(ind.code);
      if (norm.length >= 2) indByCode.set(norm, ind);
    }
  }

  let boundByCode = 0, boundByGeom = 0;
  for (const p of parcels) {
    // A: tìm TEXT bên trong polygon có nội dung match code
    let matched = false;
    for (const t of allTexts) {
      if (!pointInPolygon(t.center, p.polygon)) continue;
      // Mỗi MTEXT có thể chứa nhiều dòng — split + check từng dòng
      const lines = (t.text ?? '').split(/\\P|\n|\r/).map(s => s.trim()).filter(Boolean);
      for (const line of lines) {
        const norm = normalizeCode(line);
        if (norm.length < 2) continue;
        const ind = indByCode.get(norm);
        if (ind) {
          p.indicator = ind;
          matched = true;
          boundByCode++;
          break;
        }
      }
      if (matched) break;
    }
    if (matched) continue;

    // B: fallback geometric — vòng tròn nằm trong parcel
    for (const ind of indicators) {
      if (pointInPolygon(ind.center, p.polygon)) {
        p.indicator = ind;
        boundByGeom++;
        break;
      }
    }
  }

  // ── C: Nearest-neighbor fallback ───────────────────────────────────────
  // Cho indicator CHƯA dùng → tìm parcel gần nhất CHƯA có indicator (theo centroid).
  // Xử lý case vòng tròn chỉ tiêu nằm trong "bảng chú thích" cạnh ô đất, không
  // trùng polygon nhưng gần đó. Chỉ bind nếu khoảng cách < 5% diagonal file.
  let boundByNearest = 0;
  if (parcels.length > 0 && indicators.length > 0) {
    // Compute file diagonal
    let mnX = Infinity, mnY = Infinity, mxX = -Infinity, mxY = -Infinity;
    for (const p of parcels) {
      for (const pt of p.polygon) {
        if (pt.x < mnX) mnX = pt.x;
        if (pt.y < mnY) mnY = pt.y;
        if (pt.x > mxX) mxX = pt.x;
        if (pt.y > mxY) mxY = pt.y;
      }
    }
    const fileDiag = Math.hypot(mxX - mnX, mxY - mnY);
    const maxNearestDist = fileDiag * 0.05;

    // Parcels chưa bind + centroids
    const unboundParcels = parcels.filter(p => !p.indicator);
    const centroids = unboundParcels.map(p => {
      let sx = 0, sy = 0;
      for (const pt of p.polygon) { sx += pt.x; sy += pt.y; }
      return { x: sx / p.polygon.length, y: sy / p.polygon.length };
    });

    // Set indicators đã dùng (bound)
    const usedIndicators = new Set<ParcelIndicator>();
    for (const p of parcels) if (p.indicator) usedIndicators.add(p.indicator);

    for (const ind of indicators) {
      if (usedIndicators.has(ind)) continue;
      let bestI = -1, bestD = Infinity;
      for (let i = 0; i < unboundParcels.length; i++) {
        if (unboundParcels[i].indicator) continue;
        const d = Math.hypot(ind.center.x - centroids[i].x, ind.center.y - centroids[i].y);
        if (d < bestD && d < maxNearestDist) { bestD = d; bestI = i; }
      }
      if (bestI >= 0) {
        unboundParcels[bestI].indicator = ind;
        usedIndicators.add(ind);
        boundByNearest++;
      }
    }
  }

  console.log(
    `[parseLanduse] Bound ${boundByCode + boundByGeom + boundByNearest}/${indicators.length} indicators ` +
    `(${boundByCode} theo Mã, ${boundByGeom} theo vị trí, ${boundByNearest} theo gần nhất)`
  );

  // ── Stats theo loại đất ──────────────────────────────────────────────────
  const totalAreaSqm = parcels.reduce((s, p) => s + p.areaSqm, 0);
  const typeMap = new Map<LanduseType, { areaSqm: number; count: number }>();
  for (const p of parcels) {
    if (!typeMap.has(p.inferredType)) typeMap.set(p.inferredType, { areaSqm: 0, count: 0 });
    const e = typeMap.get(p.inferredType)!;
    e.areaSqm += p.areaSqm;
    e.count++;
  }
  const byType = Array.from(typeMap.entries()).map(([type, v]) => ({
    type,
    areaSqm: v.areaSqm,
    pct: totalAreaSqm > 0 ? (v.areaSqm / totalAreaSqm) * 100 : 0,
    count: v.count,
  })).sort((a, b) => b.areaSqm - a.areaSqm);

  return { parcels, indicators, totalAreaSqm, byType };
}
