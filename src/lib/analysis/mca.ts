/**
 * mca.ts — Multi-Criteria Analysis cho quỹ đất xây dựng.
 *
 * Phương pháp: 9 tiêu chí GIS-MCA theo NCKH "Ứng dụng GIS và Trí tuệ Nhân tạo
 * trong đánh giá quỹ đất xây dựng đối với đồ án quy hoạch chi tiết" — ĐH Kiến
 * trúc HN, 01/2026.
 *
 * X1 Cao độ nền (DEM)               Bảng 5
 * X2 Nguy cơ ngập lụt (%)           Bảng 6
 * X3 Khoảng cách tới mặt nước (m)   Bảng 7
 * X4 Hiện trạng sử dụng đất         Bảng 8 (suy từ LanduseType)
 * X5 Mật độ XD hiện trạng (%)       Bảng 9
 * X6 Phù hợp QH cấp trên            Bảng 10 (default user input)
 * X7 Chi phí GPMB (suy X4)          Bảng 11
 * X8 Khả năng tiếp cận giao thông   Bảng 12 (m tới đường)
 * X9 Mật độ mạng lưới đường         Bảng 13 (km/km²)
 *
 * Trọng số mặc định (Bảng 15 sau Data-centric AI):
 *   X1=20%, X2=17%, X3=12%, X4=13%, X5=7%, X6=8%, X7=13%, X8=5%, X9=5%
 *
 * Hard constraint (Bảng 18):
 *   X3 < 4 → cap score ≤ 30 (Y=0): cách mặt nước < ngưỡng an toàn
 *   X2 < 5 → cap score ≤ 30 (Y=0): nguy cơ ngập > 5%
 *
 * Phân lớp output:
 *   Y=2 Thuận lợi      : score ≥ 70
 *   Y=1 Ít thuận lợi   : 40 ≤ score < 70
 *   Y=0 Không thuận lợi: score < 40
 */
import type {
  Heightmap, TerrainData, LanduseData, LanduseType, OverlayLayer,
  MCACell, MCAData,
} from '../types';
import { pointInPolygon } from '../util/pointInPolygon';

// ── Trọng số mặc định ────────────────────────────────────────────────────────
export const DEFAULT_MCA_WEIGHTS = {
  x1: 0.20, x2: 0.17, x3: 0.12, x4: 0.13, x5: 0.07,
  x6: 0.08, x7: 0.13, x8: 0.05, x9: 0.05,
};

// ── Palette 3 lớp Y ──────────────────────────────────────────────────────────
export const MCA_CLASSES = [
  { label: 'Không thuận lợi', color: '#7f1d1d', short: 'KTL' }, // Y=0 đỏ
  { label: 'Ít thuận lợi',    color: '#fb923c', short: 'ITL' }, // Y=1 cam
  { label: 'Thuận lợi',       color: '#15803d', short: 'TL'  }, // Y=2 xanh
];

export const MCA_GRID_SIZE = 20; // 20×20m

// ── Scoring functions per Bảng 5-13 ──────────────────────────────────────────

type TerrainType = 'plain' | 'midland' | 'mountain';

/** Bảng 5 — Cao độ nền (DEM), 3 cột địa hình */
function scoreX1(z: number, type: TerrainType): number {
  if (type === 'plain') {
    if (z < 1)   return 1;
    if (z < 2)   return 2;
    if (z < 3)   return 3;
    if (z < 5)   return 4;
    if (z < 7)   return 5;
    if (z < 10)  return 6;
    if (z < 12)  return 7;
    if (z < 15)  return 8;
    if (z < 18)  return 9;
    return 10;
  }
  if (type === 'midland') {
    if (z > 1600 || z < 30)  return 1;
    if (z > 1400) return 2;
    if (z > 1200) return 3;
    if (z > 1000) return 4;
    if (z > 800)  return 5;
    if (z > 600)  return 6;
    if (z > 500)  return 7;
    if (z > 400)  return 8;
    if (z > 300)  return 9;
    return 10; // 200-300m: tối ưu
  }
  // mountain: tốt ở thung lũng (Z thấp trong vùng núi)
  if (z > 2500) return 1;
  if (z > 2200) return 2;
  if (z > 1900) return 3;
  if (z > 1700) return 4;
  if (z > 1500) return 5;
  if (z > 1300) return 6;
  if (z > 1200) return 7;
  if (z > 1100) return 8;
  if (z > 1050) return 9;
  return 10; // 1000-1050m: thung lũng tương đối thấp
}

