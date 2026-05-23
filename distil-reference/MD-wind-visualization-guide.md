# Hướng Dẫn Hiển Thị Hướng Gió Di Chuyển trên Web App
## Học từ Windy.com (v50.0.3)

---

## 1. Tổng Quan về Windy.com

Windy.com là ứng dụng bản đồ thời tiết tương tác sử dụng các kỹ thuật visualization tiên tiến để hiển thị dữ liệu gió theo thời gian thực. Phân tích kỹ thuật cho thấy Windy sử dụng:

- **MapLibre GL** (fork của Mapbox GL) làm nền bản đồ
- **WebGL2** để render đồ họa GPU-accelerated
- **Particle animation system** để mô phỏng luồng gió
- **Tile-based data** – dữ liệu gió được nén vào ảnh JPG/PNG

---

## 2. Các Phương Pháp Hiển Thị Gió

### 2.1 Particle Animation (Chính – Windy sử dụng)

Đây là phương pháp nổi bật nhất của Windy: hàng ngàn hạt nhỏ (particles) chuyển động liên tục theo hướng và tốc độ gió.

**Cách hoạt động:**
1. Mỗi particle có vị trí (x, y) ngẫu nhiên trên bản đồ
2. Tại mỗi frame, particle di chuyển theo vector gió (U, V) tại vị trí đó
3. Particle "chết" sau một thời gian rồi tái sinh ở vị trí ngẫu nhiên mới
4. Tốc độ di chuyển tỉ lệ thuận với vận tốc gió

**Tham số điều chỉnh trong Windy:**
```json
{
  "multiplier": 1,   // số lượng particles (x1 = mặc định)
  "velocity": 1,     // tốc độ di chuyển
  "width": 1,        // độ rộng của dải particle
  "blending": 1,     // alpha blending mode
  "opacity": 1       // độ trong suốt
}
```

**Ba chế độ particles:**
- `off`: tắt hoàn toàn
- `on`: chế độ mặc định
- `intensive`: nhiều particles hơn, rõ hơn

### 2.2 Color Gradient (Màu sắc theo tốc độ)

Windy mã hóa tốc độ gió thành màu sắc theo bảng gradient sau (đơn vị: knot):

| Tốc độ (kt) | Màu RGB                |
|------------|------------------------|
| 0          | rgb(98, 113, 183) – Xanh nhạt   |
| 1          | rgb(57, 97, 159)  – Xanh dương  |
| 3          | rgb(74, 148, 169) – Xanh lam    |
| 5          | rgb(77, 141, 123) – Xanh lá tối |
| 7          | rgb(83, 165, 83)  – Xanh lá     |
| 9          | rgb(53, 159, 53)  – Xanh lá đậm |
| 11         | rgb(167, 157, 81) – Vàng xanh   |
| 13         | rgb(159, 127, 58) – Vàng nâu    |
| 15         | rgb(161, 108, 92) – Cam nâu     |
| 17         | rgb(129, 58, 78)  – Đỏ tím      |
| 19         | rgb(175, 80, 136) – Tím hồng    |
| 21         | rgb(117, 74, 147) – Tím         |
| 24         | rgb(109, 97, 163) – Tím xanh    |
| 27         | rgb(68, 105, 141) – Xanh xám    |
| 36         | rgb(125, 68, 165) – Tím đậm     |
| 46         | rgb(231, 215, 215)– Hồng nhạt   |
| 77+        | rgb(205, 202, 112)– Vàng nhạt   |
| 104+       | rgb(128, 128, 128)– Xám         |

**Chuyển đổi đơn vị hỗ trợ:** kt (knots), m/s, km/h, mph, bft (Beaufort)

### 2.3 Tile-Based Vector Data

**Kiến trúc dữ liệu:**
- Dữ liệu gió được lưu dưới dạng PNG/JPG tiles (giống map tiles)
- Mỗi pixel của tile = một điểm dữ liệu gió
- Kênh màu R = thành phần U (gió Đông-Tây)
- Kênh màu G = thành phần V (gió Bắc-Nam)
- Shader GLSL giải mã: `VECTOR_SIZE`, `BICUBIC` interpolation

**URL format của tiles gió:**
```
https://tiles.windy.com/winds/{product}/{level}/{zoom}/{x}/{y}.jpg
```

**Cấp độ cao (pressure levels) được hỗ trợ:**
surface, 100m, 950h, 925h, 900h, 850h, 800h, 700h, 600h, 500h, 400h, 300h, 250h, 200h, 150h, 10h

