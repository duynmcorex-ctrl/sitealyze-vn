/**
 * roadClassify.ts
 * Phân loại đường giao thông từ tên layer CAD + hình học polyline.
 *
 * Quy tắc nhận dạng (tiếng Việt phổ biến trong bản đồ địa hình):
 *   Surface:  BT/BETONG → bê tông  | NH/NHUA → nhựa asphalt
 *             CP/CAPPHOI → cấp phối | DD/DAT → đất  | mặc định → unknown
 *   Role:     TIM_DUONG / TIMDUONG → tim đường (centerline)
 *             MEP_DUONG / MEPDUONG → mép đường (edge)
 *             LO_GIOI / LOGIOI → lộ giới (ROW)
 *   Width:    Số trong tên layer: DUONG_BT_6M → 6m  /  GT_4.5 → 4.5m
 *             Hoặc đo khoảng cách cặp mép đường song song (pairWidth)
 *   Entrance: Endpoint của polyline gần biên địa hình (< ENTRANCE_BUFFER m)
 */

import type { RoadSurface, RoadRole, RoadMeta, RawRoadPolyline } from '../types';

// ── Patterns ──────────────────────────────────────────────────────────────────

const SURFACE_PATTERNS: [RegExp, RoadSurface][] = [
  [/(BE[_-]?TONG|BETONG|^BT$|[_-]BT[_-\d]|BT[_-]|[_-]BT$|CONC|CEMENT|xi[_-]mang)/i, 'concrete'],
  [/(NHUA|ASPHALT|ASP|BITUM|NH[_-]|[_-]NH[_-\d]|[_-]NH$)/i,                           'asphalt'],
  [/(CAP[_-]?PHOI|CAPPHOI|[_-]CP[_-\d]|^CP$|GRAVEL|DA[_-]DAM|DA_DAM)/i,              'gravel'],
  [/(DAT[_-]|[_-]DAT|^DAT$|EARTH|DIRT|[_-]DD[_-]|^DD$|DUONG_DAT)/i,                  'dirt'],
];

const ROLE_PATTERNS: [RegExp, RoadRole][] = [
  [/(TIM[_-]?DUONG|TIMDUONG|TIM[_-]|[_-]TIM$|CENTER[_-]?LINE|CENTERLINE|CL$)/i, 'centerline'],
  [/(MEP[_-]?DUONG|MEPDUONG|MEP[_-]|[_-]MEP|CANH[_-]?DUONG|EDGE|CURB)/i,       'edge'],
  [/(LO[_-]?GIOI|LOGIOI|ROW$|RIGHT[_-]OF[_-]WAY|RANH[_-]?GIOI[_-]?DUONG)/i,   'row'],
];

/** Regex lấy số (m) từ tên layer: DUONG_BT_6M, GT_4.5, D_8, W12 */
const WIDTH_RE = /[_\-\s]([0-9]{1,3}(?:[.,][05])?)(?:m|M)?(?:[_\-\s]|$)/;

// ── Surface detection ─────────────────────────────────────────────────────────

export function detectSurface(layerName: string): RoadSurface {
  for (const [re, surface] of SURFACE_PATTERNS) {
    if (re.test(layerName)) return surface;
  }
  return 'unknown';
}

// ── Role detection ────────────────────────────────────────────────────────────

export function detectRole(layerName: string): RoadRole {
  for (const [re, role] of ROLE_PATTERNS) {
    if (re.test(layerName)) return role;
  }
  return 'unknown';
}

// ── Width from layer name ─────────────────────────────────────────────────────

export function parseWidthFromLayerName(layerName: string): number | null {
  const m = WIDTH_RE.exec(layerName);
  if (!m) return null;
  const v = parseFloat(m[1].replace(',', '.'));
  // Sanity check: 1–60m là hợp lý
  if (!isFinite(v) || v < 1 || v > 60) return null;
  return v;
}

// ── Width from paired edge polylines ─────────────────────────────────────────

/**
 * Ước tính chiều rộng đường từ các cặp mép (edge) song song.
 *
 * Logic:
 *   1. Với mỗi polyline A (edge), tìm polyline B (cùng layer group, khác polyline)
 *      mà B song song và gần A trong khoảng 3–35m.
 *   2. Chiều rộng = trung bình khoảng cách vuông góc của midpoint B tới line A.
 *
 * Input: danh sách polylines DXF 2D của các layer edge trên cùng một tuyến đường.
 * Output: estimated width (m) or null.
 */
export function estimatePairWidth(
  polylines: { x: number; y: number }[][],
): number | null {
  if (polylines.length < 2) return null;

  // Lấy vector chủ đạo + midpoint của mỗi polyline
  type PInfo = { mid: { x: number; y: number }; dir: { x: number; y: number }; len: number };
  const infos: PInfo[] = polylines.map((pts) => {
    const n = pts.length;
    const first = pts[0], last = pts[n - 1];
    const dx = last.x - first.x, dy = last.y - first.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    const dir = len > 0.01 ? { x: dx / len, y: dy / len } : { x: 1, y: 0 };
    const mid = { x: (first.x + last.x) / 2, y: (first.y + last.y) / 2 };
    return { mid, dir, len };
  });

  const widths: number[] = [];

  for (let i = 0; i < infos.length; i++) {
    for (let j = i + 1; j < infos.length; j++) {
      const a = infos[i], b = infos[j];

      // Kiểm tra song song: dot product |cos θ| > 0.85 → θ < 32°
      const cosTheta = Math.abs(a.dir.x * b.dir.x + a.dir.y * b.dir.y);
      if (cosTheta < 0.85) continue;

      // Khoảng cách vuông góc midpoint B tới đường A
      const nx = -a.dir.y, ny = a.dir.x; // normal của A
      const dmx = b.mid.x - a.mid.x, dmy = b.mid.y - a.mid.y;
      const dist = Math.abs(dmx * nx + dmy * ny);

      // Lọc khoảng cách hợp lý: 2–40m
      if (dist < 2 || dist > 40) continue;

      // Projection dọc theo A: midpoint B phải gần đoạn A về dọc
      const proj = Math.abs(dmx * a.dir.x + dmy * a.dir.y);
      const overlap = Math.min(a.len, b.len);
      if (proj > overlap * 1.2) continue;

      widths.push(dist);
    }
  }

  if (widths.length === 0) return null;
  // Dùng median để tránh outlier
  widths.sort((a, b) => a - b);
  return Math.round(widths[Math.floor(widths.length / 2)] * 10) / 10;
}

