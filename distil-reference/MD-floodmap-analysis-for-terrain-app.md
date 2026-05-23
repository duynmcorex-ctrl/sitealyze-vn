# FloodMap.net — Phân tích tính năng & Hướng dẫn áp dụng vào Web App Địa Hình

> **Nguồn tham khảo:** https://www.floodmap.net/  
> **Ngày phân tích:** 15/05/2026  
> **Mục đích:** Áp dụng các tính năng của FloodMap vào web app địa hình (terrain web app)

---

## 1. Tổng quan kiến trúc kỹ thuật

### Stack công nghệ
- **Bản đồ:** Leaflet.js v1.7.1
- **Basemap tiles:** Esri (esri-leaflet v2.3.2) + OpenStreetMap
- **Geocoding:** ArcGIS World Geocoder (`https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/`)
- **Elevation API:** Custom API endpoint của FloodMap
- **Map export:** leaflet-image (chụp canvas thành ảnh)
- **Fullscreen:** Leaflet.fullscreen plugin
- **Framework UI:** Bootstrap 3.3.7 + jQuery 1.12.4

### Cấu trúc layout (3 cột)
```
[Left Panel 280px] | [Map Canvas ~70%] | [Pro Promo ~220px]
```

---

## 2. Các chế độ bản đồ (Map Modes)

FloodMap có 3 chế độ chính, chọn bằng radio button:

| Chế độ | Radio value | Mô tả |
|--------|-------------|-------|
| FloodMap | `floodmap` | Bản đồ lũ — hiển thị vùng ngập (màu xanh) dưới mức elevation đặt |
| Color FloodMap | `colfloodmap` | Bản đồ lũ màu sắc (Pro) — tô màu theo độ cao bằng color tile từ server |
| Color ElevationMap | `colelevmap` | Bản đồ độ cao màu sắc (Pro) — hiển thị toàn bộ địa hình bằng color gradient |

### Áp dụng vào dự án:
```html
<!-- HTML radio buttons -->
<div id="map-mode-panel">
  <label><input type="radio" name="mapmode" value="floodmap" checked> FloodMap (Lũ)</label>
  <label><input type="radio" name="mapmode" value="elevation"> Bản đồ Độ cao</label>
  <label><input type="radio" name="mapmode" value="terrain3d"> 3D Địa hình</label>
</div>
```

---

## 3. Elevation Control — Điều khiển mực nước/độ cao

### HTML structure (theo phân tích DOM):
```html
<div id="setElev">
  <label>Elevation/Height/Water Level (-/+):</label>
  <input type="text" id="elev" value="400" />
  <button onclick="setWaterLevel()">Set</button>
  <span id="curElev">400</span> meter.
</div>
```

### Logic hoạt động:
1. User nhập số vào `#elev` (dương = độ cao trên mặt biển, âm = độ sâu đại dương)
2. Nhấn "Set" → cập nhật biến toàn cục `waterLevel`
3. Reload flood tile layer với elevation mới
4. URL cập nhật: `https://www.floodmap.net/?ll=LAT,LNG&z=ZOOM&e=ELEVATION`

### Áp dụng vào dự án:
```javascript
// Elevation control
let waterLevel = 400;

document.getElementById('btn-set-elev').addEventListener('click', () => {
  waterLevel = parseInt(document.getElementById('elev-input').value);
  document.getElementById('cur-elev-label').textContent = waterLevel + ' m';
  updateFloodLayer();
  updateUrlParams();
});

function updateFloodLayer() {
  if (floodLayer) map.removeLayer(floodLayer);
  // Tải lại tile layer với elevation mới
  floodLayer = L.tileLayer(buildFloodTileUrl(waterLevel), tileOptions);
  floodLayer.addTo(map);
}
```

---

## 4. Elevation API — API lấy độ cao điểm