### 2.4 Isolines (Đường đẳng áp)

Windy vẽ các đường đẳng trị (áp suất, nhiệt độ) trên bản đồ.
- **Loại:** pressure (mặc định), gh (geopotential height), temp, deg0
- **Toggle:** Có thể bật/tắt qua UI

---

## 3. Stack Công Nghệ

```
Frontend:
├── MapLibre GL JS  → Base map rendering (WebGL)
├── WebGL2          → GPU-accelerated wind rendering
├── Custom GLSL     → Wind tile decode & particle shaders
└── Svelte          → UI components (plugins/panels)

Data:
├── ECMWF (9km)     → Forecast model chính
├── GFS (22km)      → Forecast model phụ  
├── ICON (13km)     → Forecast model phụ
└── Tile CDN        → tiles.windy.com
```

**Shader defines cho wind layer:**
- `VECTOR_SIZE` – tile chứa vector 2D (U/V)
- `BICUBIC` – nội suy bicubic giữa các điểm dữ liệu

---

## 4. Implement Particle Wind trên Web App của Bạn

### 4.1 Thư Viện Khuyến Nghị

| Thư viện | Mô tả | Link |
|----------|-------|------|
| **Leaflet-Velocity** | Plugin Leaflet, particle wind, dễ dùng | [github.com/onaci/leaflet-velocity](https://github.com/onaci/leaflet-velocity) |
| **WindGL** | WebGL particle wind standalone | [github.com/mapbox/webgl-wind](https://github.com/mapbox/webgl-wind) |
| **deck.gl** | High-perf WebGL layer cho React/Vue | [deck.gl](https://deck.gl) |
| **Three.js** | 3D particle system cho wind globe | [threejs.org](https://threejs.org) |
| **d3-wind** | D3-based streamline/barb rendering | [d3js.org](https://d3js.org) |

### 4.2 Ví Dụ: Leaflet + Leaflet-Velocity

```html
<!DOCTYPE html>
<html>
<head>
  <link rel="stylesheet" href="https://unpkg.com/leaflet/dist/leaflet.css"/>
  <script src="https://unpkg.com/leaflet/dist/leaflet.js"></script>
  <script src="https://unpkg.com/leaflet-velocity/dist/leaflet-velocity.js"></script>
</head>
<body>
  <div id="map" style="height:600px"></div>
  <script>
    const map = L.map('map').setView([13.677, 110.250], 7);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);

    // Fetch wind data (GFS JSON format từ data.windy.com hoặc open-meteo)
    fetch('wind-data.json').then(r => r.json()).then(data => {
      L.velocityLayer({
        displayValues: true,
        displayOptions: {
          velocityType: 'Wind',
          displayPosition: 'bottomleft',
          displayEmptyString: 'No wind data'
        },
        data: data,              // GFS JSON format {header, data[]}
        maxVelocity: 15,         // m/s
        velocityScale: 0.005,    // tốc độ particle
        colorScale: [            // gradient màu theo tốc độ
          'rgb(98,113,183)',   // 0 kt
          'rgb(57,97,159)',    // 1 kt
          'rgb(74,148,169)',   // 3 kt
          'rgb(77,141,123)',   // 5 kt
          'rgb(83,165,83)',    // 7 kt
          'rgb(53,159,53)',    // 9 kt
          'rgb(167,157,81)',   // 11 kt
          'rgb(159,127,58)',   // 13 kt
          'rgb(161,108,92)',   // 15 kt
          'rgb(129,58,78)',    // 17 kt
          'rgb(175,80,136)',   // 19 kt
          'rgb(117,74,147)',   // 21+ kt
        ],
      }).addTo(map);
    });
  </script>
</body>
</html>
```

### 4.3 Format Dữ Liệu Gió (GFS JSON)

Leaflet-Velocity dùng chuẩn GFS JSON (tương tự Windy):

```json
[
  {
    "header": {
      "parameterCategory": 2,
      "parameterNumber": 2,
      "la1": 90.0,  "la2": -90.0,
      "lo1": 0.0,   "lo2": 359.0,
      "dx": 1.0,    "dy": 1.0,
      "nx": 360,    "ny": 181,
      "refTime": "2026-05-21T00:00:00.000Z"
    },
    "data": [/* U component (East-West), length = nx * ny */]
  },
  {
    "header": {
      "parameterCategory": 2,
      "parameterNumber": 3
    },
    "data": [/* V component (North-South), length = nx * ny */]
  }
]
```

**Nguồn dữ liệu gió miễn phí:**
- [Open-Meteo API](https://open-meteo.com) – Cung cấp JSON forecast, FREE
- [NOAA GFS](https://nomads.ncep.noaa.gov) – Public domain
- [OpenWeatherMap](https://openweathermap.org/api) – Free tier 1000 calls/day

### 4.4 Ví Dụ: WebGL Particle Wind (hiệu năng cao)

Dựa trên kỹ thuật của Windy (GPU particle simulation):

```javascript
// Cấu trúc cơ bản của GPU particle wind system

class WindParticleSystem {
  constructor(gl, numParticles = 65536) {
    this.gl = gl;
    this.numParticles = numParticles;
    this.particleStateResolution = Math.ceil(Math.sqrt(numParticles));
    
    // Texture lưu trạng thái particles (RGBA = x, y, age, speed)
    this.particleStateTexture0 = this.createParticleState();
    this.particleStateTexture1 = this.createParticleState();
    
    // Texture lưu dữ liệu gió (U/V encoded)
    this.windTexture = null;
    
    // Shader programs
    this.updateProgram = this.createUpdateShader();
    this.drawProgram = this.createDrawShader();
  }

  // Vertex shader: tính vị trí particle từ texture state
  updateVertexShader() {
    return `
      attribute vec2 a_pos;
      uniform sampler2D u_wind;       // wind data texture
      uniform sampler2D u_particles;  // particle state
      uniform float u_rand_seed;
      uniform vec2 u_wind_min;
      uniform vec2 u_wind_max;
      uniform float u_speed_factor;
      
      varying vec2 v_particle_pos;
      
      const vec2 bitEnc = vec2(1., 255.);
      const vec2 bitDec = 1./bitEnc;
      
      vec2 fromClipSpace(vec2 pos) {
        return pos * 0.5 + 0.5;
      }
      
      void main() {
        vec4 color = texture2D(u_particles, a_pos);
        
        // Giải mã vị trí từ màu RGBA
        vec2 pos = vec2(
          color.r / 255.0 + color.b,
          color.g / 255.0 + color.a
        );
        
        // Lấy vector gió tại vị trí này
        vec2 velocity = mix(u_wind_min, u_wind_max, 
          texture2D(u_wind, pos).rg);
        
        // Cập nhật vị trí
        vec2 newPos = pos + velocity * u_speed_factor;
        
        // Wrap around edges
        v_particle_pos = fract(1.0 + newPos);
        gl_Position = vec4(0.0);
      }
    `;
  }
  
  // Fragment shader: vẽ particle như điểm sáng
  drawFragmentShader() {
    return `
      precision mediump float;
      uniform sampler2D u_wind;
      uniform vec2 u_wind_min;
      uniform vec2 u_wind_max;
      uniform sampler2D u_color_ramp;  // bảng màu gradient
      varying vec2 v_particle_pos;
      
      void main() {
        vec2 velocity = mix(u_wind_min, u_wind_max,
          texture2D(u_wind, v_particle_pos).rg);
        
        float speed = length(velocity) / length(u_wind_max);
        
        // Lookup màu từ color ramp texture
        vec2 ramp_pos = vec2(fract(16.0 * speed), floor(16.0 * speed) / 16.0);
        gl_FragColor = texture2D(u_color_ramp, ramp_pos);
      }
    `;
  }
}
```

### 4.5 Mã Hóa Gió vào Texture (như Windy làm)

```javascript
// Encode U/V wind components vào RGBA texture
function encodeWindToTexture(uData, vData, width, height) {
  const pixels = new Uint8Array(width * height * 4);
  
  for (let i = 0; i < width * height; i++) {
    // Normalize U từ [-max, +max] về [0, 255]
    const uNorm = Math.floor((uData[i] + 128) / 256 * 255);
    const vNorm = Math.floor((vData[i] + 128) / 256 * 255);
    
    pixels[i * 4 + 0] = uNorm;          // R = U
    pixels[i * 4 + 1] = vNorm;          // G = V
    pixels[i * 4 + 2] = 0;             // B = unused
    pixels[i * 4 + 3] = 255;           // A = full opacity
  }
  
  return pixels;
}

// Decode lại từ texture
function decodeWindFromPixel(r, g, uMin, uMax, vMin, vMax) {
  const u = (r / 255.0) * (uMax - uMin) + uMin;
  const v = (g / 255.0) * (vMax - vMin) + vMin;
  return { u, v, speed: Math.sqrt(u*u + v*v), 
           direction: Math.atan2(u, v) * 180 / Math.PI };
}
```

---

## 5. Windy Color Scale cho Wind Speed

Sao chép chính xác bảng màu của Windy:

```javascript
const WINDY_COLOR_SCALE = {
  // [speed_kt, [R, G, B, A]]
  stops: [
    [0,   [98, 113, 183, 255]],
    [1,   [57,  97, 159, 255]],
    [3,   [74, 148, 169, 255]],
    [5,   [77, 141, 123, 255]],
    [7,   [83, 165,  83, 255]],
    [9,   [53, 159,  53, 255]],
    [11,  [167,157,  81, 255]],
    [13,  [159,127,  58, 255]],
    [15,  [161,108,  92, 255]],
    [17,  [129, 58,  78, 255]],
    [19,  [175, 80, 136, 255]],
    [21,  [117, 74, 147, 255]],
    [24,  [109, 97, 163, 255]],
    [27,  [68, 105, 141, 255]],
    [29,  [92, 144, 152, 255]],
    [36,  [125, 68, 165, 255]],
    [46,  [231,215, 215, 255]],
    [51,  [219,212, 135, 255]],
    [77,  [205,202, 112, 255]],
    [104, [128,128, 128, 255]],
  ],
  
  // Lấy màu cho tốc độ bất kỳ (nội suy tuyến tính)
  getColor(speedKt) {
    const stops = this.stops;
    for (let i = 1; i < stops.length; i++) {
      if (speedKt <= stops[i][0]) {
        const t = (speedKt - stops[i-1][0]) / (stops[i][0] - stops[i-1][0]);
        const c0 = stops[i-1][1], c1 = stops[i][1];
        return [
          Math.round(c0[0] + t * (c1[0] - c0[0])),
          Math.round(c0[1] + t * (c1[1] - c0[1])),
          Math.round(c0[2] + t * (c1[2] - c0[2])),
        ];
      }
    }
    return stops[stops.length-1][1];
  }
};

// Chuyển đổi đơn vị
const WIND_UNIT = {
  mps_to_kt:  (v) => v * 1.94384,
  kt_to_mps:  (v) => v * 0.514444,
  kmh_to_kt:  (v) => v * 0.539957,
  mph_to_kt:  (v) => v * 0.868976,
  bft_to_kt:  (bft) => [0,1,4,7,11,17,22,28,34,41,48,56,64][bft] || 64,
};
```

---

## 6. Wind Barbs (Ký Hiệu Khí Tượng)

Wind barbs là ký hiệu chuẩn khí tượng để biểu diễn hướng và tốc độ gió.

```javascript
// Vẽ wind barb bằng Canvas 2D
function drawWindBarb(ctx, x, y, speedKt, directionDeg) {
  ctx.save();
  ctx.translate(x, y);
  // Xoay theo hướng gió (từ đâu thổi đến)
  ctx.rotate((directionDeg + 180) * Math.PI / 180);
  
  const len = 30; // độ dài cán
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, -len);  // vẽ cán
  ctx.stroke();
  
  // Vẽ lá (barbs)
  let remaining = speedKt;
  let yPos = -len;
  
  // 50kt = tam giác đen (pennant)
  while (remaining >= 50) {
    ctx.beginPath();
    ctx.moveTo(0, yPos);
    ctx.lineTo(10, yPos + 5);
    ctx.lineTo(0, yPos + 10);
    ctx.fill();
    yPos += 12; remaining -= 50;
  }
  // 10kt = nét dài
  while (remaining >= 10) {
    ctx.beginPath();
    ctx.moveTo(0, yPos);
    ctx.lineTo(10, yPos - 4);
    ctx.stroke();
    yPos += 5; remaining -= 10;
  }
  // 5kt = nét ngắn (nửa)
  if (remaining >= 5) {
    ctx.beginPath();
    ctx.moveTo(0, yPos);
    ctx.lineTo(5, yPos - 2);
    ctx.stroke();
  }
  
  ctx.restore();
}
```

---

## 7. Lấy Dữ Liệu Gió Miễn Phí

### Open-Meteo API (khuyến nghị)

```javascript
async function fetchWindData(lat, lon) {
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.searchParams.set('latitude', lat);
  url.searchParams.set('longitude', lon);
  url.searchParams.set('hourly', 'windspeed_10m,winddirection_10m,u_component_of_wind_10m,v_component_of_wind_10m');
  url.searchParams.set('wind_speed_unit', 'ms');
  url.searchParams.set('forecast_days', 3);
  
  const response = await fetch(url);
  const data = await response.json();
  return data.hourly;
}

// Sử dụng
fetchWindData(13.677, 110.25).then(hourly => {
  hourly.time.forEach((t, i) => {
    console.log({
      time: t,
      speed: hourly.windspeed_10m[i],        // m/s
      direction: hourly.winddirection_10m[i], // degrees
      u: hourly.u_component_of_wind_10m[i],  // m/s east
      v: hourly.v_component_of_wind_10m[i],  // m/s north
    });
  });
});
```

### Windy API (nếu cần dữ liệu grid)

```javascript
// Windy.com có API công khai (cần đăng ký key miễn phí)
async function fetchWindyData(lat, lon, model = 'ecmwf') {
  const response = await fetch('https://api.windy.com/api/point-forecast/v2', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      lat, lon,
      model: model,
      parameters: ['wind', 'windGust'],
      levels: ['surface'],
      key: 'YOUR_API_KEY'  // đăng ký tại windy.com/en/-API
    })
  });
  return response.json();
}
```

---

## 8. Tích Hợp với Windy.com Embed

Windy cung cấp embed iframe và JavaScript API:

```html
<!-- Nhúng Windy map vào trang web -->
<iframe
  id="windy-embed"
  src="https://embed.windy.com/embed2.html?lat=13.677&lon=110.250&zoom=7&level=surface&overlay=wind&product=ecmwf&menu=&message=true&marker=&calendar=now&pressure=&type=map&location=coordinates&detail=&detailLat=13.677&detailLon=110.250&metricWind=kt&metricTemp=%C2%B0C"
  width="100%" height="600"
  style="border:0" 
  allowfullscreen>
</iframe>
```

```javascript
// Hoặc dùng Windy JS API
const options = {
  key: 'YOUR_KEY',   // từ windy.com/en/-API
  lat: 13.677,
  lon: 110.250,
  zoom: 7,
};

windyInit(options, windyAPI => {
  const { store, map, picker } = windyAPI;
  
  // Set overlay wind
  store.set('overlay', 'wind');
  store.set('level', 'surface');
  store.set('particlesAnim', 'on');
  
  // Lấy dữ liệu gió tại điểm bất kỳ
  picker.on('pickerOpened', latLon => {
    picker.on('pickerDataUpdate', data => {
      console.log('Gió:', data.wind, 'kt');
      console.log('Hướng:', data.windDir, '°');
    });
  });
});
```

---

## 9. Best Practices từ Windy

1. **Dùng WebGL2 cho hiệu năng cao**: render hàng ngàn particles không lag
2. **Bicubic interpolation**: cho dữ liệu gió mượt mà hơn bilinear
3. **Tile-based data**: tái sử dụng infrastructure map tile CDN
4. **Color ramp texture**: lưu bảng màu gradient vào texture 256x1, sample bằng shader thay vì tính CPU
5. **Fade trail effect**: particles để lại vệt mờ (alpha blending) tạo cảm giác chuyển động
6. **Particle respawn**: particles "chết" ngẫu nhiên và tái sinh để tránh tụ ở vùng hội tụ
7. **Level of detail**: ít particles hơn ở zoom thấp, nhiều hơn ở zoom cao

---

## 10. Tóm Tắt Kiến Trúc Đề Xuất

```
Web App Wind Visualization
├── Data Layer
│   ├── Nguồn: Open-Meteo / NOAA GFS / Windy API
│   ├── Format: JSON (U/V components) hoặc GeoTIFF
│   └── Cache: 1 giờ / tile
│
├── Processing Layer  
│   ├── Encode U/V → RGBA texture (GPU upload)
│   ├── Bicubic interpolation shader (GLSL)
│   └── Chuyển đổi đơn vị (kt / m/s / km/h)
│
├── Rendering Layer
│   ├── Base map: MapLibre GL / Leaflet
│   ├── Wind color: Tile layer + GLSL color ramp
│   └── Particles: WebGL2 ping-pong texture system
│
└── UI Layer
    ├── Layer selector (Wind / Pressure / Temp)
    ├── Level selector (Surface / 850h / 500h...)
    ├── Speed legend (color gradient bar)
    └── Time animation slider
```
