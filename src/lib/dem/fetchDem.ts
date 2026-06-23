/**
 * fetchDem.ts
 * Lấy cao độ DEM (SRTM 30m, miễn phí) cho 1 lưới điểm lat/lon từ OpenTopoData.
 *
 * API: https://www.opentopodata.org/ — public instance, free, không cần key.
 * Hạn chế: tối đa 100 điểm/request, rate limit ~1 request/giây.
 * Dataset: srtm30m (phủ 60°S–60°N — đủ toàn bộ Việt Nam).
 *
 * QUAN TRỌNG: OpenTopoData KHÔNG trả Access-Control-Allow-Origin header, nên
 * gọi trực tiếp từ browser bị CORS chặn ngầm (fetch throws, catch nuốt lỗi →
 * mọi elevation về null, lỗi "không lấy được cao độ" dù toạ độ đúng).
 * → Gọi qua proxy `/api/elevation` (Vercel Edge Function, server-to-server,
 *   không bị CORS chi phối) — xem api/elevation.ts.
 */

const ELEVATION_PROXY_URL = '/api/elevation';
const BATCH_SIZE = 100;
const BATCH_DELAY_MS = 1100; // > 1s để tránh rate limit (1 req/s)

export interface DemPoint {
  lat: number;
  lon: number;
}

/** Gọi OpenTopoData theo batch tuần tự (tránh rate limit), trả về elevation[] cùng thứ tự input. */
export async function fetchElevations(
  points: DemPoint[],
  onProgress?: (done: number, total: number) => void,
): Promise<(number | null)[]> {
  const result: (number | null)[] = new Array(points.length).fill(null);

  for (let i = 0; i < points.length; i += BATCH_SIZE) {
    const batch = points.slice(i, i + BATCH_SIZE);
    const locations = batch.map((p) => `${p.lat.toFixed(6)},${p.lon.toFixed(6)}`).join('|');

    try {
      const res = await fetch(`${ELEVATION_PROXY_URL}?locations=${encodeURIComponent(locations)}`);
      if (!res.ok) throw new Error(`Elevation proxy HTTP ${res.status}`);
      const data = await res.json();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const results: any[] = data.results ?? [];
      for (let j = 0; j < batch.length; j++) {
        const elev = results[j]?.elevation;
        result[i + j] = typeof elev === 'number' ? elev : null;
      }
    } catch (e) {
      console.warn(`[fetchDem] Batch ${i}-${i + batch.length} failed:`, e);
      // Giữ null cho batch lỗi — caller sẽ nội suy/báo lỗi nếu quá nhiều null
    }

    onProgress?.(Math.min(i + BATCH_SIZE, points.length), points.length);

    // Delay giữa các batch để tôn trọng rate limit (bỏ qua delay cuối)
    if (i + BATCH_SIZE < points.length) {
      await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
    }
  }

  return result;
}
