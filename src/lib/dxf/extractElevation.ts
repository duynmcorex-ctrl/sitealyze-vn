/**
 * Pick elevation cho 1 polyline — CHỈ từ dữ liệu Z thật của entity.
 *
 * KHÔNG còn đoán Z từ TEXT label hay tên layer.
 * File có Z=0 → trả về 0 → downstream sẽ build mặt phẳng (terrain flat).
 *
 * Thứ tự ưu tiên:
 *   1. Best non-zero Z trong tất cả vertices (tránh vertex đầu=0 nhưng các vertex sau có Z thật)
 *   2. Vertex Z đầu tiên (nếu nonzero)
 *   3. Entity-level elevation (LWPOLYLINE elevation attribute)
 *   4. Fallback: trả về vertexZ hoặc fallbackZ (có thể = 0) hoặc null
 *
 * @param vertexZ Z của vertex đầu tiên
 * @param fallbackZ DXF entity-level elevation
 * @param _layerName tên layer — KHÔNG dùng nữa (giữ signature để khỏi đổi caller)
 * @param allVertexZ Optional: array Z của TẤT CẢ vertices — ưu tiên dùng max-abs
 */
export function pickElevation(
  vertexZ: number | undefined,
  fallbackZ: number | undefined,
  _layerName: string | undefined,
  allVertexZ?: number[],
): number | null {
  void _layerName; // giữ signature, không sử dụng

  // 1) Best non-zero Z trong tất cả vertices
  if (allVertexZ && allVertexZ.length > 0) {
    let best: number | null = null;
    let bestAbs = 0;
    for (const z of allVertexZ) {
      if (typeof z !== 'number' || !Number.isFinite(z)) continue;
      const a = Math.abs(z);
      if (a > 0.001 && a > bestAbs) { best = z; bestAbs = a; }
    }
    if (best !== null) return best;
  }

  // 2) Vertex Z đầu tiên (nonzero)
  if (typeof vertexZ === 'number' && Math.abs(vertexZ) > 0.001) return vertexZ;

  // 3) Entity-level elevation (nonzero)
  if (typeof fallbackZ === 'number' && Math.abs(fallbackZ) > 0.001) return fallbackZ;

  // 4) Cuối cùng: trả về Z gốc (có thể = 0). Downstream sẽ build flat terrain.
  if (typeof vertexZ === 'number') return vertexZ;
  if (typeof fallbackZ === 'number') return fallbackZ;
  return null;
}