### Endpoint (FloodMap):
```
GET https://www.floodmap.net/pro/elevationmap/getelevation.ashx
  ?lat={latitude}
  &lon={longitude}
  &zoom={zoom_level}

→ Trả về: elevation (meters) dạng JSON hoặc text
```

### Các API elevation miễn phí thay thế:
```javascript
// 1. Open-Elevation API (miễn phí, open source)
async function getElevation(lat, lon) {
  const res = await fetch(`https://api.open-elevation.com/api/v1/lookup?locations=${lat},${lon}`);
  const data = await res.json();
  return data.results[0].elevation;
}

// 2. OpenTopoData (miễn phí)
async function getElevationOpenTopo(lat, lon) {
  const res = await fetch(`https://api.opentopodata.org/v1/srtm30m?locations=${lat},${lon}`);
  const data = await res.json();
  return data.results[0].elevation;
}

// 3. Mapbox Terrain-RGB (cần API key)
async function getElevationMapbox(lat, lon, zoom, mapboxToken) {
  // Decode từ Terrain-RGB tile
  // elevation = -10000 + ((R * 256 * 256 + G * 256 + B) * 0.1)
}
```

---

## 5. Popup khi click bản đồ

### Nội dung popup:
```html
<div class="leaflet-popup-content">
  <p>
    <b>Latitude:</b> 18.377986<br>
    <b>Longitude:</b> -13.636043<br>
    <br>
    <span style="color:red; font-weight:bold">
      Probable Water Level: 336 meters.
    </span><br>
    Elevation: <span style="background:#007bff; color:white; padding:2px 6px; border-radius:3px">64</span> 
    meters + <input type="text" id="addElev" value="0" size="3">
    <br>
    <button onclick="setWaterLevelFromPopup()">Set Water Level</button>
    <br><br>
    <a href="/3DFloodMap/?lat=18.37&lon=-13.63">👉 View in 3D</a>
  </p>
</div>
```

### Logic popup:
- **Click map** → gọi elevation API → nhận elevation
- Hiện "Probable Water Level" = `waterLevel - elevation` (mét trên mặt đất)
- Cho phép user nhập `addElev` (thêm/bớt) rồi set làm water level mới

### Áp dụng:
```javascript
map.on('click', async (e) => {
  const { lat, lng } = e.latlng;
  const elevation = await getElevation(lat, lng);
  const probableWaterLevel = waterLevel - elevation;
  
  const popupContent = `
    <b>Vĩ độ:</b> ${lat.toFixed(6)}<br>
    <b>Kinh độ:</b> ${lng.toFixed(6)}<br><br>
    <span style="color:red; font-weight:bold">
      Mực nước dự tính: ${probableWaterLevel} m
    </span><br>
    <b>Độ cao địa điểm:</b> 
    <span class="elev-badge">${elevation}</span> m<br>
    <button onclick="setLevelFromPoint(${elevation})">Đặt mực nước tại đây</button>
  `;
  
  L.popup()
    .setLatLng(e.latlng)
    .setContent(popupContent)
    .openOn(map);
});
```

---

## 6. Color Palette — Bảng màu địa hình

### FloodMap có 2 palette:
| Tên | Value | Mô tả |
|-----|-------|-------|
| Rainbow | `rainbow` | Màu cầu vồng: tím→xanh→cyan→xanh lá→vàng→cam→đỏ |
| Classic | `floodmap` | Màu truyền thống: xanh lam→xanh lá→vàng→cam→đỏ nâu |

### Color gradient cho terrain (từ thấp đến cao):
```javascript
// Rainbow palette (giống DEM visualization)
const RAINBOW_COLORS = [
  { elev: 0,   color: '#4B0082' }, // tím (đại dương sâu)
  { elev: 50,  color: '#0000FF' }, // xanh dương
  { elev: 100, color: '#00FFFF' }, // cyan
  { elev: 200, color: '#00FF00' }, // xanh lá
  { elev: 300, color: '#FFFF00' }, // vàng
  { elev: 400, color: '#FF8000' }, // cam
  { elev: 500, color: '#FF0000' }, // đỏ
  { elev: 800, color: '#8B4513' }, // nâu
];

