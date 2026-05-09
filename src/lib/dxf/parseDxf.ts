import DxfParser from 'dxf-parser';
import type { ContourPolyline, ParsedDxf, RawRoadPolyline } from '../types';
import { pickElevation } from './extractElevation';
import { ROAD_LAYER_RE } from '../analysis/roads';

interface DxfVertex {
  x: number;
  y: number;
  z?: number;
}

interface DxfEntity {
  type: string;
  layer?: string;
  vertices?: DxfVertex[];
  elevation?: number;
  shape?: boolean;
  // LINE
  start?: DxfVertex;
  end?: DxfVertex;
  // 3DFACE
  faces?: DxfVertex[];
}

// Pattern auto-detect tên layer chứa đường đồng mức (Việt + Anh phổ biến)
const DEFAULT_CONTOUR_LAYER_RE =
  /(DM|DC|DG|DONGMUC|DUONG[_-]?DONG[_-]?MUC|CONTOUR|TOPO|ELEV|TERRAIN|HEIGHT|BINHDO)/i;

function buildLayerMatcher(pattern?: string): ((layer?: string) => boolean) | null {
  if (!pattern || !pattern.trim()) return null;
  try {
    const re = new RegExp(pattern, 'i');
    return (layer?: string) => (layer ? re.test(layer) : false);
  } catch {
    return null;
  }
}