/** Bảng 6 — % diện tích ô có nguy cơ ngập */
function scoreX2(floodPct: number): number {
  if (floodPct > 10)  return 1;
  if (floodPct > 7)   return 2;
  if (floodPct > 5)   return 3;
  if (floodPct > 3)   return 4;
  if (floodPct > 2)   return 5;
  if (floodPct > 1.5) return 6;
  if (floodPct > 1)   return 7;
  if (floodPct > 0.5) return 8;
  return 9;
}

/** Bảng 7 — distance to water (m) */
function scoreX3(dWater: number): number {
  if (dWater < 50)   return 1;
  if (dWater < 100)  return 2;
  if (dWater < 200)  return 3;
  if (dWater < 300)  return 4; // ngưỡng veto
  if (dWater < 500)  return 5;
  if (dWater < 1000) return 6;
  if (dWater < 2000) return 7;
  if (dWater < 3000) return 8;
  if (dWater < 5000) return 9;
  return 10;
}

/** Bảng 8 — hiện trạng SDD theo LanduseType */
function scoreX4(type: LanduseType | null): number {
  if (!type) return 7;
  switch (type) {
    case 'DUONG_GIAO_THONG':
    case 'HO_AO_DAM':
    case 'CAU_BE_TONG':
      return 1; // không thể XD
    case 'CAY_XANH_CONG_CONG':
    case 'CAY_XANH_THE_DUC':
      return 3; // cần giữ
    case 'TRUONG_MAM_NON':
    case 'TRUONG_TIEU_HOC':
    case 'NHA_VAN_HOA':
    case 'TRUNG_TAM_VHTT':
    case 'HA_TANG_KY_THUAT':
      return 5;
    case 'TMDV':
    case 'CHUNG_CU_HON_HOP':
      return 6;
    case 'NHA_O_LIEN_KE':
    case 'NHA_O_XA_HOI':
    case 'BIET_THU_DON_LAP':
    case 'BIET_THU_SONG_LAP':
      return 6;
    case 'KHOANG_LUI':
      return 7;
    case 'BAI_DO_XE':
      return 8;
    case 'KHAC':
    default:
      return 9; // đất trống / chưa phân loại → dễ chuyển đổi
  }
}

/** Bảng 9 — mật độ XD hiện trạng (%) */
function scoreX5(density: number | null): number {
  if (density === null || density === undefined) return 10; // đất trống
  if (density > 80) return 1;
  if (density > 70) return 2;
  if (density > 60) return 3;
  if (density > 50) return 4;
  if (density > 40) return 5;
  if (density > 30) return 6;
  if (density > 20) return 7;
  if (density > 10) return 8;
  return 9;
}

/** Bảng 11 — chi phí GPMB suy từ LanduseType (đất công thấp, đất ở cao) */
function scoreX7(type: LanduseType | null): number {
  if (!type) return 7;
  switch (type) {
    case 'DUONG_GIAO_THONG':
    case 'KHOANG_LUI':
      return 10; // không phải GPMB
    case 'BAI_DO_XE':
    case 'KHAC':
      return 8;
    case 'CAY_XANH_CONG_CONG':
    case 'CAY_XANH_THE_DUC':
      return 7;
    case 'TRUONG_MAM_NON':
    case 'TRUONG_TIEU_HOC':
    case 'NHA_VAN_HOA':
    case 'TRUNG_TAM_VHTT':
    case 'HA_TANG_KY_THUAT':
      return 5; // đất công, đền bù vừa
    case 'TMDV':
      return 3;
    case 'CHUNG_CU_HON_HOP':
    case 'NHA_O_LIEN_KE':
    case 'NHA_O_XA_HOI':
    case 'BIET_THU_DON_LAP':
    case 'BIET_THU_SONG_LAP':
      return 2; // đền bù cao
    case 'HO_AO_DAM':
    case 'CAU_BE_TONG':
      return 1;
    default:
      return 7;
  }
}

