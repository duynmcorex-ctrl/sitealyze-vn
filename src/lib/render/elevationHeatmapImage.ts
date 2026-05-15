/**
 * elevationHeatmapImage.ts
 * Render heightmap → canvas PNG data URL
 *
 * 2 loại overlay (giống topographic-map.com + floodmap.net):
 *   1. buildElevationHeatmapDataURL: gradient HSV rainbow xanh→vàng→đỏ→hồng
 *   2. buildFloodDataURL: vùng ngập dưới waterLevel tô màu xanh (opacity theo độ sâu)
 *
 * Dùng cho BasemapPanel: overlay ảnh lên MapLibre như imageSource.
 */

import type { Heightmap } from '../types';

// 7 color stop chính (chuẩn hóa 0..1) — gradient HSV rainbow
const STOPS: { t: number; rgb: [number, number, number] }[] = [
  { t: 0.00, rgb: [0,   192, 255] }, // xanh dương đậm
  { t: 0.10, rgb: [0,   255, 255] }, // cyan
  { t: 0.25, rgb: [0,   255, 0]   }, // xanh lá tươi
  { t: 0.40, rgb: [255, 255, 0]   }, // vàng
  { t: 0.55, rgb: [255, 128, 0]   }, // cam
  { t: 0.70, rgb: [255, 0,   0]   }, // đỏ
  { t: 1.00, rgb: [255, 225, 225] }, // hồng nhạt
];

/** Nội suy tuyến tính RGB giữa 2 color stop gần nhất */
function tToColor(t: number): [number, number, number] {
  if (t <= 0) return STOPS[0].rgb;
  if (t >= 1) return STOPS[STOPS.length - 1].rgb;
  for (let i = 1; i < STOPS.length; i++) {
    const a = STOPS[i - 1];
    const b = STOPS[i];
    if (t <= b.t) {
      const k = (t - a.t) / (b.t - a.t);
      return [
        Math.round(a.rgb[0] + (b.rgb[0] - a.rgb[0]) * k),
        Math.round(a.rgb[1] + (b.rgb[1] - a.rgb[1]) * k),
        Math.round(a.rgb[2] + (b.rgb[2] - a.rgb[2]) * k),
      ];
    }
  }
  return STOPS[STOPS.length - 1].rgb;
}

/**
 * Build PNG data URL từ heightmap.
 * - Cell ngoài mask (filled/dilated) → trong suốt (alpha=0)
 * - Cell trong mask → tô màu theo gradient HSV rainbow
 *
 * Lưu ý: heightmap (data, mask) có y=0 ở MIN-Y (bottom theo DXF/UTM),
 * còn canvas có y=0 ở TOP → cần flip Y khi vẽ.
 */
export function buildElevationHeatmapDataURL(hm: Heightmap): string {
  const { width, height, data, mask, minZ, maxZ } = hm;
  const range = (maxZ - minZ) || 1;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  const img = ctx.createImageData(width, height);

  for (let y = 0; y < height; y++) {
    const srcY = height - 1 - y; // flip Y
    for (let x = 0; x < width; x++) {
      const srcIdx = srcY * width + x;
      const dstIdx = (y * width + x) * 4;

      const z = data[srcIdx];
      const inMask = !mask || mask[srcIdx] === 1;
      if (!Number.isFinite(z) || !inMask) {
        img.data[dstIdx + 3] = 0; // transparent
        continue;
      }

      const t = Math.max(0, Math.min(1, (z - minZ) / range));
      const [r, g, b] = tToColor(t);
      img.data[dstIdx]     = r;
      img.data[dstIdx + 1] = g;
      img.data[dstIdx + 2] = b;
      img.data[dstIdx + 3] = 255;
    }
  }

  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL('image/png');
}

// ── Flood simulation (floodmap.net style) ────────────────────────────────────
/**
 * Render vùng ngập dưới ngưỡng waterLevelM.
 * - Z ≤ waterLevel: tô màu xanh, opacity tỷ lệ với độ sâu (sâu hơn → đậm hơn)
 * - Z > waterLevel: trong suốt
 * - Ngoài mask: trong suốt
 */
export function buildFloodDataURL(hm: Heightmap, waterLevelM: number): string {
  const { width, height, data, mask } = hm;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  const img = ctx.createImageData(width, height);

  for (let y = 0; y < height; y++) {
    const srcY = height - 1 - y; // flip Y
    for (let x = 0; x < width; x++) {
      const srcIdx = srcY * width + x;
      const dstIdx = (y * width + x) * 4;
      const z = data[srcIdx];
      const inMask = !mask || mask[srcIdx] === 1;
      if (!Number.isFinite(z) || !inMask || z > waterLevelM) {
        img.data[dstIdx + 3] = 0; // transparent
        continue;
      }
      const depth = waterLevelM - z; // độ sâu tính từ mực nước (m)
      // Màu xanh theo độ sâu: nông → nhạt, sâu → đậm (giống floodmap.net)
      const alpha = Math.min(220, Math.round(80 + Math.sqrt(depth) * 30));
      img.data[dstIdx]     = 0;
      img.data[dstIdx + 1] = Math.max(60, Math.round(140 - depth * 3));
      img.data[dstIdx + 2] = 220;
      img.data[dstIdx + 3] = alpha;
    }
  }

  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL('image/png');
}

// ── Color stop data cho legend (20 mức) ────────────────────────────────────
export { STOPS as ELEV_HEATMAP_STOPS };
export function getElevHeatmapColor(t: number): [number, number, number] {
  return tToColor(t);
}
