# SiteAlyze VN — Nhật ký phát triển

Tài liệu này ghi lại tất cả phiên bản đã phát hành và sự khác nhau giữa chúng.
Để chạy phiên bản cũ, xem `HUONG_DAN.md`.

---

## 🟢 v0.4.0-stable — 2026-05-09 ← Phiên bản hiện tại

**Sửa lỗi quan trọng:**
- ✅ File DXF có layer `DUONG_DONG_MUC` giờ mở được trở lại (lỗi từ v0.2 — regex
  nhận diện đường giao thông đã match nhầm tên layer chứa từ "DUONG")
- ✅ Hướng gió 3D giờ xoay đúng theo "Hướng Bắc" đã chỉnh
- ✅ Mặt địa hình 3D mượt hơn rõ rệt (tăng từ 2 → 6 lượt làm mịn Gaussian)
- ✅ Bản đồ vệ tinh hiện đúng vị trí khu đất kể cả khi file CAD bị re-center
  về 0,0 (rất phổ biến) — fallback dùng tâm tỉnh đã chọn thủ công

**Thêm mới:**
- ⭐ **Hệ thống Multi-Version**: 4 phiên bản song song để so sánh
- ⭐ **Click bất kỳ chế độ phân tích** → hiện nhận xét + khuyến nghị ngay
  góc trái màn hình (không cần mở Báo cáo riêng)
- ⭐ Mục "Giao thông" thêm vào (5) Chế độ phân tích — click để xem
  loại mặt đường, lối vào, độ dốc dọc
- ⭐ **Bản đồ vệ tinh kéo nghiêng được 75°** (3D POC) — nhìn được khối núi
  bao quanh khu đất nhờ DEM Mapzen (miễn phí, không cần API key)
- ⭐ Header hiện số phiên bản (badge teal góc trái)
- ⭐ Tag git semver cho các phiên bản: `v0.1.0-phase1`, `v0.2.0-roads`,
  `v0.4.0-stable`

**Để cập nhật từ v0.2:** chạy `scripts\build-all-versions.bat` để tự build
4 phiên bản sang folder `..\SiteAlyze-Versions\`.

---

## 🔵 v0.3.0-basemap (intermediate, không stable)

Phiên bản trung gian thử nghiệm tích hợp bản đồ vệ tinh. Có bug:
- Khu đất không hiện trên bản đồ khi file CAD re-center 0,0

**→ Đã fix tại v0.4.** Không khuyến cáo dùng v0.3.

---

## 🟠 v0.2.0-roads — 2026-05-08 (commit 7ec5c20)

**Thêm mới:**
- Đọc file DWG trực tiếp (không cần convert sang DXF) — dùng LibreDWG WASM
- Trích xuất giao thông từ bản đồ nền: phân loại bê tông / nhựa / cấp phối
  / đất, ước tính chiều rộng, phát hiện lối vào tại biên khu đất
- 3D scene: render đường có màu theo loại mặt + marker cam tại lối vào
- **Multi-project**: kéo nhiều file CAD cùng scene để so sánh tương quan
- Phát hiện tỉnh từ tọa độ VN-2000 → tự cập nhật vĩ độ + khí hậu (gió theo
  mùa, mưa hàng năm) cho phân tích nắng/gió/thủy văn
- Card vi khí hậu trong sidebar: mô tả vùng + cảnh báo mùa khô
- Báo cáo cite cụ thể tỉnh + vùng khí hậu + so sánh gió phân tích vs
  gió khí hậu điển hình

**⚠️ Lỗi đã biết:**
- File CAD có layer chứa từ "DUONG" (vd `DUONG_DONG_MUC` = đường đồng mức)
  bị nhận nhầm là đường giao thông → terrain không hiện
- → Đã fix ở v0.4

---

## ⚪ v0.1.0-phase1 — 2026-04-20 (commit e008b3b)

**Phiên bản đầu tiên** — demo 50%

**Tính năng cơ bản:**
- 9 chế độ phân tích: cao độ, độ dốc, đường đồng mức, nắng, gió, thủy văn,
  đất xây dựng (suitability), đặc trưng địa hình, tầm nhìn (viewshed)
- Đường đồng mức trung thực từ DXF gốc (không re-compute từ heightmap)
- Báo cáo phân tích tự động bằng tiếng Việt — 9 section
- Light/Dark mode
- Compass HUD + ViewButtons (camera presets: Top, Iso, Front, Side)
- Sidebar: tham số môi trường (tháng/giờ/hướng Bắc/vĩ độ/gió/contour interval)
- Project save/load (.siteproj.json)

---

## 📋 Quy ước phiên bản (semver)

- **MAJOR.MINOR.PATCH** — v0.X.Y
- MAJOR (0 → 1): khi app stable production
- MINOR: thêm tính năng lớn (multi-version, basemap, roads, ...)
- PATCH: bug fix nhỏ
- Suffix `-phase1`, `-roads`, `-stable`: nhãn ngữ cảnh cho dễ nhớ

## 🧭 Roadmap dự kiến

**v0.5.0+** (Đợt 2 — chưa làm):
- Form thông tin dự án: tên, diện tích, **loại đồ án** (đô thị / golf / KCN / du lịch)
- **Phân tích cạnh tranh OSM**: với dự án golf → liệt kê các sân golf khác
  trong bán kính 5/10/15/20km (số hố, quy mô); với KCN → các KCN khác; v.v.
- Phân tích xã/phường (OSM admin_level=10), khoảng cách sân bay + TT hành chính
- **QCVN 01:2021/BXD validator**: cao độ nền vs mực ngập theo loại đô thị
- **Tích hợp địa hình 3D đầy đủ**: Copernicus GLO-30 DEM bao quanh trong Three.js
  scene, "đục lỗ" cho khu đất DXF chi tiết hiện ở giữa