/** Bảng 12 — distance to nearest road (m) */
function scoreX8(dRoad: number): number {
  if (dRoad < 50)   return 10;
  if (dRoad < 100)  return 9;
  if (dRoad < 200)  return 8;
  if (dRoad < 300)  return 7;
  if (dRoad < 500)  return 6;
  if (dRoad < 700)  return 5;
  if (dRoad < 1000) return 4;
  if (dRoad < 1500) return 3;
  if (dRoad < 2000) return 2;
  return 1;
}

/** Bảng 13 — road density (km/km²) */
function scoreX9(density: number): number {
  if (density > 10) return 10;
  if (density > 8)  return 9;
  if (density > 6)  return 8;
  if (density > 5)  return 7;
  if (density > 4)  return 6;
  if (density > 3)  return 5;
  if (density > 2)  return 4;
  if (density > 1)  return 3;
  if (density > 0.5) return 2;
  return 1;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Lấy percentile của các Z thực (loại NaN) trong heightmap */
function quantile(hm: Heightmap, q: number): number {
  const arr: number[] = [];
  const n = hm.data.length;
  for (let i = 0; i < n; i++) {
    const z = hm.data[i];
    if (Number.isFinite(z)) arr.push(z);
  }
  if (arr.length === 0) return hm.minZ;
  arr.sort((a, b) => a - b);
  const idx = Math.min(arr.length - 1, Math.max(0, Math.floor(arr.length * q)));
  return arr[idx];
}

/** BFS distance transform (m) — từ tất cả cell có mask=1 */
function bfsDistanceFromMask(
  mask: Uint8Array, w: number, h: number, cellSize: number,
): Float32Array {
  const n = w * h;
  const dist = new Float32Array(n);
  const INF = Infinity;
  for (let i = 0; i < n; i++) dist[i] = mask[i] ? 0 : INF;

  // 2-pass distance transform (Chamfer 3-4 approximation)
  // Forward pass: top-left → bottom-right
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (dist[i] === 0) continue;
      let d = dist[i];
      if (y > 0)             d = Math.min(d, dist[(y-1)*w + x] + 1);
      if (x > 0)             d = Math.min(d, dist[ y   *w + x-1] + 1);
      if (x > 0 && y > 0)    d = Math.min(d, dist[(y-1)*w + x-1] + 1.4142);
      if (x < w-1 && y > 0)  d = Math.min(d, dist[(y-1)*w + x+1] + 1.4142);
      dist[i] = d;
    }
  }
  // Backward pass: bottom-right → top-left
  for (let y = h - 1; y >= 0; y--) {
    for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x;
      if (dist[i] === 0) continue;
      let d = dist[i];
      if (y < h-1)              d = Math.min(d, dist[(y+1)*w + x] + 1);
      if (x < w-1)              d = Math.min(d, dist[ y   *w + x+1] + 1);
      if (x < w-1 && y < h-1)   d = Math.min(d, dist[(y+1)*w + x+1] + 1.4142);
      if (x > 0 && y < h-1)     d = Math.min(d, dist[(y+1)*w + x-1] + 1.4142);
      dist[i] = d;
    }
  }
  // Convert grid units → meters
  for (let i = 0; i < n; i++) {
    if (dist[i] === INF) dist[i] = 1e6;
    else dist[i] *= cellSize;
  }
  return dist;
}

/**
 * Build water mask: CHỈ cells có Z thực (rasterized) và ≤ waterZ.
 *
 * BUG cũ: code coi cell có Z = NaN (vùng ngoài TIN coverage) là mặt nước.
 * Với file CAD chỉ phủ ~30% bbox bằng contour (vd `QHC 11ha Minh Tân.dxf`),
 * ~70% diện tích còn lại NaN → bị tính là "nước giả" → BFS distance transform
 * cho ra mọi cell terrain đều rất gần "nước" (<200m) → X3 score chỉ 1-2 →
 * hard constraint X3<4 trigger → veto Y=0 cho hầu hết cells → Y0 = 74.9%.
 *
 * Fix: chỉ Z thực mới được tính là nước. Cell NaN bị bỏ qua hoàn toàn.
 */
function buildWaterMask(hm: Heightmap, waterZ: number): Uint8Array {
  const n = hm.data.length;
  const mask = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const z = hm.data[i];
    if (Number.isFinite(z) && z <= waterZ) mask[i] = 1;
  }
  return mask;
}

