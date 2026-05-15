# SiteAlyze VN — Lịch sử phiên bản

Folder này chứa **snapshot dist đã build** của từng phiên bản ổn định.
Mỗi subfolder = 1 phiên bản, có thể mở offline không cần build lại.

## Cấu trúc
```
versions/
├── README.md                ← file này
├── v0.4.0-stable/          ← snapshot dist đã build
│   ├── index.html
│   ├── assets/
│   └── ▶ MO_APP.bat        ← double-click để chạy
├── v0.5.5-terrain-fix/
└── v0.6.0-flood-climate/   ← phiên bản mới nhất
```

## Cách tạo snapshot phiên bản mới

1. Chạy build: `npm run build` (trong terminal tại thư mục gốc)
2. Chạy script: `scripts\snapshot-version.bat <tên-version>`

   Ví dụ:
   ```
   scripts\snapshot-version.bat v0.6.0-flood-climate
   ```

3. Folder mới xuất hiện trong `versions\v0.6.0-flood-climate\`

## Cách mở 1 phiên bản cũ

Double-click `▶ MO_APP.bat` trong thư mục phiên bản muốn xem.
Trình duyệt tự mở tại `http://localhost:808X`.

## Câu hỏi về đổi tên folder dự án

**"Buld web hien trang" → "Build web hien trang"**

Bạn **CÓ THỂ** đổi tên folder qua Windows Explorer (chuột phải → Rename).
Tuy nhiên sau khi đổi, cần:
1. Mở lại Claude Code với đường dẫn mới
2. Cập nhật `scripts\build-all-versions.bat` nếu có hardcode đường dẫn cũ
3. Git vẫn hoạt động bình thường (git lưu theo relative path)

Không cần thay đổi gì trong code nguồn — tất cả đường dẫn trong code đều relative.
