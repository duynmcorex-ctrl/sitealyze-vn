# GIS + AI đánh giá quỹ đất xây dựng — Hệ thống tiêu chí & Ứng dụng

> **Nguồn:** Luận văn "Ứng dụng GIS và Trí tuệ Nhân tạo trong đánh giá quỹ đất xây dựng đối với đồ án Quy hoạch Chi tiết" — ĐH Kiến trúc Hà Nội (2026)  
> **Áp dụng cho:** Web đánh giá hiện trạng quy hoạch — module phân tích tiềm năng quỹ đất

---

## 1. Khung đánh giá tổng thể

### Pipeline: Input → Process → Output

```
DEM + GIS data  →  Tính 9 tiêu chí (X1–X9)  →  Random Forest  →  Phân loại Y=0/1/2
                    Chuẩn hóa 1–10 điểm         (đã huấn luyện)    trên lưới ô 20×20m
```

### 3 mức phân loại đầu ra

| Nhãn | Ý nghĩa | Màu hiển thị | Chức năng phù hợp |
|------|---------|-------------|-------------------|
| **Y=2** | Thuận lợi — đủ điều kiện kỹ thuật, pháp lý, kinh tế | 🟢 Xanh lá | Đất ở hỗn hợp, thương mại–dịch vụ, công trình công cộng mật độ cao |
| **Y=1** | Ít thuận lợi — cần giải pháp kỹ thuật bổ sung | 🟠 Cam | Nhà ở thấp tầng, hạ tầng kỹ thuật, công viên cây xanh |
| **Y=0** | Không thuận lợi — loại trừ xây dựng kiên cố | 🔴 Đỏ | Không gian xanh, mặt nước điều tiết, hành lang sinh thái |

---

## 2. Hệ thống 9 tiêu chí đầu vào (X1–X9)

### X1 — Cao độ nền địa hình (DEM)

| Điểm | Đồng bằng (0–20m) | Trung du (20–200m) | Miền núi (>200m) | Đánh giá |
|------|------------------|--------------------|-----------------|---------|
| 1 | <1m | 180–200m | >1600m | Rất không thuận lợi (vùng trũng) |
| 4 | 3–5m | 100–120m | 1000–1200m | Trung bình thấp |
| 6 | 7–10m | 60–80m | 600–800m | Trung bình khá |
| 8 | 12–15m | 40–50m | 400–500m | Thuận lợi (cốt nền trung bình) |
| 10 | >18m | <30m | <300m | Rất thuận lợi |

> **Sau Data-Centric AI:** X1 tăng trọng số từ ~8% lên ~17,3% — địa hình được nhận diện đúng tầm quan trọng.

---

### X2 — Nguy cơ ngập lụt ⚠️ **Tiêu chí quan trọng nhất**

| Điểm | Tỷ lệ diện tích nguy cơ ngập (%) | Mức độ |
|------|----------------------------------|-------|
| 1 | >10% | Rất cao — "rốn ngập" kinh niên |
| 3 | 5–7% | Khá cao — ảnh hưởng lớn hạ tầng |
| 5 | 2–3% | Trung bình — cần cốt nền 4–5m |
| 7 | 1–1,5% | Rất thấp — thủy văn ổn định |
| 9 | 0,1–0,5% | Gần như an toàn |
| 10 | <0,1% | Hoàn toàn an toàn |

> **Sau Data-Centric AI:** X2 tăng từ ~7% lên **32,4%** — trở thành ràng buộc cứng số 1, đặc biệt quan trọng ở vùng núi. Đây là tiêu chí AI dễ bỏ sót nếu dữ liệu thủy văn địa phương chưa số hóa đầy đủ.

---

### X3 — Khoảng cách tới mặt nước

| Điểm | Khoảng cách (m) | Mức độ |
|------|-----------------|-------|
| 1 | <20m | Không thuận lợi — vi phạm hành lang, nguy cơ sạt lở |
| 3 | 50–100m | Trung bình thấp — bắt đầu tiếp cận cảnh quan |
| 5 | 200–300m | Trung bình khá — phù hợp khu dân cư |
| 7 | 500–700m | Thuận lợi — khoảng cách đi bộ lý tưởng |
| 9 | >1000m | Rất thuận lợi (thoát khỏi hành lang bảo vệ hoàn toàn) |