/** Rasterize all road polylines (world coords centered) → DXF coord mask trên heightmap */
function rasterizeRoadsToMask(
  overlays: OverlayLayer[],
  bounds: { minX: number; minY: number; maxX: number; maxY: number },
  hm: Heightmap,
): Uint8Array {
  const mask = new Uint8Array(hm.width * hm.height);
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cy = (bounds.minY + bounds.maxY) / 2;

  for (const layer of overlays) {
    if (!layer.isRoad || !layer.visible) continue;
    for (const poly of layer.polylines) {
      if (poly.length < 2) continue;
      for (let i = 1; i < poly.length; i++) {
        // World (Three.js) → DXF: dxfX = wx + cx, dxfY = cy - wz
        const ax = poly[i-1].x + cx;
        const ay = cy - poly[i-1].z;
        const bx = poly[i].x   + cx;
        const by = cy - poly[i].z;
        // Bresenham-like rasterize segment
        const stepLen = Math.max(1, Math.hypot(bx - ax, by - ay) / hm.cellSize);
        const nStep = Math.ceil(stepLen);
        for (let s = 0; s <= nStep; s++) {
          const t = s / nStep;
          const px = ax + (bx - ax) * t;
          const py = ay + (by - ay) * t;
          const col = Math.floor((px - hm.origin.x) / hm.cellSize);
          const row = Math.floor((py - hm.origin.y) / hm.cellSize);
          if (col >= 0 && col < hm.width && row >= 0 && row < hm.height) {
            mask[row * hm.width + col] = 1;
          }
        }
      }
    }
  }
  return mask;
}

/** Tính road density (m road / 10000 m²) trong window 100m radius cho mỗi cell heightmap */
function computeRoadDensity(
  roadMask: Uint8Array, hm: Heightmap,
): Float32Array {
  const w = hm.width, h = hm.height, c = hm.cellSize;
  const n = w * h;
  const density = new Float32Array(n);
  // Window 100m radius → cell radius = 100 / cellSize
  const R = Math.max(2, Math.round(100 / c));
  // Box sum approximation (cheap): cell count road trong (2R+1)² window × cellSize / area
  // Integral image
  const integ = new Float32Array(n);
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) {
      row += roadMask[y * w + x];
      integ[y * w + x] = (y > 0 ? integ[(y-1)*w + x] : 0) + row;
    }
  }
  const get = (x: number, y: number) => {
    if (x < 0 || y < 0) return 0;
    if (x >= w) x = w - 1;
    if (y >= h) y = h - 1;
    return integ[y * w + x];
  };

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const x0 = x - R - 1, y0 = y - R - 1;
      const x1 = Math.min(w - 1, x + R);
      const y1 = Math.min(h - 1, y + R);
      const sum = get(x1, y1) - get(x0, y1) - get(x1, y0) + get(x0, y0);
      // Mỗi road cell ≈ cellSize m chiều dài → tổng m = sum × cellSize
      const lenM = sum * c;
      // Diện tích window m²
      const ww = Math.min(x + R, w - 1) - Math.max(x - R, 0) + 1;
      const hh = Math.min(y + R, h - 1) - Math.max(y - R, 0) + 1;
      const areaM2 = ww * hh * c * c;
      // km/km² = (lenM/1000) / (areaM2/1e6) = lenM × 1000 / areaM2
      density[y * w + x] = areaM2 > 0 ? (lenM * 1000) / areaM2 : 0;
    }
  }
  return density;
}

/** Sample 1 cell heightmap tại DXF coord (dx, dy) */
function sampleField(field: Float32Array, hm: Heightmap, dx: number, dy: number): number {
  const col = Math.floor((dx - hm.origin.x) / hm.cellSize);
  const row = Math.floor((dy - hm.origin.y) / hm.cellSize);
  if (col < 0 || col >= hm.width || row < 0 || row >= hm.height) return 0;
  return field[row * hm.width + col];
}

/** Lookup landuse parcel chứa điểm (DXF coords) */
function lookupLanduseAt(
  landuse: LanduseData | null | undefined,
  dx: number, dy: number,
): { type: LanduseType; density: number | null } | null {
  if (!landuse) return null;
  for (const p of landuse.parcels) {
    if (pointInPolygon({ x: dx, y: dy }, p.polygon)) {
      return {
        type: p.inferredType,
        density: p.indicator?.maxDensity ?? null,
      };
    }
  }
  return null;
}

