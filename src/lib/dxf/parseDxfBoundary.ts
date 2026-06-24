/**
 * parseDxfBoundary.ts
 * Trích ranh giới (polygon đóng lớn nhất) từ file DXF — dùng toạ độ ĐỊA PHƯƠNG gốc
 * (VN2000 local, không phải lat/lon) — khác với parseKml.ts (toạ độ KML là lat/lon thật).
 *
 * Mục đích: cho phép build terrain DEM TRỰC TIẾP từ ranh giới DXF khảo sát chính xác,
 * thay vì phải qua KML/Google Earth trung gian (vốn có thể bị đơn giản hoá/lệch vài trăm m
 * so với bản khảo sát CAD chính xác — xem buildDemTerrain.ts).
 */

import { parseOverlayDxfGroups } from './parseOverlayDxf';

const BOUNDARY_NAME_RE = /(ranh\s*gi[ớo]i|boundary|khu\s*v[ựu]c|du\s*an|d[ựu]\s*[áa]n)/i;
const EXCLUDE_NAME_RE = /(ngo[àa]i|lo[aạ]i\s*tr[ừu]|kh[oô]ng\s*thu[oộ]c|exclude|outside)/i;

function shoelaceArea(pts: { x: number; y: number }[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p1 = pts[i], p2 = pts[(i + 1) % pts.length];
    a += p1.x * p2.y - p2.x * p1.y;
  }
  return Math.abs(a) / 2;
}

/**
 * Trích polygon ranh giới lớn nhất từ DXF (toạ độ local gốc, mét).
 * Cùng heuristic chọn candidate như parseKmlPolygon (ưu tiên tên "ranh giới", sau đó
 * diện tích lớn nhất, không phân biệt closed-polyline hay LINE rời).
 */
export function extractDxfBoundaryLocal(dxfText: string): { x: number; y: number }[] | null {
  const groups = parseOverlayDxfGroups(dxfText);
  const candidates: { points: { x: number; y: number }[]; name: string; area: number }[] = [];

  for (const g of groups) {
    for (const poly of g.polylines) {
      if (poly.length < 3) continue;
      candidates.push({ points: poly, name: g.layerName, area: shoelaceArea(poly) });
    }
  }
  if (candidates.length === 0) return null;

  const named = candidates.find(
    (c) => BOUNDARY_NAME_RE.test(c.name) && !EXCLUDE_NAME_RE.test(c.name),
  );
  if (named) return named.points;

  const nonExcluded = candidates.filter((c) => !EXCLUDE_NAME_RE.test(c.name));
  const pool = nonExcluded.length > 0 ? nonExcluded : candidates;
  pool.sort((a, b) => b.area - a.area);
  return pool[0].points;
}