// Classic/FloodMap palette
const CLASSIC_COLORS = [
  { elev: -100, color: '#0000AA' }, // đại dương sâu
  { elev: 0,    color: '#4169E1' }, // ven biển
  { elev: 50,   color: '#228B22' }, // đồng bằng
  { elev: 200,  color: '#90EE90' }, // đồi thấp
  { elev: 400,  color: '#FFFF00' }, // đồi cao
  { elev: 600,  color: '#FF8C00' }, // núi thấp
  { elev: 1000, color: '#8B0000' }, // núi cao
  { elev: 3000, color: '#FFFFFF' }, // đỉnh tuyết
];

function getColorForElevation(elev, palette = RAINBOW_COLORS) {
  for (let i = 0; i < palette.length - 1; i++) {
    if (elev >= palette[i].elev && elev < palette[i+1].elev) {
      const t = (elev - palette[i].elev) / (palette[i+1].elev - palette[i].elev);
      return interpolateColor(palette[i].color, palette[i+1].color, t);
    }
  }
  return palette[palette.length - 1].color;
}
```

---

## 7. Elevation Color Map — API tile tạo ảnh màu

### FloodMap Pro API (tham khảo pattern):
```
GET https://www.floodmap.net/pro/elevationmap/getMap.ashx
  ?lat={center_lat}
  &lon={center_lon}
  &zoom={zoom}
  &width={map_width_px}
  &height={map_height_px}
  &p=1
  &colorpal={rainbow|floodmap}
  &sea={true|false}    // include sea depth
  &slippy=true

→ Trả về: ảnh PNG bản đồ elevation với màu sắc
```

### Thay thế miễn phí — Mapbox Terrain-RGB:
```javascript
// Tile URL cho elevation data dạng màu RGB-encoded
const TERRAIN_RGB_URL = 'https://api.mapbox.com/v4/mapbox.terrain-rgb/{z}/{x}/{y}.pngraw?access_token={token}';

// Decode màu RGB → elevation (meters)
function decodeTerrainRGB(r, g, b) {
  return -10000 + ((r * 256 * 256 + g * 256 + b) * 0.1);
}

// Tự render elevation map với canvas
function renderElevationToCanvas(tileData, canvas, palette) {
  const ctx = canvas.getContext('2d');
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  
  for (let i = 0; i < imageData.data.length; i += 4) {
    const r = imageData.data[i];
    const g = imageData.data[i+1];
    const b = imageData.data[i+2];
    const elev = decodeTerrainRGB(r, g, b);
    const color = getColorForElevation(elev, palette);
    
    // Set màu mới
    const [nr, ng, nb] = hexToRgb(color);
    imageData.data[i]   = nr;
    imageData.data[i+1] = ng;
    imageData.data[i+2] = nb;
  }
  ctx.putImageData(imageData, 0, 0);
}
```

---

## 8. Basemap Layers — Các lớp nền bản đồ

### Danh sách đầy đủ (từ DOM select#basemaps):
```javascript
const BASEMAP_LAYERS = {
  'OpenStreetMap': {
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '© OpenStreetMap contributors',
    subdomains: ['a','b','c'],
    maxZoom: 19,
    type: 'leaflet-tile'
  },
  'OpenTopoMap': {
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    attribution: '© OpenTopoMap (CC-BY-SA)',
    maxZoom: 17,
    type: 'leaflet-tile'
  },
  'Topographic': {
    key: 'Topographic',
    type: 'esri-basemap'
  },
  'Imagery': {
    key: 'Imagery',
    type: 'esri-basemap'
  },
  'ImageryClarity': {
    key: 'ImageryClarity',
    type: 'esri-basemap'
  },
  'ImageryFirefly': {
    key: 'ImageryFirefly',
    type: 'esri-basemap'
  },
  'Streets': {
    key: 'Streets',
    type: 'esri-basemap'
  },
  'NationalGeographic': {
    key: 'NationalGeographic',
    type: 'esri-basemap'
  },
  'Oceans': {
    key: 'Oceans',
    type: 'esri-basemap'
  },
  'Gray': {
    key: 'Gray',
    type: 'esri-basemap'
  },
  'DarkGray': {
    key: 'DarkGray',
    type: 'esri-basemap'
  },
  'ShadedRelief': {
    key: 'ShadedRelief',
    type: 'esri-basemap'
  },
  'Physical': {
    key: 'Physical',
    type: 'esri-basemap'
  }
};

