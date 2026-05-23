# Hướng dẫn: Bản đồ Địa hình với Tô màu Cao độ
## (Topographic Map + Elevation Coloring - topographic-map.com)

---

## 1. Tổng quan hệ thống

Trang **topographic-map.com** (dùng thư viện **Leaflet.js**) hiển thị bản đồ địa hình với lớp phủ màu sắc thể hiện cao độ (DEM overlay). Hệ thống gồm 3 lớp chính:

- **Lớp nền (Base tile layer)**: Dùng tile PNG từ OpenStreetMap/OpenTopoMap/Esri v.v.
- **Lớp DEM màu (Overlay layer)**: Ảnh JPEG base64 phủ lên bản đồ, hiển thị cao độ bằng màu gradient
- **Lớp chú giải màu (Legend/Color scale)**: Thanh màu dọc bên phải map với các mức cao độ

---

## 2. Nguồn dữ liệu độ cao (DEM Data Source)

- **Nguồn chính**: [TessaDEM](https://tessadem.com) - Near-global 30-meter Digital Elevation Model (DEM)
- **Elevation API**: `https://tessadem.com/elevation-api/` - Lấy dữ liệu độ cao từ lat/lng
- **Nguồn bản đồ nền**:
  - OpenStreetMap: `https://{a|b|c}.tile.openstreetmap.org/{z}/{x}/{y}.png`
  - OpenTopoMap: `https://{a|b|c}.tile.opentopomap.org/{z}/{x}/{y}.png`
  - Carto Light, Esri Topo, Esri Imagery, CyclOSM (các lựa chọn thay thế)

---

## 3. Cấu trúc URL của trang

```
https://en-gb.topographic-map.com/map-{mapId}/{LocationName}/
  ?center={lat},{lng_offset}
  &zoom={zoom}
  &base={base_layer_index}
  &lock={zoom},{min_elev},{max_elev}
  &popup={lat},{lng_offset}
```

### Tham số URL quan trọng:
| Tham số | Ý nghĩa | Ví dụ |
|---------|---------|-------|
| `center` | Tọa độ tâm bản đồ (lat, lng*) | `20.91458,-254.46297` |
| `zoom` | Mức zoom hiện tại | `15` |
| `base` | Index lớp bản đồ nền (0=OSM, 1=Topo, 2=Carto...) | `2` |
| `lock` | Khóa phạm vi màu: zoom,min_m,max_m | `15,20,635` |
| `popup` | Tọa độ điểm đang hiển thị popup độ cao | `20.92421,-254.45447` |

> **Lưu ý lng_offset**: Kinh độ trong URL bị offset, không phải kinh độ thực. Ví dụ Great Falls (Montana) thực tế là `-111.45189` nhưng trong URL là `-254.46297`.

---

## 4. Cơ chế render lớp DEM màu

### Cách hoạt động:
1. Server nhận bounding box của viewport hiện tại
2. Server tạo ảnh JPEG chứa bản đồ nhiệt (heatmap) màu sắc theo cao độ
3. Ảnh được trả về dưới dạng **data URL** (base64 JPEG)
4. Leaflet render ảnh này như một `L.imageOverlay` với:
   - **Opacity**: `0.45` (lớp màu bán trong suốt, thấy qua bản đồ nền)
   - **z-index**: `7`
5. Lớp nền tile được áp filter: `brightness(1.05) contrast(1.05) grayscale(1)` (xám hóa để màu DEM nổi bật)

### Overlay element properties:
```css
/* Lớp ảnh DEM */
.leaflet-overlay-pane img {
  opacity: 0.45;
  z-index: 7;
}

/* Lớp tile nền - xám hóa */
.leaflet-tile-pane {
  filter: brightness(1.05) contrast(1.05) grayscale(1);
}
```

---

## 5. Bảng màu cao độ (Color Scale / Elevation Gradient)

Hệ thống dùng **gradient màu liên tục** (rainbow/thermal) từ thấp → cao:

| Màu | Cao độ (thấp→cao) | RGBA |
|-----|-------------------|------|
| Xanh dương đậm | ≤ 20 m | rgba(0, 192, 255, 0.75) |
| Xanh lam nhạt | ~34 m | rgba(0, 238, 255, 0.75) |
| Lục lam (cyan) | ~54 m | rgba(0, 255, 223, 0.75) |
| Xanh lam-lục | ~77 m | rgba(0, 255, 172, 0.75) |
| Lục-lam | ~103 m | rgba(0, 255, 117, 0.75) |
| Xanh lá nhạt | ~131 m | rgba(0, 255, 62, 0.75) |
| Xanh lá tươi | ~160 m | rgba(0, 255, 8, 0.75) |
| Vàng-lục | ~190 m | rgba(46, 255, 0, 0.75) |
| Vàng-lục nhạt | ~222 m | rgba(102, 255, 0, 0.75) |
| Vàng-lục đậm | ~255 m | rgba(159, 255, 0, 0.75) |
| Vàng | ~289 m | rgba(216, 255, 0, 0.75) |
| Vàng chanh | ~325 m | rgba(255, 236, 0, 0.75) |
| Cam-vàng | ~361 m | rgba(255, 178, 0, 0.75) |
| Cam | ~398 m | rgba(255, 120, 0, 0.75) |
| Cam đậm | ~435 m | rgba(255, 63, 0, 0.75) |
| Đỏ-cam | ~474 m | rgba(255, 3, 0, 0.75) |
| Đỏ tươi | ~513 m | rgba(255, 55, 55, 0.75) |
| Đỏ nhạt | ~553 m | rgba(255, 114, 114, 0.75) |
| Đỏ hồng | ~594 m | rgba(255, 174, 174, 0.75) |
| Hồng nhạt | ≥ 635 m | rgba(255, 233, 233, 0.75) |

### Quy tắc gradient:
- **Thấp → cao**: Xanh dương → Lục lam → Xanh lá → Vàng → Cam → Đỏ → Hồng
- Đây là bảng màu **HSV/Rainbow** đảo ngược (thấp = mát/lạnh, cao = nóng/ấm)
- Phạm vi màu = `lock` param: `min_elevation` đến `max_elevation` của viewport
- Màu được tính **tương đối** trong phạm vi min-max của vùng đang xem

---

## 6. Logic tính màu từ cao độ (Color Interpolation Algorithm)

Gradient đi qua các **color stop** sau theo thứ tự độ cao tăng dần:

```javascript
// Các điểm dừng màu chính (chuẩn hóa 0.0 → 1.0)
const colorStops = [
  { t: 0.00, r: 0,   g: 192, b: 255 },  // Thấp nhất - xanh dương
  { t: 0.10, r: 0,   g: 255, b: 255 },  // Cyan
  { t: 0.25, r: 0,   g: 255, b: 0   },  // Xanh lá
  { t: 0.40, r: 255, g: 255, b: 0   },  // Vàng
  { t: 0.55, r: 255, g: 128, b: 0   },  // Cam
  { t: 0.70, r: 255, g: 0,   b: 0   },  // Đỏ
  { t: 1.00, r: 255, g: 225, b: 225 },  // Cao nhất - hồng nhạt
];

// Hàm tính màu cho một điểm có độ cao `elevation`
function getColor(elevation, minElev, maxElev) {
  const t = (elevation - minElev) / (maxElev - minElev); // 0.0 → 1.0
  // Nội suy tuyến tính giữa 2 color stop gần nhất
  // Trả về rgba(r, g, b, 0.75)
}
```

---

## 7. Chú giải màu (Legend Control)

- Vị trí: **top-right** của bản đồ Leaflet (`L.Control`, position: `'topright'`)
- Hiển thị **20 mức cao độ** từ max → min (top → bottom)
- Mỗi item là một `<div>` với inline style `background: rgba(r,g,b,0.75)`
- **Lock checkbox** (`#moduleMapLegendLock`): Khi checked, phạm vi màu bị khóa theo tham số `lock` trong URL thay vì tự động theo viewport

### HTML structure của legend:
```html
<div class="leaflet-control"> <!-- 21 children -->
  <div style="background:rgba(255,233,233,.75);color:#000000">635 m</div>
  <div style="background:rgba(255,174,174,.75);color:#000000">594 m</div>
  <!-- ... 18 mức nữa ... -->
  <div style="background:rgba(0,192,255,.75);color:#000000">20 m</div>
  <div> <!-- last item -->
    <input type="checkbox" id="moduleMapLegendLock" checked>
    <img src="/bin/modules/map/lock.png" alt="Lock">
  </div>
</div>
```

---

## 8. Các lớp bản đồ nền (Base Layers)

| Index | Tên | Tile URL Template |
|-------|-----|-------------------|
| 0 | OpenStreetMap | `https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png` |
| 1 | OpenTopoMap | `https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png` |
| 2 | Carto Light | `https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png` |
| 3 | Esri Topo | `https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}` |
| 4 | Esri Imagery | `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}` |
| 5 | CyclOSM | `https://{s}.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png` |

Tile format: Slippy Map / XYZ: `z` = zoom, `x` = tile column, `y` = tile row.

---

## 9. Thông tin địa điểm (About this map)

Trang hiển thị thông tin metadata của khu vực bản đồ:

```
Name: {tên địa điểm} topographic map, elevation, terrain
Location: {tên đầy đủ} ({bbox: lat_min lon_min lat_max lon_max})
Average elevation: {X} m
Minimum elevation: {X} m  
Maximum elevation: {X} m
```

---

## 10. Tương tác với bản đồ (User Interactions)

| Hành động | Kết quả |
|-----------|---------|
| Click vào bản đồ | Hiện popup bubble với độ cao tại điểm đó (đơn vị: m) |
| Scroll zoom | Thay đổi mức zoom, cập nhật DEM overlay mới |
| Pan (kéo) | Di chuyển viewport, load tiles mới + DEM overlay mới |
| Chọn base layer | Đổi lớp nền bản đồ (OSM/Topo/Esri...) |
| Bật/tắt lock | Khóa/mở phạm vi màu theo viewport hiện tại |
| Click Fullscreen | Mở bản đồ toàn màn hình |

---

## 11. Hướng dẫn tự làm tương tự với Leaflet.js

```javascript
// 1. Khởi tạo Leaflet map
const map = L.map('map').setView([lat, lng], zoom);

// 2. Thêm lớp nền (xám hóa để DEM nổi bật)
const baseLayer = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
  attribution: '© OpenTopoMap',
  className: 'grayscale-tiles'  // CSS: filter: grayscale(1)
}).addTo(map);

// 3. Lấy DEM data từ TessaDEM API
async function loadElevationOverlay(bounds) {
  const { south, west, north, east } = bounds;
  // Gọi API lấy elevation grid cho bbox
  const response = await fetch(
    `https://tessadem.com/elevation-api/?...`
  );
  const data = await response.json();
  return data; // Mảng elevation values
}

