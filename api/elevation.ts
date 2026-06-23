/**
 * api/elevation.ts — Vercel Edge Function
 * Proxy server-side cho OpenTopoData (SRTM 30m) — tránh CORS khi gọi từ browser.
 *
 * OpenTopoData KHÔNG trả Access-Control-Allow-Origin header, nên fetch() trực
 * tiếp từ client (vercel.app) bị browser chặn ngầm (fetch throws, catch nuốt lỗi
 * → mọi elevation thành null). Server-to-server (function này → OpenTopoData)
 * không bị CORS chi phối, sau đó function trả JSON kèm CORS header cho client.
 *
 * Gọi: GET /api/elevation?locations=lat1,lon1|lat2,lon2|...
 */

export const config = { runtime: 'edge' };

const OPENTOPODATA_URL = 'https://api.opentopodata.org/v1/srtm30m';

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const locations = url.searchParams.get('locations');

  if (!locations) {
    return new Response(JSON.stringify({ error: 'missing "locations" param' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const upstream = await fetch(
      `${OPENTOPODATA_URL}?locations=${encodeURIComponent(locations)}`,
    );
    const body = await upstream.text();
    return new Response(body, {
      status: upstream.status,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=86400', // DEM tĩnh — cache 1 ngày
      },
    });
  } catch (e) {
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : 'upstream fetch failed' }),
      { status: 502, headers: { 'Content-Type': 'application/json' } },
    );
  }
}