// Hàm setBasemap:
function setBasemap(key) {
  if (currentBasemap) map.removeLayer(currentBasemap);
  const config = BASEMAP_LAYERS[key];
  if (config.type === 'esri-basemap') {
    currentBasemap = L.esri.basemapLayer(config.key);
  } else {
    currentBasemap = L.tileLayer(config.url, config);
  }
  currentBasemap.addTo(map);
  currentBasemap.bringToBack();
}
```

### Esri Basemap URLs trực tiếp (không cần API key):
```
Topographic:   https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}
Imagery:       https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}
Streets:       https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}
NatGeo:        https://server.arcgisonline.com/ArcGIS/rest/services/NatGeo_World_Map/MapServer/tile/{z}/{y}/{x}
Oceans:        https://server.arcgisonline.com/ArcGIS/rest/services/Ocean_Basemap/MapServer/tile/{z}/{y}/{x}
ShadedRelief:  https://server.arcgisonline.com/ArcGIS/rest/services/World_Shaded_Relief/MapServer/tile/{z}/{y}/{x}
Physical:      https://server.arcgisonline.com/ArcGIS/rest/services/World_Physical_Map/MapServer/tile/{z}/{y}/{x}
```

---

## 9. Search / Geocoding

### Cách FloodMap implement:
- Dùng **ArcGIS World Geocoder** qua `esri-leaflet`
- Search box floating trên bản đồ (top-left)
- Khi chọn kết quả: map.flyTo() + đặt marker + gọi elevation API

### Áp dụng:
```javascript
// Leaflet.esri.Geocoding (hoặc dùng Nominatim miễn phí)
const searchControl = L.esri.Geocoding.geosearch({
  position: 'topleft',
  placeholder: 'Tìm địa điểm...',
  useMapBounds: false,
  providers: [
    L.esri.Geocoding.arcgisOnlineProvider()
  ]
}).addTo(map);

searchControl.on('results', async (data) => {
  if (data.results.length > 0) {
    const { latlng, text } = data.results[0];
    map.flyTo(latlng, 12);
    const elevation = await getElevation(latlng.lat, latlng.lng);
    // Hiện popup với elevation info
    showElevationPopup(latlng, elevation, text);
  }
});