---

### X4 — Hiện trạng sử dụng đất (GPMB)

| Điểm | Nhóm đất | Lý do |
|------|---------|-------|
| 1 | Sông, mặt nước (SON/MNC); Nghĩa trang (NTD/TTN) | Không thể xây dựng |
| 1 | Đất ở nông thôn/đô thị (ONT/ODT) | GPMB phức tạp, chi phí cao |
| 2 | Đất giao thông, thủy lợi, năng lượng | Hạ tầng thiết yếu, khó chuyển đổi |
| 3–4 | Trụ sở, giáo dục, y tế (TSC/DGD/DYT) | Công trình công cộng khó di dời |
| 6–7 | Đất nông nghiệp (trồng lúa, hoa màu) | GPMB khả thi, thủ tục rõ ràng |
| 8–9 | Đất lâm nghiệp xa khu dân cư | Chi phí thấp, ít ràng buộc xã hội |
| 10 | Đất trống chưa sử dụng | Lý tưởng — không vướng GPMB |

> **Lưu ý:** Sau Data-Centric AI, X4 giảm từ ~25% xuống ~8,7% — không nên để tiêu chí kinh tế này lấn át tiêu chí an toàn địa hình.

---

### X5 — Mật độ xây dựng hiện trạng

| Điểm | Mật độ (%) | Khả năng phát triển |
|------|-----------|---------------------|
| 1 | >90% | Đã lấp đầy, không còn không gian |
| 3 | 60–80% | Chỉ cải tạo chỉnh trang nhỏ lẻ |
| 5 | 40–50% | Phát triển hỗn hợp |
| 7 | 20–30% | Thuận tiện bố trí cơ sở hạ tầng mới |
| 9 | 5–10% | Dồi dào quỹ đất |
| 10 | <5% | Tối ưu |

---

### X6 — Sự phù hợp quy hoạch

| Điểm | Nội dung | Mức độ tương thích |
|------|---------|-------------------|
| 1 | Sai mục đích, trong vùng cấm bảo vệ nghiêm ngặt | Loại trừ |
| 3 | Phù hợp một phần nhưng vướng cốt cao độ/hành lang | Kém thuận lợi |
| 5 | Tương đối phù hợp định hướng phân khu | Trung bình |
| 7 | Phù hợp, đồng bộ hạ tầng kỹ thuật lân cận | Khá thuận lợi |
| 9 | Trong danh mục dự án ưu tiên đầu tư | Rất thuận lợi |
| 10 | Phù hợp hoàn toàn, có quy hoạch 1/500 phê duyệt | Tối ưu |

---

### X7 — Chi phí giải phóng mặt bằng (GPMB)

| Điểm | Đặc điểm hiện trạng | Khả năng thực thi |
|------|---------------------|------------------|
| 1 | Khu dân cư đông, nhà kiên cố, di tích lịch sử | Không khả thi kinh tế |
| 3 | Nhà xưởng, cơ sở sản xuất đang hoạt động | Khá cao |
| 5 | Đất nông nghiệp xen kẹt trong khu dân cư | Trung bình |
| 7 | Đất nông nghiệp thuần túy quy mô lớn | Thuận lợi |
| 9 | Đất trống, ít công trình nhỏ lẻ | Rất thuận lợi |
| 10 | Không có đối tượng GPMB | Tối ưu |

---

### X8 — Tiếp cận giao thông

| Điểm | Khoảng cách đến đường chính (m) | Đánh giá |
|------|--------------------------------|---------|
| 1 | >2000m | Rất kém — bị cô lập |
| 4 | 1000–1200m | Trung bình — chấp nhận được |
| 6 | 600–800m | Khá thuận lợi — tiếp cận buýt, tàu điện |
| 8 | 200–400m | Rất thuận lợi — gần trục giao thông chính |
| 10 | <100m | Tối ưu — mặt tiền đường lớn |

---

### X9 — Mật độ mạng lưới đường (km/km²)

