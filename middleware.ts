/**
 * Vercel Edge Middleware — Form-based Auth
 * Hiện trang đăng nhập HTML trước khi vào app.
 * Credentials lưu trong cookie session (hết khi đóng browser).
 *
 * Username : HAAD
 * Password : haadgroupvn
 *
 * Cách đổi: sửa VALID_USER / VALID_PASS rồi git push là xong.
 */

const VALID_USER  = 'HAAD';
const VALID_PASS  = 'haadgroupvn';
const COOKIE_NAME = 'siteauth';
const COOKIE_VAL  = 'ok_haad_2024';

export const config = {
  // Chỉ chặn root + page routes, không chặn assets/JS/CSS/WASM
  matcher: ['/', '/index.html'],
};

const LOGIN_HTML = `<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>SiteAlyze VN – Đăng nhập</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{
    min-height:100vh;display:flex;align-items:center;justify-content:center;
    background:#0f172a;font-family:'Segoe UI',sans-serif;
  }
  .card{
    background:#1e293b;border:1px solid #334155;border-radius:12px;
    padding:40px 48px;width:100%;max-width:380px;
    box-shadow:0 25px 50px rgba(0,0,0,.5);
  }
  .logo{font-size:13px;color:#64748b;letter-spacing:2px;text-transform:uppercase;margin-bottom:8px}
  h1{color:#f1f5f9;font-size:22px;font-weight:600;margin-bottom:28px}
  label{display:block;font-size:12px;color:#94a3b8;margin-bottom:6px;letter-spacing:.5px}
  input{
    width:100%;padding:10px 14px;background:#0f172a;border:1px solid #334155;
    border-radius:8px;color:#f1f5f9;font-size:14px;outline:none;margin-bottom:16px;
    transition:border .2s;
  }
  input:focus{border-color:#3b82f6}
  .err{color:#f87171;font-size:13px;margin-bottom:14px;display:none}
  .err.show{display:block}
  button{
    width:100%;padding:11px;background:#3b82f6;border:none;border-radius:8px;
    color:#fff;font-size:14px;font-weight:600;cursor:pointer;transition:background .2s;
  }
  button:hover{background:#2563eb}
  .footer{margin-top:24px;text-align:center;font-size:12px;color:#475569}
</style>
</head>
<body>
<div class="card">
  <div class="logo">HAAD Group</div>
  <h1>SiteAlyze VN</h1>
  <form method="POST">
    <label>TÀI KHOẢN</label>
    <input name="u" type="text" placeholder="Nhập tài khoản" autocomplete="username" required>
    <label>MẬT KHẨU</label>
    <input name="p" type="password" placeholder="Nhập mật khẩu" autocomplete="current-password" required>
    <div class="err" id="err">Tài khoản hoặc mật khẩu không đúng</div>
    <button type="submit">Đăng nhập</button>
  </form>
  <div class="footer">Liên hệ admin để được cấp tài khoản</div>
</div>
</body>
</html>`;

const LOGIN_HTML_ERR = LOGIN_HTML.replace(
  'id="err">',
  'id="err" class="err show">',
);

export default async function middleware(req: Request): Promise<Response | undefined> {
  // Đọc cookie — nếu đã đăng nhập thì cho qua (undefined = pass through)
  const cookie = req.headers.get('cookie') ?? '';
  if (cookie.includes(`${COOKIE_NAME}=${COOKIE_VAL}`)) {
    return undefined;
  }

  // Xử lý POST từ form đăng nhập
  if (req.method === 'POST') {
    const body = await req.text();
    const params = new URLSearchParams(body);
    const u = params.get('u') ?? '';
    const p = params.get('p') ?? '';

    if (u === VALID_USER && p === VALID_PASS) {
      // Đúng → set cookie + redirect về trang chủ
      return new Response(null, {
        status: 302,
        headers: {
          'Location': '/',
          'Set-Cookie': `${COOKIE_NAME}=${COOKIE_VAL}; Path=/; HttpOnly; SameSite=Lax`,
        },
      });
    }

    // Sai → hiện lại form với thông báo lỗi
    return new Response(LOGIN_HTML_ERR, {
      status: 401,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }

  // Chưa đăng nhập → hiện form
  return new Response(LOGIN_HTML, {
    status: 401,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}
