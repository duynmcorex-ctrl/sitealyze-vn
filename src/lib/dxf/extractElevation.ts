// Trích cao độ từ tên layer khi vertex không có Z (ví dụ: "DC_50", "EL_120", "CONTOUR_1.5")
const LAYER_ELEV_REGEX = /(-?\d+(?:[.,]\d+)?)/;

export function elevationFromLayer(layerName: string | undefined): number | null {
  if (!layerName) return null;
  const match = layerName.match(LAYER_ELEV_REGEX);
  if (!match) return null;
  const v = parseFloat(match[1].replace(',', '.'));
  return Number.isFinite(v) ? v : null;
}

export function pickElevation(
  vertexZ: number | undefined,
  fallbackZ: number | undefined,
  layerName: string | undefined
): number | null {
  if (typeof vertexZ === 'number' && vertexZ !== 0) return vertexZ;
  if (typeof fallbackZ === 'number' && fallbackZ !== 0) return fallbackZ;
  if (typeof vertexZ === 'number') return vertexZ;
  if (typeof fallbackZ === 'number') return fallbackZ;
  const fromLayer = elevationFromLayer(layerName);
  if (fromLayer !== null) return fromLayer;
  return null;
}
