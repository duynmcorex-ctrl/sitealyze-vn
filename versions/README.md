# SiteAlyze VN — Lịch sử phiên bản

Folder này chứa **snapshot đã build** của từng phiên bản ổn định.
Mỗi subfolder = 1 phiên bản, có thể mở offline mà không cần npm/build lại.

---

## 🚀 Cách lưu phiên bản hiện tại (1 lệnh)

**Trước khi update lớn**, hãy chạy script sau để lưu phiên bản đang dùng:

```bat
scripts\save-version.bat v0.7.0-sidebar-redesign
```

Script tự động sẽ:
1. ✅ Chạy `npm run build` → tạo `dist/`
2. ✅ Copy `dist/` sang `versions/v0.7.0-sidebar-redesign/`
3. ✅ Tạo file `MO_APP.bat` để mở nhanh
4. ✅ Tạo `git tag v0.7.0-sidebar-redesign` để có thể `git checkout` về sau

**Quy tắc đặt tên version:**
- Format: `vX.Y.Z-mô-tả-ngắn`
- Ví dụ: `v0.6.0-flood-climate`, `v0.7.0-sidebar-redesign`, `v0.8.0-kmz-upload`

---

## 📂 Cấu trúc

```
versions/
├── README.md                      ← file này
├── v0.6.0-flood-climate/          ← snapshot dist
│   ├── index.html
│   ├── assets/
│   ├── libredwg-web.wasm
│   └── MO_APP.bat                 ← double-click để chạy
└── v0.7.0-sidebar-redesign/
    └── ...
```

Mỗi snapshot là **một bản build hoàn chỉnh** — chạy được offline.

---

## 🌐 Cách mở 1 phiên bản cũ

1. Mở folder version: `versions\v0.6.0-flood-climate\`
2. **Double-click** file `MO_APP.bat`
3. Trình duyệt tự mở phiên bản đó ở `http://localhost:8086`

> Mỗi version dùng 1 port riêng (8080 + minor version) → chạy đồng thời nhiều version để **so sánh trực tiếp**.

---

## 🔁 Cách quay về code cũ để chỉnh sửa (qua Git)

Nếu chỉ cần xem giao diện cũ → dùng cách `MO_APP.bat` ở trên.

Nếu cần **chỉnh sửa code phiên bản cũ**:

```bash
# Xem các tag có
git tag -l

# Checkout vào tag cũ (vd v0.6.0-flood-climate)
git checkout v0.6.0-flood-climate

# (Tuỳ chọn) Tạo branch mới để sửa
git checkout -b fix-v0.6.0

# Quay về phiên bản mới nhất
git checkout main
```

Hoặc **so sánh code** giữa 2 phiên bản:

```bash
git diff v0.6.0-flood-climate v0.7.0-sidebar-redesign -- src/components/Sidebar/Sidebar.tsx
```

---

## ⚠️ Quy tắc làm việc (best practice)

| Khi nào | Việc cần làm |
|---|---|
| Trước khi merge thay đổi UI lớn | `scripts\save-version.bat vX.Y.Z-...` |
| Sau khi fix bug quan trọng | `scripts\save-version.bat vX.Y.Z-fix-...` |
| Mỗi tuần | Snapshot 1 lần, kể cả không có thay đổi lớn |

Folder `versions/` được loại trừ khỏi git (`.gitignore` chứa `versions/v*/`), nên không làm phình repo.

---

## 📋 Lịch sử các phiên bản

| Version | Mô tả | Cách mở |
|---------|-------|---------|
| **v0.6.0-flood-climate** | Flood sim 3D + climate panel + topographic gradient | `versions\v0.6.0-flood-climate\MO_APP.bat` |
| **v0.7.0-sidebar-redesign** | 6 mục collapsible SketchUp-style + scene save + SWOT + resize | (chạy `save-version.bat v0.7.0-sidebar-redesign` để tạo) |
| **v0.8.0-minimal-ui-montserrat** | Fix lệch màu cao độ giữa clip/buffer, nút tắt/bật lưới, xuất ảnh 4K cho slide, UI tối giản (bỏ viền bảng dư), font Montserrat | `versions\v0.8.0-minimal-ui-montserrat\MO_APP.bat` |
