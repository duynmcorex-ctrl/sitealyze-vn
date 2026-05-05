/**
 * Bảng màu 10 bước cho phân tích cao độ — nhất quán giữa mesh, đường đồng mức và legend.
 * Từ thấp → cao: xanh dương nhạt → xanh lá → vàng → cam → đỏ đậm (chuẩn GIS Việt Nam).
 */

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
