import DxfParser from 'dxf-parser';
import type { ContourPolyline, ParsedDxf } from '../types';
import { pickElevation } from './extractElevation';

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

  for (const ent of dxf.entities) {
    const type = (ent.type || '').toUpperCase();

    // Bỏ qua các entity không phải đường đồng mức
    if (type === 'TEXT' || type === 'MTEXT' || type === 'INSERT' || type === 'ATTDEF' ||
        type === 'DIMENSION' || type === 'HATCH' || type === 'SOLID') continue;

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

  return {
    contours: filtered,
    bounds: { minX: realMinX, minY: realMinY, maxX: realMaxX, maxY: realMaxY, minZ: realMinZ, maxZ: realMaxZ },
    pointCount: realCount,
  };
}
