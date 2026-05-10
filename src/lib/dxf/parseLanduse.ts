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

// ── Color → LanduseType lookup ────────────────────────────────────────────────
// Dựa trên CHÚ THÍCH KÝ HIỆU chuẩn QH VN (KTS gửi)
// Mỗi entry là [hex, type, label]. Match bằng so sánh khoảng cách Euclidean RGB.

interface ColorMapEntry {
  hex: string;
  type: LanduseType;
}

const LANDUSE_COLOR_MAP: ColorMapEntry[] = [
  // Đỏ tươi → TMDV
  { hex: '#E31A1C', type: 'TMDV' },
  { hex: '#CC0000', type: 'TMDV' },
  { hex: '#FF0000', type: 'TMDV' },
  // Đỏ sẫm → trung tâm VHTT
  { hex: '#8B0000', type: 'TRUNG_TAM_VHTT' },
  { hex: '#9F1D1D', type: 'TRUNG_TAM_VHTT' },
  // Tím / hồng → trường mầm non / nhà văn hoá
  { hex: '#9966CC', type: 'NHA_VAN_HOA' },
  { hex: '#FF99CC', type: 'TRUONG_MAM_NON' },
  { hex: '#FFB6C1', type: 'TRUONG_MAM_NON' },
  // Hồng đậm → trường tiểu học
  { hex: '#FF1493', type: 'TRUONG_TIEU_HOC' },
  // Vàng/Cam → đất ở
  { hex: '#FFA500', type: 'NHA_O_LIEN_KE' }, // cam → liên kế
  { hex: '#FFCC66', type: 'NHA_O_LIEN_KE' },
  { hex: '#FFFF99', type: 'BIET_THU_DON_LAP' }, // vàng nhạt → BT đơn lập
  { hex: '#FFFF00', type: 'BIET_THU_DON_LAP' },
  { hex: '#E6D700', type: 'BIET_THU_SONG_LAP' }, // vàng đậm hơn → BT song lập
  { hex: '#FFD700', type: 'BIET_THU_SONG_LAP' },
  // Cam đỏ → nhà ở xã hội
  { hex: '#FF8C00', type: 'NHA_O_XA_HOI' },
  // Xám đậm/Cam đậm → chung cư hỗn hợp
  { hex: '#A0522D', type: 'CHUNG_CU_HON_HOP' },
  // Xanh lá → cây xanh
  { hex: '#90EE90', type: 'CAY_XANH_CONG_CONG' },
  { hex: '#7FFF00', type: 'CAY_XANH_CONG_CONG' },
  { hex: '#228B22', type: 'CAY_XANH_THE_DUC' },
  { hex: '#006400', type: 'CAY_XANH_THE_DUC' },
  { hex: '#32CD32', type: 'CAY_XANH_THE_DUC' },
  // Tím xám → hạ tầng kỹ thuật
  { hex: '#6A5ACD', type: 'HA_TANG_KY_THUAT' },
  { hex: '#483D8B', type: 'HA_TANG_KY_THUAT' },
  // Xám trung tính → bãi đỗ xe
  { hex: '#A9A9A9', type: 'BAI_DO_XE' },
  { hex: '#696969', type: 'BAI_DO_XE' },
  // Xanh dương → mặt nước
  { hex: '#1E90FF', type: 'HO_AO_DAM' },
  { hex: '#4682B4', type: 'HO_AO_DAM' },
  { hex: '#00BFFF', type: 'HO_AO_DAM' },
  // Trắng/Be → đường giao thông
  { hex: '#FFFFFF', type: 'DUONG_GIAO_THONG' },
  { hex: '#F5F5F5', type: 'DUONG_GIAO_THONG' },
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

/** Suy luận loại đất từ màu CSS hex — chọn entry có distance nhỏ nhất */
export function inferLanduseFromColor(color: string): LanduseType {
  let bestType: LanduseType = 'KHAC';
  let bestDist = Infinity;
  for (const e of LANDUSE_COLOR_MAP) {
    const d = colorDistance(color, e.hex);
    if (d < bestDist) {
      bestDist = d;
      bestType = e.type;
    }
  }
  // Threshold: nếu khoảng cách quá xa (>120 trong RGB 0-441 max) → coi là KHAC
  return bestDist < 120 ? bestType : 'KHAC';
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

/** Resolve entity color */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function entityColor(ent: any, layerColors: Record<string, string>): string {
  if (typeof ent.trueColor === 'number' && ent.trueColor > 0) {
    return trueColorToHex(ent.trueColor);
  }
  const ci = ent.colorIndex ?? ent.color;
  if (typeof ci === 'number' && ci > 0 && ci < 256) return aciToHex(ci);
  return layerColors[ent.layer ?? '0'] ?? '#AAAAAA';
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
  const circles: { center: { x: number; y: number }; radius: number }[] = [];
  const allTexts: { center: { x: number; y: number }; text: string }[] = [];
  let parcelIdCounter = 0;

  for (const ent of dxf.entities) {
    const type = (ent.type ?? '').toUpperCase();
    const layer = ent.layer ?? '0';

    // ── Closed polyline → parcel ─────────────────────────────────────────────
    if ((type === 'LWPOLYLINE' || type === 'POLYLINE') && ent.shape === true) {
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
      // Bỏ qua polygon nhỏ (<10 m² → có thể là chữ ký hiệu/marker)
      if (area < 10) continue;

      parcels.push({
        id: `parcel-${parcelIdCounter++}`,
        polygon,
        inferredType: inferLanduseFromColor(color),
        rawColor: color,
        layer,
        areaSqm: area,
      });
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

  // ── Build indicators: với mỗi circle, gom text trong bán kính 3×radius ───
  const indicators: ParcelIndicator[] = [];
  for (const c of circles) {
    const nearbyTexts: { text: string }[] = [];
    const searchR = c.radius * 3.5;
    for (const t of allTexts) {
      const d = Math.hypot(t.center.x - c.center.x, t.center.y - c.center.y);
      if (d <= searchR) nearbyTexts.push({ text: t.text });
    }
    if (nearbyTexts.length === 0) continue;
    indicators.push(buildIndicatorFromTexts(c.center, nearbyTexts));
  }

  // ── Bind indicators vào parcels (point-in-polygon) ───────────────────────
  for (const ind of indicators) {
    for (const p of parcels) {
      if (pointInPolygon(ind.center, p.polygon)) {
        p.indicator = ind;
        break;
      }
    }
  }

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