// Hoặc dùng Nominatim (OpenStreetMap, miễn phí):
async function searchNominatim(query) {
  const res = await fetch(
    `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5`
  );
  return await res.json();
}
```

---

## 10. Flood Visualization — Hiển thị vùng ngập

### Cách FloodMap render lũ:
FloodMap dùng **custom tile layer** từ server riêng (floodmap.net tile server).  
Tile server tô màu pixel dựa trên elevation data (SRTM/GMTED) so sánh với water level đặt vào.

### Tự implement bằng Canvas Layer:
```javascript
// Custom Leaflet Canvas Tile Layer
const FloodLayer = L.GridLayer.extend({
  createTile: function(coords, done) {
    const tile = document.createElement('canvas');
    tile.width = tile.height = this.options.tileSize || 256;
    
    const ctx = tile.getContext('2d');
    const { z, x, y } = coords;
    
    // Lấy elevation tile từ Mapbox Terrain-RGB
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = `https://api.mapbox.com/v4/mapbox.terrain-rgb/${z}/${x}/${y}.pngraw?access_token=${MAPBOX_TOKEN}`;
    
    img.onload = () => {
      const offscreen = document.createElement('canvas');
      offscreen.width = offscreen.height = 256;
      const offCtx = offscreen.getContext('2d');
      offCtx.drawImage(img, 0, 0);
      
      const imageData = offCtx.getImageData(0, 0, 256, 256);
      const outputData = ctx.createImageData(256, 256);
      
      for (let i = 0; i < imageData.data.length; i += 4) {
        const r = imageData.data[i];
        const g = imageData.data[i+1];
        const b = imageData.data[i+2];
        const elev = -10000 + ((r * 256 * 256 + g * 256 + b) * 0.1);
        
        if (elev <= waterLevel) {
          // Vùng ngập: màu xanh với độ trong suốt theo độ sâu
          const depth = waterLevel - elev;
          const alpha = Math.min(200, 80 + depth * 0.5);
          outputData.data[i]   = 0;
          outputData.data[i+1] = 100;
          outputData.data[i+2] = 220;
          outputData.data[i+3] = alpha;
        } else {
          outputData.data[i+3] = 0; // Trong suốt
        }
      }
      ctx.putImageData(outputData, 0, 0);
      done(null, tile);
    };
    
    return tile;
  }
});
```

---

## 11. URL Sharing — Chia sẻ vị trí

### Format URL của FloodMap:
```
https://www.floodmap.net/?ll={lat},{lon}&z={zoom}&e={elevation}

Ví dụ:
https://www.floodmap.net/?ll=20.13847,-9.84375&z=3&e=400
```

### Áp dụng:
```javascript
// Cập nhật URL khi thay đổi map state
function updateShareUrl() {
  const center = map.getCenter();
  const zoom = map.getZoom();
  const params = new URLSearchParams({
    lat: center.lat.toFixed(6),
    lng: center.lng.toFixed(6),
    z: zoom,
    elev: waterLevel,
    mode: currentMode,
    basemap: currentBasemap
  });
  
  const url = `${window.location.origin}${window.location.pathname}?${params}`;
  document.getElementById('share-url').value = url;
  
  // Update browser history without reload
  window.history.replaceState({}, '', url);
}

// Đọc URL params khi load
function loadFromUrl() {
  const params = new URLSearchParams(window.location.search);
  if (params.has('lat') && params.has('lng')) {
    const lat = parseFloat(params.get('lat'));
    const lng = parseFloat(params.get('lng'));
    const zoom = parseInt(params.get('z') || '10');
    map.setView([lat, lng], zoom);
  }
  if (params.has('elev')) {
    waterLevel = parseInt(params.get('elev'));
    document.getElementById('elev').value = waterLevel;
  }
}
```

---

## 12. Map Export / Download

### FloodMap dùng leaflet-image:
```javascript
import leafletImage from 'leaflet-image';

document.getElementById('btn-download').addEventListener('click', () => {
  leafletImage(map, (err, canvas) => {
    if (err) { console.error(err); return; }
    
    const link = document.createElement('a');
    link.download = 'terrain-map.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
  });
});
```

---

## 13. Legend / Colorbar

### FloodMap hiển thị legend dưới bản đồ:
Thanh màu horizontal với nhãn elevation (0, 45, 85, 123... 399 m)

### Tự implement:
```javascript
// Leaflet custom control cho legend
const LegendControl = L.Control.extend({
  options: { position: 'bottomleft' },
  
  onAdd: function(map) {
    const div = L.DomUtil.create('div', 'map-legend');
    div.innerHTML = buildLegendHTML(currentPalette, waterLevel);
    return div;
  },
  
  update: function(palette, maxElev) {
    this._container.innerHTML = buildLegendHTML(palette, maxElev);
  }
});

