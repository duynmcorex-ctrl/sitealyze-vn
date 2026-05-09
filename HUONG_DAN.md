# SiteAlyze VN — Hướng dẫn so sánh các phiên bản

Tài liệu này dành cho **kiến trúc sư** không cần biết git/CLI để có thể
mở từng phiên bản như mở folder Word.

---

## 🚀 Lần đầu setup (1 lần duy nhất, ~5-10 phút)

1. Mở **Terminal** (Cmd hoặc PowerShell) trong folder dự án
2. Chạy lệnh:
   ```
   scripts\build-all-versions.bat
   ```
3. Đợi build xong (script tự build từng phiên bản, mỗi cái ~30-60 giây)
4. Khi xong, Windows Explorer **tự mở folder** chứa các phiên bản

**Folder lưu các phiên bản nằm ở:**
```
D:\CV lam chinh thuc\OneDrive\0. Myself\9- AI\SiteAlyze-Versions\
```
(Cùng thư mục `9- AI\` với folder code, nhưng **NẰM NGOÀI** folder repo)

Cấu trúc folder sau khi build:
```
9- AI\
├── 📂 Buld web hien trang\          ← code nguồn (đang làm việc tại đây)
└── 📂 SiteAlyze-Versions\           ← CÁC PHIÊN BẢN ĐÃ BUILD ← MỞ Ở ĐÂY
    ├── 📂 v0.1.0-phase1\            ← phiên bản đầu tiên
    │   ├── index.html
    │   ├── assets/
    │   └── ▶️ MỞ APP.bat            ← double-click để chạy
    ├── 📂 v0.2.0-roads\
    ├── 📂 v0.4.0-stable\            ← phiên bản hiện tại
    └── ▶️ serve-all.bat             ← chạy nhiều phiên bản song song
```

---

## 📊 Hàng ngày — So sánh các phiên bản

**Cách 1 — Chạy 1 phiên bản:**
1. Mở folder `..\SiteAlyze-Versions\v0.X.Y-tên\`
2. Double-click `▶️ MỞ APP.bat`
3. Trình duyệt tự mở `http://localhost:8080`

**Cách 2 — So sánh 4 phiên bản cùng lúc:**
1. Mở folder `..\SiteAlyze-Versions\`
2. Double-click `▶️ serve-all.bat`
3. → 4 tab Chrome tự mở:
   - http://localhost:8001 ← v0.1.0-phase1
   - http://localhost:8002 ← v0.2.0-roads
   - http://localhost:8004 ← v0.4.0-stable
4. So sánh bằng cách kéo các cửa sổ cạnh nhau

---

## 📤 Gửi 1 phiên bản cho đồng nghiệp

1. Vào folder `..\SiteAlyze-Versions\`
2. Right-click folder phiên bản muốn gửi (vd `v0.4.0-stable\`) → "Send to" → "Compressed (zipped) folder"
3. Gửi file .zip qua Zalo / Email / Drive
4. Đồng nghiệp giải nén → double-click `▶️ MỞ APP.bat` → chạy được ngay
   (cần Node.js đã cài sẵn — nếu chưa: tải tại https://nodejs.org)

---

## 🆕 Khi có phiên bản mới (ví dụ v0.5.0)

1. Trong repo gốc, code phiên bản mới đã được tag thành `v0.5.0-xxx`
2. Sửa file `scripts\build-all-versions.bat`: thêm `v0.5.0-xxx` vào danh sách
3. Sửa file `scripts\serve-all.bat`: thêm dòng cho v0.5
4. Chạy lại `scripts\build-all-versions.bat`

---

## ❓ Câu hỏi thường gặp

**Hỏi: Sao mỗi lần `npm run dev` ra phiên bản mới nhất, không xem được phiên bản cũ?**
→ Đó là vì `npm run dev` chỉ build code hiện tại (mã nguồn mới nhất). Để xem
phiên bản cũ, phải dùng folder đã build sẵn trong `..\SiteAlyze-Versions\`.

**Hỏi: Phiên bản nào tốt nhất?**
→ Mở `CHANGELOG_VN.md` để xem nhật ký từng phiên bản. Hiện tại `v0.4.0-stable`
là phiên bản ổn định nhất.

**Hỏi: Tôi muốn thấy số phiên bản trong app?**
→ Mở app, nhìn góc trái header, có badge teal `v0.4.0` (hoặc số khác tuỳ phiên bản).

**Hỏi: Tôi sửa code thì phiên bản nào bị ảnh hưởng?**
→ Chỉ ảnh hưởng `npm run dev` (mã nguồn hiện tại). Các phiên bản trong
`SiteAlyze-Versions\` đã build sẵn → KHÔNG đổi. An toàn để sửa code thoải mái.

**Hỏi: `npx serve` báo "command not found"?**
→ Cài Node.js mới nhất tại https://nodejs.org (nó đi kèm npm và npx).