| Điểm | Mật độ (km/km²) | Đánh giá |
|------|----------------|---------|
| 1 | <1,0 | Rất kém — chủ yếu đường mòn |
| 4 | 4,0–5,5 | Trung bình — đáp ứng cơ bản |
| 6 | 7,0–8,5 | Khá — kết nối giữa các ô đất tốt |
| 8 | 10,0–11,5 | Rất thuận lợi |
| 10 | >13,0 | Tối ưu — đô thị phát triển đầy đủ |

---

## 3. Kết quả mô hình AI (Random Forest)

### Hiệu suất
- **Accuracy tập train:** 93,12%  
- **Accuracy tập test:** 84,55%  
- **F1-Score sau GridSearchCV:** ≈ 0,79  
- **Cấu hình:** n_estimators=9, split 80:20 (1277 train / 320 test)

### Trọng số tiêu chí sau Data-Centric AI (quan trọng để hiểu logic)

| Tiêu chí | Trọng số ban đầu | Trọng số sau hiệu chỉnh | Nhận xét |
|---------|----------------|------------------------|---------|
| X2 — Nguy cơ ngập | ~7% | **~32,4% ↑** | Ràng buộc cứng số 1 |
| X1 — Cao độ nền | ~8% | **~17,3% ↑** | Địa hình được nhận đúng tầm |
| X3 — Khoảng cách mặt nước | thấp | **tăng ↑** | Hành lang bảo vệ được coi trọng |
| X4 — Hiện trạng sử dụng đất | **~25%** (cao nhất) | ~8,7% ↓ | Không cho phép áp đảo tiêu chí an toàn |
| X7 — Chi phí GPMB | ~20% | ~10,6% ↓ | Vai trò hỗ trợ, không lấn át tự nhiên |

---

## 4. Điểm yếu đã xác định của AI — Cần chuyên gia kiểm duyệt

### Trường hợp AI sai có hệ thống

**AI phân loại Y=2 (thuận lợi) nhưng chuyên gia chấm Y=0:**
- Xảy ra khi X4 và X7 điểm cao (đất trống, GPMB dễ)
- Nhưng thực địa có nguy cơ ngập thủy văn địa phương chưa số hóa
- Hoặc độ dốc cao, đất trũng — chỉ chuyên gia biết qua khảo sát thực địa

**3 loại lỗi có hệ thống:**
1. **False Positive Y=2:** AI "thấy" đất trống → ưu tiên kinh tế, bỏ sót rủi ro địa hình ẩn
2. **False Negative Y=0:** Mẫu Y=0 ít (chỉ ~3,7%) → AI nhận diện kém nhất (F1=0,74)
3. **Nhầm Y=1 ↔ Y=2:** Ranh giới mờ giữa "cần giải pháp thêm" và "đủ điều kiện"

---

## 5. Mô hình HITL — Human-In-The-Loop (khuyến nghị áp dụng)

```
Bước 1: AI quét diện rộng, xuất bản đồ phân loại Y=0/1/2
         ↓
Bước 2: Chuyên gia kiểm duyệt 9 tiêu chí X1–X9 tại các ô lưới nghi vấn
         (đặc biệt những ô Y=2 gần mặt nước hoặc độ dốc lớn)
         ↓
Bước 3: Phản hồi → cập nhật tập huấn luyện → mô hình cải thiện dần
```

**Nguyên tắc pháp lý:** Quyết định cuối cùng LUÔN thuộc chuyên gia có thẩm quyền. AI không thể ký phê duyệt thay quy hoạch sư.

---

## 6. Ứng dụng vào Web App

### Layer phân vùng quỹ đất (có thể thêm vào web)

```javascript
// Render lưới ô 20×20m với màu theo Y=0/1/2
const LAND_COLORS = {
  0: { fill: '#ef4444', fillOpacity: 0.6, label: 'Không thuận lợi' },  // đỏ
  1: { fill: '#f97316', fillOpacity: 0.5, label: 'Ít thuận lợi' },     // cam
  2: { fill: '#22c55e', fillOpacity: 0.4, label: 'Thuận lợi' },        // xanh lá
};

// Hiển thị tooltip khi hover ô lưới
function buildTooltip(cell) {
  return `
    <b>Phân loại: ${LAND_COLORS[cell.Y].label}</b><br>
    X1 Cao độ: ${cell.x1}/10<br>
    X2 Ngập lụt: ${cell.x2}/10<br>
    X3 Mặt nước: ${cell.x3}/10<br>
    X4 HTSDĐ: ${cell.x4}/10<br>
    X8 Giao thông: ${cell.x8}/10
  `;
}
```

