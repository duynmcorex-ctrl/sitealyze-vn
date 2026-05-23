/**
 * pointInPolygon.ts — Ray-casting algorithm cho point-in-polygon test.
 * Phù hợp polygon đơn (1-ring), không tự cắt. Dùng chung cho:
 *  - parseLanduse (bind indicator → parcel)
 *  - heightmap (clip terrain theo ranh giới)
 *  - LanduseLayer (3D massing footprint check)
 */

export interface Point2D { x: number; y: number; }

/**
 * Returns true nếu `pt` nằm trong polygon đóng `poly`.
 * Đường ray ngang đi từ pt sang phải → đếm số lần cắt cạnh polygon.
 * Số lẻ = trong, số chẵn = ngoài.
 */
export function pointInPolygon(pt: Point2D, poly: Point2D[]): boolean {
  if (poly.length < 3) return false;
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y;
    const xj = poly[j].x, yj = poly[j].y;
    const intersect =
      (yi > pt.y) !== (yj > pt.y) &&
      pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Tính diện tích polygon (Shoelace formula, absolute value).
 * Lấy abs để không phụ thuộc hướng winding (CW/CCW).
 */
export function polygonArea(poly: Point2D[]): number {
  if (poly.length < 3) return 0;
  let area = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    area += (poly[j].x + poly[i].x) * (poly[j].y - poly[i].y);
  }
  return Math.abs(area / 2);
}

/**
 * Bounding box của polygon.
 */
export function polygonBBox(poly: Point2D[]): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of poly) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}
