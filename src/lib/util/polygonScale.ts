/**
 * polygonScale.ts
 * Helpers thu nhỏ polygon về tâm theo tỉ lệ — dùng cho 3D massing footprint.
 *
 * Khi user bật "Hiện khối 3D công trình" với MĐXD=60%, footprint khối
 * chỉ chiếm 60% diện tích ô đất → scale shape về tâm với hệ số √(0.6) ≈ 0.77.
 */

export interface Point2D { x: number; y: number; }

/**
 * Tính centroid (trọng tâm) của polygon đơn giản.
 * Trả về trung bình cộng các vertex — đủ chính xác cho mục đích visualize.
 */
export function polygonCentroid(points: Point2D[]): Point2D {
  if (points.length === 0) return { x: 0, y: 0 };
  let sx = 0, sy = 0;
  for (const p of points) { sx += p.x; sy += p.y; }
  return { x: sx / points.length, y: sy / points.length };
}

/**
 * Thu polygon về tâm theo tỉ lệ scale (0..1).
 * - scale = 1 → giữ nguyên
 * - scale = 0.5 → mỗi vertex dịch về tâm 50%
 *
 * Lưu ý: đây là affine scale từ centroid, không phải Minkowski offset
 * (inset đường biên đều). Cho khối building visualization thì đủ.
 */
export function shrinkPolygonToCenter(
  points: Point2D[],
  scale: number,
): Point2D[] {
  if (points.length === 0 || scale >= 1) return points;
  const s = Math.max(0.05, Math.min(1, scale));  // clamp tránh khối quá nhỏ
  const c = polygonCentroid(points);
  return points.map(p => ({
    x: c.x + (p.x - c.x) * s,
    y: c.y + (p.y - c.y) * s,
  }));
}