// ── Entrance detection ────────────────────────────────────────────────────────

const ENTRANCE_BUFFER = 25; // m — endpoint trong 25m tính từ biên địa hình

/**
 * Tìm điểm lối vào: endpoints của polylines đường gần biên terrain.
 * bounds: DXF 2D bounds của terrain.
 * Returns: list tọa độ Three.js world-space {x (East), z (South)} đã center.
 */
export function detectEntrances(
  polylines: { x: number; y: number }[][],
  bounds: { minX: number; minY: number; maxX: number; maxY: number },
): { x: number; z: number }[] {
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cy = (bounds.minY + bounds.maxY) / 2;

  const entrances: { x: number; z: number }[] = [];
  const seen = new Set<string>();

  for (const pts of polylines) {
    if (pts.length < 2) continue;
    // Kiểm tra 2 endpoint
    for (const ep of [pts[0], pts[pts.length - 1]]) {
      const { x, y } = ep;
      const nearWest  = x - bounds.minX < ENTRANCE_BUFFER;
      const nearEast  = bounds.maxX - x < ENTRANCE_BUFFER;
      const nearSouth = y - bounds.minY < ENTRANCE_BUFFER;
      const nearNorth = bounds.maxY - y < ENTRANCE_BUFFER;
      if (!nearWest && !nearEast && !nearSouth && !nearNorth) continue;

      // Round để deduplicate các endpoint gần nhau
      const key = `${Math.round(x / 5)}_${Math.round(y / 5)}`;
      if (seen.has(key)) continue;
      seen.add(key);

      entrances.push({ x: x - cx, z: -(y - cy) });
    }
  }
  return entrances;
}

// ── Main classify ─────────────────────────────────────────────────────────────

/**
 * Phân tích một nhóm rawRoadPolylines cùng layer → RoadMeta.
 *
 * @param layerName  Tên layer CAD
 * @param polylines  Tất cả polylines của layer (tọa độ DXF 2D)
 * @param bounds     Bounding box terrain (tọa độ DXF 2D)
 */
export function classifyRoadLayer(
  layerName: string,
  polylines: { x: number; y: number }[][],
  bounds: { minX: number; minY: number; maxX: number; maxY: number },
): RoadMeta {
  const surface = detectSurface(layerName);
  const role    = detectRole(layerName);

  // Width: ưu tiên tên layer, nếu không có thì đo cặp mép
  let estimatedWidthM = parseWidthFromLayerName(layerName);
  if (estimatedWidthM === null && role === 'edge') {
    estimatedWidthM = estimatePairWidth(polylines);
  }
  if (estimatedWidthM === null && role === 'centerline') {
    // Centerline đơn → gán width mặc định nhỏ nhất theo QCVN nội bộ (3.5m)
    estimatedWidthM = null; // Để null — không giả định
  }

  const entrancePoints = detectEntrances(polylines, bounds);

  return { surface, role, estimatedWidthM, entrancePoints };
}

// ── Group rawRoads by layer ───────────────────────────────────────────────────

export interface RoadLayerGroup {
  layerName: string;
  color: string;
  polylines: { x: number; y: number }[][];
}

/**
 * Gom `RawRoadPolyline[]` → nhóm theo tên layer.
 * Cũng tự động merge các layer "cặp mép" (MEP + TIM cùng tuyến) để ước lượng width.
 */
export function groupRawRoadsByLayer(
  raws: RawRoadPolyline[],
): RoadLayerGroup[] {
  const map = new Map<string, { color: string; polys: { x: number; y: number }[][] }>();
  for (const r of raws) {
    if (!map.has(r.layer)) map.set(r.layer, { color: r.color, polys: [] });
    map.get(r.layer)!.polys.push(r.points);
  }
  return Array.from(map.entries()).map(([layerName, { color, polys }]) => ({
    layerName,
    color,
    polylines: polys,
  }));
}

// ── Surface display helpers ───────────────────────────────────────────────────

/** Màu render trong 3D scene theo loại mặt đường */
export const SURFACE_COLOR: Record<RoadSurface, string> = {
  concrete: '#D0D0D0',   // xám sáng
  asphalt:  '#555566',   // xám đen
  gravel:   '#B09070',   // nâu nhạt
  dirt:     '#8B6420',   // đất nâu
  unknown:  '#AAAAAA',   // xám trung tính
};

/** Tên tiếng Việt hiển thị */
export const SURFACE_LABEL: Record<RoadSurface, string> = {
  concrete: 'Bê tông',
  asphalt:  'Nhựa đường',
  gravel:   'Cấp phối đá dăm',
  dirt:     'Đường đất',
  unknown:  'Chưa xác định',
};

export const ROLE_LABEL: Record<RoadRole, string> = {
  centerline: 'Tim đường',
  edge:       'Mép đường',
  row:        'Lộ giới',
  unknown:    'Đường chung',
};
