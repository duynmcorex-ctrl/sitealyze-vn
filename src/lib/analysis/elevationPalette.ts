/**
 * Bảng màu 10 bước cho phân tích cao độ — nhất quán giữa mesh, đường đồng mức và legend.
 * Từ thấp → cao: xanh dương nhạt → xanh lá → vàng → cam → đỏ đậm (chuẩn GIS Việt Nam).
 *
 * Khi dải cao độ < SMALL_RANGE_THRESHOLD_M (10m) sẽ dùng ELEV_PALETTE_SMALL_RGB —
 * palette đất tự nhiên (xanh nhạt → xanh đậm → vàng đất) để tránh gradient "cầu vồng"
 * gây ảo giác địa hình có chênh lệch lớn khi thực tế gần phẳng.
 */

export const SMALL_RANGE_THRESHOLD_M = 10;

// Palette địa hình nhỏ: xanh lam nhạt → xanh lá nhạt → vàng đất → nâu nhạt
// Dùng khi range < 10m để tránh blue→red gây hiểu lầm
export const ELEV_PALETTE_SMALL_RGB: [number, number, number][] = [
  [0.61, 0.78, 0.64], // 0  xanh lá rất nhạt (thung lũng)
  [0.56, 0.76, 0.60], // 1
  [0.52, 0.74, 0.56], // 2
  [0.56, 0.74, 0.44], // 3  xanh lá → vàng xanh
  [0.66, 0.77, 0.38], // 4
  [0.76, 0.80, 0.42], // 5  vàng nhạt
  [0.82, 0.78, 0.48], // 6  vàng đất
  [0.80, 0.72, 0.50], // 7  nâu vàng
  [0.74, 0.65, 0.48], // 8  nâu đất
  [0.66, 0.57, 0.42], // 9  nâu đậm (đỉnh)
];

export const ELEV_PALETTE_SMALL_HEX = ELEV_PALETTE_SMALL_RGB.map(([r, g, b]) =>
  '#' + [r, g, b]
    .map((v) => Math.round(v * 255).toString(16).padStart(2, '0'))
    .join('')
);

// [r, g, b] đã chia sẵn 0-1 để gán vertex color nhanh
export const ELEV_PALETTE_RGB: [number, number, number][] = [
  [0.49, 0.76, 0.94], // 0  xanh dương nhạt
  [0.24, 0.63, 0.79], // 1
  [0.19, 0.72, 0.64], // 2  teal
  [0.40, 0.80, 0.45], // 3  xanh lá
  [0.68, 0.87, 0.28], // 4  xanh vàng
  [0.99, 0.93, 0.19], // 5  vàng
  [0.99, 0.72, 0.12], // 6  vàng cam
  [0.95, 0.46, 0.10], // 7  cam đỏ
  [0.82, 0.20, 0.09], // 8  đỏ
  [0.55, 0.05, 0.05], // 9  đỏ đậm (cao nhất)
];

// Hex tương ứng (để dùng trong Legend và line colors)
export const ELEV_PALETTE_HEX = ELEV_PALETTE_RGB.map(([r, g, b]) =>
  '#' + [r, g, b]
    .map((v) => Math.round(v * 255).toString(16).padStart(2, '0'))
    .join('')
);

/** Trả về index (0–9) trong palette cho giá trị z trong [minZ, maxZ] */
export function elevPaletteIndex(z: number, minZ: number, maxZ: number): number {
  const t = Math.max(0, Math.min(1, (z - minZ) / Math.max(1e-6, maxZ - minZ)));
  return Math.min(ELEV_PALETTE_RGB.length - 1, Math.floor(t * ELEV_PALETTE_RGB.length));
}

/** Tạo danh sách nhãn cho legend: [{color, label}] */
export function buildElevationLegendItems(
  minZ: number,
  maxZ: number,
  interval: number,
): { color: string; label: string }[] {
  const start = Math.floor(minZ / interval) * interval;
  const end   = Math.ceil(maxZ  / interval) * interval;
  const items: { color: string; label: string }[] = [];

  for (let z = start; z < end; z += interval) {
    const idx = elevPaletteIndex(z + interval / 2, minZ, maxZ);
    items.push({
      color: ELEV_PALETTE_HEX[idx],
      label: `${z.toFixed(0)} – ${(z + interval).toFixed(0)} m`,
    });
  }
  // Gộp lại nếu quá nhiều bước (hiển thị tối đa 12 mục)
  if (items.length > 12) {
    const step = Math.ceil(items.length / 12);
    return items.filter((_, i) => i % step === 0 || i === items.length - 1);
  }
  return items;
}