// 4. Tô màu dựa theo elevation
function elevationToColor(elevation, minElev, maxElev) {
  const t = Math.max(0, Math.min(1, (elevation - minElev) / (maxElev - minElev)));
  // Color stops: blue → cyan → green → yellow → orange → red → pink
  if (t < 0.1)  return interpolate([0,192,255], [0,255,255], t/0.1);
  if (t < 0.25) return interpolate([0,255,255], [0,255,0], (t-0.1)/0.15);
  if (t < 0.40) return interpolate([0,255,0], [255,255,0], (t-0.25)/0.15);
  if (t < 0.55) return interpolate([255,255,0], [255,128,0], (t-0.40)/0.15);
  if (t < 0.70) return interpolate([255,128,0], [255,0,0], (t-0.55)/0.15);
  return interpolate([255,0,0], [255,225,225], (t-0.70)/0.30);
}

function interpolate([r1,g1,b1], [r2,g2,b2], t) {
  return [r1+(r2-r1)*t, g1+(g2-g1)*t, b1+(b2-b1)*t];
}

// 5. Vẽ lên Canvas và tạo ImageOverlay
function renderDEMtoCanvas(elevGrid, minElev, maxElev, bounds) {
  const canvas = document.createElement('canvas');
  canvas.width = elevGrid.cols;
  canvas.height = elevGrid.rows;
  const ctx = canvas.getContext('2d');
  const imageData = ctx.createImageData(canvas.width, canvas.height);
  
  for (let i = 0; i < elevGrid.data.length; i++) {
    const elev = elevGrid.data[i];
    const [r, g, b] = elevationToColor(elev, minElev, maxElev);
    imageData.data[i*4+0] = r;
    imageData.data[i*4+1] = g;
    imageData.data[i*4+2] = b;
    imageData.data[i*4+3] = Math.round(255 * 0.45); // opacity 45%
  }
  ctx.putImageData(imageData, 0, 0);
  
  // Thêm vào Leaflet làm imageOverlay
  L.imageOverlay(canvas.toDataURL(), bounds, { opacity: 0.45 }).addTo(map);
}

