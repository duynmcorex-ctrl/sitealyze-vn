# SiteAlyze VN — Phân tích hiện trạng quy hoạch

Web app phân tích bản đồ địa hình DXF: dựng mesh 3D, đánh giá độ dốc, đường đồng mức, điểm đặc trưng, đất xây dựng, thủy văn, nắng, gió, tầm nhìn.

## Yêu cầu

- **Node.js ≥ 18** ([tải tại nodejs.org](https://nodejs.org/))
- Trình duyệt hiện đại (Chrome / Edge / Firefox)

## Chạy nhanh (Windows)

**Cách 1 — Double-click:**
1. Mở thư mục project trong File Explorer
2. Double-click file `start.bat`
3. Lần đầu nó sẽ tự cài thư viện (~2 phút), sau đó tự mở browser ở `http://localhost:5173`

Để dừng server: bấm `Ctrl+C` trong cửa sổ PowerShell vừa mở, hoặc đóng cửa sổ.

**Cách 2 — Thủ công (PowerShell):**
```powershell
cd "D:\CV lam chinh thuc\OneDrive\0. Myself\9- AI\Buld web hien trang"
npm install
npm run dev
```

## Định dạng DXF được hỗ trợ

- `LWPOLYLINE` / `POLYLINE` có toạ độ Z trên vertex
- `LINE` có Z
- Tự bỏ qua TEXT, MTEXT, INSERT, DIMENSION, HATCH (tránh đọc nhầm thành đồng mức)
- Tự nhận diện layer chứa contour theo pattern: `DM*`, `DC*`, `CONTOUR*`, `TOPO*`, `DONGMUC*`, …
- Override pattern bằng regex trong ô **"Lọc layer"** ở sidebar nếu file có tên layer khác

## Các chế độ phân tích

| Mode | Mô tả |
|------|-------|
| Cao độ | Gradient màu theo Z |
| Độ dốc | 6 lớp 0–5°, 5–15°, 15–25°, 25–35°, 35–45°, >45° |
| Đồng mức | Marching squares, khoảng đều tuỳ chỉnh (mặc định 5m) |
| Đặc trưng | Đỉnh, đáy thung lũng, sống núi, đường tụ thủy |
| Đất XD | Score 0–100 dựa trên độ dốc + thủy văn + hướng phơi |
| Thủy văn | D8 flow direction + accumulation + mũi tên |
| Nắng | Solar position theo tháng/giờ/vĩ độ + bóng đổ |
| Gió | Particle field theo hướng gió |
| Tầm nhìn | Viewshed raycast từ điểm quan sát |

## Build production

```powershell
npm run build
npm run preview
```

## Deploy lên Vercel (chia sẻ link công khai)

1. Push code lên GitHub:
   ```powershell
   git init
   git add .
   git commit -m "Initial: SiteAlyze VN"
   ```
   Tạo repo mới trên [github.com/new](https://github.com/new), copy lệnh remote, dán vào PowerShell.

2. Vào [vercel.com](https://vercel.com), Sign in with GitHub.

3. **Add New Project** → chọn repo vừa push → **Deploy**.
   - Framework: Vite (auto-detect)
   - Build command: `npm run build`
   - Output: `dist`

4. Sau ~1 phút có link dạng `sitealyze-vn.vercel.app` để chia sẻ.

Mỗi lần `git push` Vercel tự deploy lại.