function buildLegendHTML(palette, maxElev) {
  const gradientStops = palette.map(p => 
    `${p.color} ${Math.round((p.elev / maxElev) * 100)}%`
  ).join(', ');
  
  return `
    <div class="legend-bar" style="
      background: linear-gradient(to right, ${gradientStops});
      width: 300px; height: 20px; border-radius: 3px;
    "></div>
    <div class="legend-labels" style="display:flex; justify-content:space-between">
      <span>0m</span>
      <span>${Math.round(maxElev/2)}m</span>
      <span>${maxElev}m</span>
    </div>
  `;
}
```

---

## 14. Data Sources — Nguồn dữ liệu độ cao

| Nguồn | Độ phân giải | Phạm vi | Link |
|-------|-------------|---------|------|
| SRTM (NASA) | 30m / 90m | Toàn cầu (56°S–60°N) | https://srtm.csi.cgiar.org |
| GMTED2010 | 250m | Toàn cầu | USGS |
| ETOPO1 | 1 arc-minute | Toàn cầu (biển + đất) | NOAA |
| Mapzen/Terrarium | 1m encode RGB | Toàn cầu | https://registry.opendata.aws/terrain-tiles/ |
| Mapbox Terrain-RGB | ~5m | Toàn cầu | https://docs.mapbox.com/data/tilesets/reference/mapbox-terrain-rgb-v1/ |
| OpenTopoData | 30m SRTM | API miễn phí | https://www.opentopodata.org |

---

## 15. Complete Implementation Guide — Hướng dẫn tổng hợp

### Thư viện cần thiết:
```html
<!-- Leaflet -->
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>

<!-- Esri Leaflet (tùy chọn, cho Esri basemaps) -->
<script src="https://unpkg.com/esri-leaflet@3.0.10/dist/esri-leaflet.js"></script>

<!-- Leaflet Fullscreen -->
<link href="https://api.mapbox.com/mapbox.js/plugins/leaflet-fullscreen/v1.0.1/leaflet.fullscreen.css" rel="stylesheet">
<script src="https://api.mapbox.com/mapbox.js/plugins/leaflet-fullscreen/v1.0.1/Leaflet.fullscreen.min.js"></script>

<!-- Leaflet Image (export) -->
<script src="https://unpkg.com/leaflet-image@latest/leaflet-image.js"></script>
```

### HTML Structure:
```html
<div id="app-container">
  <!-- Left Panel -->
  <div id="left-panel">
    <!-- Map mode selector -->
    <div class="panel-section" id="mode-selector">
      <label><input type="radio" name="mapmode" value="flood" checked> Bản đồ Lũ</label>
      <label><input type="radio" name="mapmode" value="elevation"> Bản đồ Độ cao</label>
    </div>
    
    <!-- Elevation control -->
    <div class="panel-section" id="elev-control">
      <div class="label">Mực nước / Độ cao (-/+):</div>
      <div class="elev-row">
        <input type="number" id="elev" value="100" min="-1000" max="9000">
        <button id="btn-set-elev">Đặt</button>
        <span id="cur-elev">100 m</span>
      </div>
      <p class="hint">Click vào bản đồ để lấy độ cao tại vị trí đó</p>
    </div>
    
    <!-- Color palette (cho elevation mode) -->
    <div class="panel-section" id="palette-control">
      <div class="label">Bảng màu:</div>
      <label><input type="radio" name="palette" value="rainbow" checked>
        Rainbow <div class="palette-preview rainbow"></div></label>
      <label><input type="radio" name="palette" value="classic">
        Classic <div class="palette-preview classic"></div></label>
      <label>
        <input type="checkbox" id="sea-depth"> 
        Hiển thị độ sâu đại dương
      </label>
    </div>
    
    <!-- Export -->
    <button id="btn-export">Tải ảnh bản đồ</button>
    
    <!-- Share URL -->
    <div class="panel-section">
      <div class="label">Chia sẻ:</div>
      <input type="text" id="share-url" readonly>
    </div>
  </div>
  
  <!-- Map Container -->
  <div id="map-container">
    <div id="map"></div>
    <!-- Basemap Selector (float trên map) -->
    <div id="basemap-selector">
      <select id="basemaps">
        <option value="OpenStreetMap">OpenStreetMap</option>
        <option value="Topographic">Topographic</option>
        <option value="Imagery">Ảnh vệ tinh</option>
        <option value="ShadedRelief">Shaded Relief</option>
      </select>
    </div>
  </div>