// 6. Tạo legend control
function addColorLegend(minElev, maxElev, steps = 20) {
  const legend = L.control({ position: 'topright' });
  legend.onAdd = () => {
    const div = L.DomUtil.create('div', 'elevation-legend');
    for (let i = steps; i >= 0; i--) {
      const elev = minElev + (maxElev - minElev) * (i / steps);
      const [r, g, b] = elevationToColor(elev, minElev, maxElev);
      div.innerHTML += `<div style="background:rgba(${r},${g},${b},0.75)">${Math.round(elev)} m</div>`;
    }
    return div;
  };
  legend.addTo(map);
}
```

---

## 12. CSS cần thiết

```css
/* Xám hóa lớp bản đồ nền */
.leaflet-tile-pane {
  filter: brightness(1.05) contrast(1.05) grayscale(1);
}

/* Legend box */
.elevation-legend {
  background: white;
  padding: 4px;
  border-radius: 4px;
  font-size: 11px;
  line-height: 1.4;
}
.elevation-legend div {
  padding: 2px 6px;
  border-radius: 2px;
  cursor: default;
}
```

---

## 13. Nguồn dữ liệu mở để tự build

| Tên | URL | Loại dữ liệu |
|-----|-----|-------------|
| TessaDEM | https://tessadem.com | DEM 30m global (API trả JSON) |
| SRTM (NASA) | https://dwtkns.com/srtm30m/ | DEM 30m, HGT files |
| OpenTopography | https://opentopography.org | LiDAR + DEM API |
| Copernicus DEM | https://spacedata.copernicus.eu | DEM 10m Europe |
| ALOS World 3D | https://www.eorc.jaxa.jp/ALOS/en/dem/dem_vnir.htm | DEM 5m global |
| Mapzen Terrain | https://www.mapzen.com/blog/terrain-tile-service/ | Terrain tiles |

---

## 14. Tóm tắt cho Claude Code

Để tái tạo bản đồ địa hình tô màu cao độ:

1. **Dữ liệu**: Dùng TessaDEM API hoặc SRTM để lấy lưới độ cao (elevation grid) theo bbox
2. **Render màu**: Canvas 2D với gradient HSV rainbow: thấp=xanh dương, cao=hồng/đỏ
3. **Opacity**: Lớp DEM opacity = **0.45**, lớp nền grayscale
4. **Map lib**: Leaflet.js với `L.imageOverlay()` cho DEM canvas, `L.tileLayer()` cho nền
5. **Legend**: `L.control()` position topright, 20 divs với background-color = màu tương ứng
6. **Lock**: Tham số min/max elevation xác định phạm vi gradient
7. **Click to show elevation**: Bắt sự kiện `map.on('click')`, gọi elevation API, hiện popup

---

*Ghi chú: Trang topographic-map.com sử dụng server-side rendering cho ảnh DEM (không phải client-side canvas). Server nhận bbox, truy vấn TessaDEM, render ảnh JPEG base64 trả về client. Tuy nhiên client-side canvas approach ở mục 11 tạo ra kết quả tương đương.*