export function parseDxfText(text: string, layerPattern?: string): ParsedDxf {
  const parser = new DxfParser();
  const dxf = parser.parseSync(text) as { entities: DxfEntity[] } | null;

  if (!dxf || !dxf.entities) {
    throw new Error('Không đọc được DXF: file rỗng hoặc sai định dạng.');
  }

  const userMatcher = buildLayerMatcher(layerPattern);
  // Thử auto-detect: nếu file có layer match default pattern, chỉ lấy entity trong đó
  let autoMatcher: ((layer?: string) => boolean) | null = null;
  if (!userMatcher) {
    const layersWithZ = new Set<string>();
    for (const ent of dxf.entities) {
      if (!ent.layer) continue;
      if (DEFAULT_CONTOUR_LAYER_RE.test(ent.layer)) layersWithZ.add(ent.layer);
    }
    if (layersWithZ.size > 0) {
      autoMatcher = (layer?: string) => (layer ? layersWithZ.has(layer) : false);
    }
  }
  const layerOk = userMatcher || autoMatcher;

  const contours: ContourPolyline[] = [];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  let minZ = Infinity, maxZ = -Infinity;
  let pointCount = 0;

  // ── Collect layer colours from LAYER table (để gán màu cho road polylines) ─
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const layerColors: Record<string, string> = {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dxfAny = dxf as any;
  if (dxfAny.tables?.layer?.layers) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const [name, info] of Object.entries(dxfAny.tables.layer.layers as Record<string, any>)) {
      if (typeof info.trueColor === 'number' && info.trueColor > 0) {
        layerColors[name] = '#' + (info.trueColor & 0xFFFFFF).toString(16).padStart(6, '0');
      } else {
        const ci = Math.abs(info.color ?? info.colorIndex ?? 0);
        // ACI → hex đơn giản: ánh xạ một số màu phổ biến
        const ACI_SIMPLE: Record<number, string> = {
          1:'#FF0000', 2:'#FFFF00', 3:'#00FF00', 4:'#00FFFF',
          5:'#0000FF', 6:'#FF00FF', 7:'#FFFFFF',
        };
        if (ci > 0) layerColors[name] = ACI_SIMPLE[ci] ?? '#AAAAAA';
      }
    }
  }

  // ── Road polylines raw (DXF 2D) ────────────────────────────────────────────
  const rawRoadMap = new Map<string, { color: string; pts: { x: number; y: number }[][] }>();

  function addRoadPolyline(layer: string, pts: { x: number; y: number }[]) {
    if (pts.length < 2) return;
    if (!rawRoadMap.has(layer)) {
      rawRoadMap.set(layer, { color: layerColors[layer] ?? '#AAAAAA', pts: [] });
    }
    rawRoadMap.get(layer)!.pts.push(pts);
  }

  for (const ent of dxf.entities) {
    const type = (ent.type || '').toUpperCase();

    // Bỏ qua các entity không phải polyline/line
    if (type === 'TEXT' || type === 'MTEXT' || type === 'INSERT' || type === 'ATTDEF' ||
        type === 'DIMENSION' || type === 'HATCH' || type === 'SOLID') continue;

    // ── Road detection — CHỈ chạy nếu layer KHÔNG phải contour layer ──────────
    // Defense-in-depth: kể cả regex ROAD_LAYER_RE có lỡ match nhầm
    // (vd: "DUONG_XXX_DONG_MUC"), entity vẫn được ưu tiên xử lý như contour
    // nếu layer match contour pattern.
    const isContourLayer = ent.layer && DEFAULT_CONTOUR_LAYER_RE.test(ent.layer);
    if (!isContourLayer && ent.layer && ROAD_LAYER_RE.test(ent.layer)) {
      if ((type === 'POLYLINE' || type === 'LWPOLYLINE') && (ent.vertices ?? []).length >= 2) {
        addRoadPolyline(
          ent.layer,
          (ent.vertices ?? [])
            .filter((v: DxfVertex) => typeof v.x === 'number' && typeof v.y === 'number')
            .map((v: DxfVertex) => ({ x: v.x, y: v.y })),
        );
      } else if (type === 'LINE' && ent.start && ent.end) {
        addRoadPolyline(ent.layer, [
          { x: ent.start.x, y: ent.start.y },
          { x: ent.end.x,   y: ent.end.y   },
        ]);
      }
      // Road layer không dùng cho contour → skip phần dưới
      continue;
    }

    // Nếu có layer matcher, chỉ chấp nhận layer match
    if (layerOk && !layerOk(ent.layer)) continue;

    if (type === 'POLYLINE' || type === 'LWPOLYLINE') {
      const verts = ent.vertices ?? [];
      if (verts.length < 2) continue;

      // Cao độ chung
      const baseZ = pickElevation(verts[0]?.z, ent.elevation, ent.layer);
      if (baseZ === null) continue;

      const points: { x: number; y: number }[] = [];
      let zSum = 0;
      let zCount = 0;
      for (const v of verts) {
        if (typeof v.x !== 'number' || typeof v.y !== 'number') continue;
        points.push({ x: v.x, y: v.y });
        if (v.x < minX) minX = v.x;
        if (v.y < minY) minY = v.y;
        if (v.x > maxX) maxX = v.x;
        if (v.y > maxY) maxY = v.y;
        const vz = typeof v.z === 'number' ? v.z : baseZ;
        zSum += vz;
        zCount += 1;
      }
      if (points.length < 2) continue;
      const elevation = zCount > 0 ? zSum / zCount : baseZ;

      if (elevation < minZ) minZ = elevation;
      if (elevation > maxZ) maxZ = elevation;

      contours.push({
        elevation,
        points,
        layer: ent.layer,
        closed: ent.shape === true,
      });
      pointCount += points.length;
    } else if (type === 'LINE' && ent.start && ent.end) {
      const z = pickElevation(ent.start.z, ent.elevation, ent.layer);
      if (z === null) continue;
      const pts = [
        { x: ent.start.x, y: ent.start.y },
        { x: ent.end.x, y: ent.end.y },
      ];
      for (const p of pts) {
        if (p.x < minX) minX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.x > maxX) maxX = p.x;
        if (p.y > maxY) maxY = p.y;
      }
      if (z < minZ) minZ = z;
      if (z > maxZ) maxZ = z;
      contours.push({ elevation: z, points: pts, layer: ent.layer });
      pointCount += 2;
    }
  }

  if (!Number.isFinite(minX) || pointCount === 0) {
    throw new Error('Không tìm thấy đường đồng mức có cao độ trong DXF. Kiểm tra layer/Z.');
  }

  // Lọc outlier Z bằng IQR — loại bỏ các contour có cao độ bất thường
  // (thường do text/block/annotation bị đọc nhầm)
  const elevations = contours.map((c) => c.elevation).sort((a, b) => a - b);
  const q1 = elevations[Math.floor(elevations.length * 0.25)];
  const q3 = elevations[Math.floor(elevations.length * 0.75)];
  const iqr = q3 - q1;
  const zLo = q1 - iqr * 3;
  const zHi = q3 + iqr * 3;
  const filtered = contours.filter((c) => c.elevation >= zLo && c.elevation <= zHi);

  // Cập nhật lại bounds Z sau khi lọc
  let realMinZ = Infinity, realMaxZ = -Infinity;
  let realMinX = Infinity, realMinY = Infinity, realMaxX = -Infinity, realMaxY = -Infinity;
  let realCount = 0;
  for (const c of filtered) {
    if (c.elevation < realMinZ) realMinZ = c.elevation;
    if (c.elevation > realMaxZ) realMaxZ = c.elevation;
    for (const p of c.points) {
      if (p.x < realMinX) realMinX = p.x;
      if (p.y < realMinY) realMinY = p.y;
      if (p.x > realMaxX) realMaxX = p.x;
      if (p.y > realMaxY) realMaxY = p.y;
    }
    realCount += c.points.length;
  }

  if (filtered.length === 0) {
    throw new Error('Không tìm thấy đường đồng mức hợp lệ sau khi lọc. Kiểm tra layer/Z trong DXF.');
  }

  // ── Build rawRoads từ rawRoadMap ─────────────────────────────────────────
  const rawRoads: RawRoadPolyline[] = [];
  for (const [layer, { color, pts }] of rawRoadMap.entries()) {
    for (const points of pts) {
      rawRoads.push({ layer, color, points });
    }
  }

  return {
    contours: filtered,
    bounds: { minX: realMinX, minY: realMinY, maxX: realMaxX, maxY: realMaxY, minZ: realMinZ, maxZ: realMaxZ },
    pointCount: realCount,
    rawRoads: rawRoads.length > 0 ? rawRoads : undefined,
  };
}
