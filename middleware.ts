/**
 * Vercel Edge Middleware — Basic Auth
 * Chặn toàn bộ request, yêu cầu đăng nhập trước khi vào app.
 *
 * Username : HAAD
 * Password : Haadgroupvn
 *
 * Cách đổi: sửa VALID_USER / VALID_PASS bên dưới rồi git push là xong.
 */

const VALID_USER = 'HAAD';
const VALID_PASS = 'Haadgroupvn';
const REALM      = 'SiteAlyze VN – HAAD Group';

export const config = {
  // Match tất cả path (kể cả assets) — browser cache credentials nên chỉ hỏi 1 lần/session
  matcher: ['/((?!_vercel).*)'],
};

export default function middleware(req: Request): Response | undefined {
  const auth = req.headers.get('authorization') ?? '';

  if (auth.startsWith('Basic ')) {
    try {
      const decoded    = atob(auth.slice(6));          // base64 → "user:pass"
      const colonIdx   = decoded.indexOf(':');
      const user       = decoded.slice(0, colonIdx);
      const pass       = decoded.slice(colonIdx + 1);
      if (user === VALID_USER && pass === VALID_PASS) {
        return undefined; // ✅ pass through — cho vào app
      }
    } catch {
      // base64 lỗi → fall through → trả 401
    }
  }

  // ❌ Chưa có credentials hoặc sai → yêu cầu đăng nhập
  return new Response('🔒 Vui lòng nhập tài khoản để truy cập.', {
    status: 401,
    headers: {
      'WWW-Authenticate': `Basic realm="${REALM}"`,
      'Content-Type': 'text/plain; charset=utf-8',
    },
  });
}