### Checklist 9 tiêu chí khi phân tích lô đất

```
□ X1: Cao độ địa hình — lấy từ DEM, đối chiếu với cốt quy hoạch
□ X2: Nguy cơ ngập — đối chiếu bản đồ thủy văn + lịch sử ngập địa phương  
□ X3: Khoảng cách mặt nước — buffer analysis từ sông/hồ/kênh rạch
□ X4: Hiện trạng sử dụng đất — tra bản đồ địa chính, loại đất pháp lý
□ X5: Mật độ xây dựng — đếm công trình trên lưới 20×20m
□ X6: Sự phù hợp quy hoạch — đối chiếu QH phân khu đã phê duyệt
□ X7: Chi phí GPMB — ước tính từ loại đất và mật độ dân cư
□ X8: Khoảng cách đường chính — buffer analysis từ OSM road network
□ X9: Mật độ đường — tổng chiều dài đường / diện tích ô km²
```

### Hệ tọa độ và chuẩn xuất

- Hệ tọa độ: **VN-2000** (theo QCVN 01:2021/BXD)  
- Định dạng: GeoJSON / Shapefile  
- Tỷ lệ bản đồ đầu ra: 1/500  
- Màu chuẩn: 🟢 Xanh lá · 🟠 Cam · 🔴 Đỏ

---

## 7. So sánh GIS-AI vs phương pháp truyền thống

| Tiêu chí | Phương pháp truyền thống | Mô hình GIS-AI | Cải thiện |
|---------|--------------------------|----------------|----------|
| Tốc độ xử lý | Vài tuần | Vài giờ | ↑ Rất cao |
| Tính khách quan | Phụ thuộc chuyên gia | Dựa trên dữ liệu | ↑ Cao |
| Cập nhật dữ liệu | Thủ công, định kỳ | Tự động, thời gian thực | ↑ Cao |
| Khả năng kiểm chứng | Khó | Minh bạch, có thể kiểm tra | ↑ Rất cao |
| Chi phí triển khai | Thấp ban đầu | Cao ban đầu, thấp về sau | — Trung bình |
| Tích hợp IoT | Không có | Có thể tích hợp | ↑ Cao |

---

## 8. Cơ sở pháp lý liên quan

| Văn bản | Nội dung liên quan |
|---------|-------------------|
| Luật Đất đai số 31/2024/QH15 | Phân loại đất, quyền sử dụng, chuyển đổi mục đích |
| Luật Quy hoạch đô thị và nông thôn 2024 | Cơ sở lập đồ án quy hoạch chi tiết 1/500 |
| Nghị định 37/2010/NĐ-CP + TT 04/2022/TT-BXD | Quy trình lập, thẩm định, phê duyệt quy hoạch |
| QCVN 01:2021/BXD | Tiêu chuẩn quy hoạch xây dựng — mật độ, tầng cao, hệ số SDĐ |
| QCVN 74:2023/BTNMT | Chuẩn bản đồ địa hình, định dạng dữ liệu GIS |
| TCVN 4449:1987 | Thiết kế quy hoạch xây dựng đô thị |

---

## 9. Điều kiện tiên quyết để ứng dụng AI trong quy hoạch VN

1. **Dữ liệu GIS chuẩn hóa** — VN-2000, GeoJSON/Shapefile, DEM ≤30m
2. **Mẫu huấn luyện đủ lớn** — ≥10.000 mẫu từ ≥15 khu vực đa dạng địa hình
3. **Dữ liệu Y=0 phong phú** — nhóm "không thuận lợi" thường thiếu mẫu nhất, nguy hiểm nhất nếu bỏ sót
4. **Chuyên gia giữ quyền quyết định** — AI chỉ sàng lọc, con người phê duyệt cuối cùng

---

*Ghi chú: Luận văn này sử dụng lưới ô 20×20m làm đơn vị phân tích. Với web app, có thể tích hợp kết quả AI dưới dạng GeoJSON layer phủ lên bản đồ 2D/3D, kết hợp click-to-inspect để xem điểm 9 tiêu chí của từng ô.*