// ── Main compute ─────────────────────────────────────────────────────────────

export interface MCAInput {
  landuse?: LanduseData | null;
  overlays?: OverlayLayer[];
  weights?: Partial<typeof DEFAULT_MCA_WEIGHTS>;
  x6Default?: number;
  applyHardConstraints?: boolean;
  /** Mực nước mô phỏng từ flood mode (m). Nếu chưa bật flood, fallback percentile 5% */
  waterLevel?: number;
}

export function computeMCA(terrain: TerrainData, opt: MCAInput = {}): MCAData {
  const { bounds, heightmap: hm } = terrain;
  const GRID = MCA_GRID_SIZE;
  const widthM  = bounds.maxX - bounds.minX;
  const heightM = bounds.maxY - bounds.minY;
  const cols = Math.max(1, Math.ceil(widthM / GRID));
  const rows = Math.max(1, Math.ceil(heightM / GRID));

  // Terrain type — dùng maxZ
  const maxZ = hm.originalMaxZ ?? hm.maxZ;
  let terrainType: TerrainType;
  if (maxZ < 200)       terrainType = 'plain';
  else if (maxZ < 1000) terrainType = 'midland';
  else                  terrainType = 'mountain';

  // Water mask + distance transform
  const lowQ = quantile(hm, 0.05);
  const waterZ = (typeof opt.waterLevel === 'number' && opt.waterLevel > hm.minZ)
    ? opt.waterLevel : lowQ;
  const waterMask = buildWaterMask(hm, waterZ);
  const distWater = bfsDistanceFromMask(waterMask, hm.width, hm.height, hm.cellSize);

  // Road mask + distance + density
  const overlays = opt.overlays ?? [];
  const roadMask = rasterizeRoadsToMask(overlays, bounds, hm);
  const distRoad = bfsDistanceFromMask(roadMask, hm.width, hm.height, hm.cellSize);
  const roadDensity = computeRoadDensity(roadMask, hm);

  // Trọng số + X6 default
  const W = { ...DEFAULT_MCA_WEIGHTS, ...(opt.weights ?? {}) };
  const x6Def = Math.max(1, Math.min(10, opt.x6Default ?? 8));
  const apply = opt.applyHardConstraints !== false;

  const cells: MCACell[] = [];
  const counts = { y0: 0, y1: 0, y2: 0 };
  const meanSums = { x1:0, x2:0, x3:0, x4:0, x5:0, x6:0, x7:0, x8:0, x9:0 };

  for (let gy = 0; gy < rows; gy++) {
    for (let gx = 0; gx < cols; gx++) {
      // Center cell (DXF coords)
      const cxDxf = bounds.minX + (gx + 0.5) * GRID;
      const cyDxf = bounds.minY + (gy + 0.5) * GRID;

      // Sample heightmap cells trong vùng GRID×GRID
      const col0 = Math.floor((bounds.minX + gx * GRID - hm.origin.x) / hm.cellSize);
      const row0 = Math.floor((bounds.minY + gy * GRID - hm.origin.y) / hm.cellSize);
      const col1 = Math.ceil((bounds.minX + (gx + 1) * GRID - hm.origin.x) / hm.cellSize);
      const row1 = Math.ceil((bounds.minY + (gy + 1) * GRID - hm.origin.y) / hm.cellSize);
      let sumZ = 0, cntZ = 0, floodCnt = 0, tot = 0;
      for (let r = Math.max(0, row0); r < Math.min(hm.height, row1); r++) {
        for (let c = Math.max(0, col0); c < Math.min(hm.width, col1); c++) {
          tot++;
          const z = hm.data[r * hm.width + c];
          if (!Number.isFinite(z)) continue;
          sumZ += z; cntZ++;
          if (z < waterZ) floodCnt++;
        }
      }
      if (cntZ === 0) continue; // ô ngoài terrain — bỏ qua
      const meanZ = sumZ / cntZ;
      const floodPct = (floodCnt / Math.max(1, tot)) * 100;

      // X1: cao độ
      const x1 = scoreX1(meanZ, terrainType);
      // X2: ngập
      const x2 = scoreX2(floodPct);
      // X3: distance to water (m)
      const dW = sampleField(distWater, hm, cxDxf, cyDxf);
      const x3 = scoreX3(dW);
      // X4 + density tra landuse
      const lu = lookupLanduseAt(opt.landuse, cxDxf, cyDxf);
      const x4 = scoreX4(lu?.type ?? null);
      // X5: mật độ XD
      const x5 = scoreX5(lu?.density ?? null);
      // X6: phù hợp QH — user input
      const x6 = x6Def;
      // X7: GPMB
      const x7 = scoreX7(lu?.type ?? null);
      // X8: distance to road
      const dR = sampleField(distRoad, hm, cxDxf, cyDxf);
      const x8 = scoreX8(dR);
      // X9: road density
      const rDens = sampleField(roadDensity, hm, cxDxf, cyDxf);
      const x9 = scoreX9(rDens);

      // Weighted sum × 10 → 0-100
      let score =
        (W.x1*x1 + W.x2*x2 + W.x3*x3 + W.x4*x4 + W.x5*x5
       + W.x6*x6 + W.x7*x7 + W.x8*x8 + W.x9*x9) * 10;

      let vetoReason: string | undefined;
      if (apply) {
        if (x3 < 4) {
          score = Math.min(score, 30);
          vetoReason = `X3=${x3} — quá sát mặt nước (<300m)`;
        }
        if (x2 < 5) {
          score = Math.min(score, 30);
          vetoReason = `X2=${x2} — nguy cơ ngập >5%`;
        }
      }

      // Phân lớp
      let classY: 0 | 1 | 2;
      if (score < 40)      classY = 0;
      else if (score < 70) classY = 1;
      else                 classY = 2;

      cells.push({
        i: gy * cols + gx,
        centerX: cxDxf, centerY: cyDxf,
        x1, x2, x3, x4, x5, x6, x7, x8, x9,
        score, classY, meanZ, vetoReason,
      });
      counts[`y${classY}` as 'y0'|'y1'|'y2']++;
      meanSums.x1 += x1; meanSums.x2 += x2; meanSums.x3 += x3;
      meanSums.x4 += x4; meanSums.x5 += x5; meanSums.x6 += x6;
      meanSums.x7 += x7; meanSums.x8 += x8; meanSums.x9 += x9;
    }
  }

  const total = cells.length || 1;
  const cellArea = GRID * GRID;
  return {
    gridSize: GRID, cols, rows,
    originX: bounds.minX, originY: bounds.minY,
    cells, weights: W,
    classDist: {
      y0: (counts.y0 / total) * 100,
      y1: (counts.y1 / total) * 100,
      y2: (counts.y2 / total) * 100,
    },
    classArea: {
      y0: counts.y0 * cellArea,
      y1: counts.y1 * cellArea,
      y2: counts.y2 * cellArea,
    },
    meanScores: {
      x1: meanSums.x1/total, x2: meanSums.x2/total, x3: meanSums.x3/total,
      x4: meanSums.x4/total, x5: meanSums.x5/total, x6: meanSums.x6/total,
      x7: meanSums.x7/total, x8: meanSums.x8/total, x9: meanSums.x9/total,
    },
    hardConstraintsApplied: apply,
  };
}

// ── Metadata cho UI ──────────────────────────────────────────────────────────

export const MCA_CRITERIA_LABELS: { key: keyof typeof DEFAULT_MCA_WEIGHTS; label: string; unit: string }[] = [
  { key: 'x1', label: 'Cao độ nền',           unit: 'm' },
  { key: 'x2', label: 'Nguy cơ ngập lụt',     unit: '%' },
  { key: 'x3', label: 'Khoảng cách mặt nước', unit: 'm' },
  { key: 'x4', label: 'Hiện trạng SDD',       unit: '' },
  { key: 'x5', label: 'Mật độ XD hiện trạng', unit: '%' },
  { key: 'x6', label: 'Phù hợp QH cấp trên',  unit: '' },
  { key: 'x7', label: 'Chi phí GPMB',         unit: '' },
  { key: 'x8', label: 'Tiếp cận giao thông',  unit: 'm' },
  { key: 'x9', label: 'Mật độ mạng đường',    unit: 'km/km²' },
];