</div>
```

### CSS Key Styles:
```css
#app-container {
  display: flex;
  height: 100vh;
}
#left-panel {
  width: 280px;
  min-width: 280px;
  background: #f8f9fa;
  border: 1px solid #dee2e6;
  border-radius: 5px;
  padding: 15px;
  overflow-y: auto;
  z-index: 500;
}
#map-container {
  flex: 1;
  position: relative;
}
#map {
  width: 100%;
  height: 100%;
}
#basemap-selector {
  position: absolute;
  top: 10px;
  right: 10px;
  z-index: 400;
  background: white;
  padding: 5px;
  border-radius: 4px;
  box-shadow: 0 1px 5px rgba(0,0,0,0.4);
}
.panel-section {
  border: 1px solid #dee2e6;
  border-radius: 4px;
  padding: 10px;
  margin-bottom: 10px;
  background: white;
}
.elev-row { display: flex; align-items: center; gap: 5px; }
#elev { width: 70px; }
#btn-set-elev { background: #f0ad4e; color: white; border: none; padding: 5px 12px; border-radius: 3px; cursor: pointer; }
#cur-elev { color: #e74c3c; font-weight: bold; }

/* Palette preview */
.palette-preview.rainbow {
  height: 12px; width: 150px;
  background: linear-gradient(to right, #4B0082, #0000FF, #00FFFF, #00FF00, #FFFF00, #FF8000, #FF0000);
  border-radius: 2px;
}
.palette-preview.classic {
  height: 12px; width: 150px;
  background: linear-gradient(to right, #0000AA, #228B22, #90EE90, #FFFF00, #FF8C00, #8B0000, #FFFFFF);
  border-radius: 2px;
}
```

---

## 16. Tính năng đặc trưng cần note

### ✅ Đã implement (có thể copy pattern):
1. **Click-to-get-elevation** — click map → gọi API → hiện popup
2. **Set water level** → reload tile layer
3. **URL persistence** — state lưu trong URL params
4. **Basemap switcher** — dropdown float trên map (top-right)
5. **Color palette switcher** — 2 options rainbow/classic
6. **Fullscreen mode** — Leaflet.fullscreen plugin
7. **Search geocoding** — ArcGIS hoặc Nominatim
8. **Map export** — leaflet-image → canvas → PNG download

### ⚠️ Tính năng Pro (cần API server riêng):
- Color tile server (render elevation tiles từ DEM data)
- 3D Flood Map (WebGL/Three.js)
- High-res elevation tiles
- Real-time flood forecast data

### 💡 Mẹo implementation:
- Sử dụng **Mapbox Terrain-RGB** để tự render elevation colors trong browser (không cần server)
- **Open-Elevation** hoặc **OpenTopoData** API cho click-to-get-elevation (miễn phí)
- **Esri basemaps** không cần API key cho đa số tile types
- Dùng `map.on('moveend', updateShareUrl)` để auto-update URL khi pan/zoom

---

## 17. Tham khảo thêm

- Leaflet.js docs: https://leafletjs.com/reference.html
- Esri-Leaflet docs: https://esri.github.io/esri-leaflet/
- Mapbox Terrain-RGB: https://docs.mapbox.com/data/tilesets/reference/mapbox-terrain-rgb-v1/
- Open-Elevation API: https://open-elevation.com/
- OpenTopoData API: https://www.opentopodata.org/
- Terrain tiles (AWS): https://registry.opendata.aws/terrain-tiles/
- Leaflet providers preview: https://leaflet-extras.github.io/leaflet-providers/preview/
