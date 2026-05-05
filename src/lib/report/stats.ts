import type { Heightmap } from '../types';
import type { HydrologyData } from '../analysis/hydrology';

// ── Direction names (tiếng Việt) ─────────────────────────────────────────────

export const DIR_NAMES_VI: Record<string, string> = {
  N: 'Bắc', NE: 'Đông Bắc', E: 'Đông', SE: 'Đông Nam',
  S: 'Nam', SW: 'Tây Nam', W: 'Tây', NW: 'Tây Bắc',
};

const DIR_KEYS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const;
export type DirKey = typeof DIR_KEYS[number];

/** Map độ aspect 0-360 → 1 trong 8 hướng (N/NE/.../NW) */
export function aspectToDir(deg: number): DirKey {
  const idx = Math.round(((deg % 360) + 360) % 360 / 45) % 8;
  return DIR_KEYS[idx];
}

// ── Histograms ───────────────────────────────────────────────────────────────

export interface AspectHistogram {
  pct: Record<DirKey, number>;     // % theo từng hướng (tổng = 100)
  dominant: DirKey;
  totalCells: number;
}

/** Thống kê hướng phơi (chỉ trong vùng terrain hợp lệ — slope ≥ 2°) */
export function histogramAspect(
  aspectDeg: Float32Array,
  slopeDeg: Float32Array,
  mask: Uint8Array | undefined,
  minSlope = 2,
): AspectHistogram {
  const counts: Record<DirKey, number> = { N:0, NE:0, E:0, SE:0, S:0, SW:0, W:0, NW:0 };
  let total = 0;
  for (let i = 0; i < aspectDeg.length; i++) {
    if (mask && !mask[i]) continue;
    if (slopeDeg[i] < minSlope) continue; // bỏ vùng phẳng (aspect không có ý nghĩa)
    counts[aspectToDir(aspectDeg[i])]++;
    total++;
  }
  const pct: Record<DirKey, number> = { N:0, NE:0, E:0, SE:0, S:0, SW:0, W:0, NW:0 };
  let dominant: DirKey = 'N';
  let maxV = -1;
  for (const k of DIR_KEYS) {
    pct[k] = total > 0 ? (counts[k] / total) * 100 : 0;
    if (counts[k] > maxV) { maxV = counts[k]; dominant = k; }
  }
  return { pct, dominant, totalCells: total };
}

/** Đếm số cell mỗi class slope (đã lọc mask) */
export function histogramSlopeClass(
  classes: Uint8Array,
  mask: Uint8Array | undefined,
  classCount: number,
): { counts: number[]; pct: number[]; total: number } {
  const counts = new Array(classCount).fill(0);
  let total = 0;
  for (let i = 0; i < classes.length; i++) {
    if (mask && !mask[i]) continue;
    counts[classes[i]]++;
    total++;
  }
  const pct = counts.map((c) => total > 0 ? (c / total) * 100 : 0);
  return { counts, pct, total };
}

/** Phân bố cao độ thành N bins đều */
export function histogramElev(
  data: Float32Array,
  minZ: number,
  maxZ: number,
  mask: Uint8Array | undefined,
  bins = 5,
): { counts: number[]; pct: number[]; edges: number[]; total: number } {
  const counts = new Array(bins).fill(0);
  const range = Math.max(1e-6, maxZ - minZ);
  const step = range / bins;
  let total = 0;
  for (let i = 0; i < data.length; i++) {
    if (mask && !mask[i]) continue;
    const idx = Math.min(bins - 1, Math.max(0, Math.floor((data[i] - minZ) / step)));
    counts[idx]++;
    total++;
  }
  const pct = counts.map((c) => total > 0 ? (c / total) * 100 : 0);
  const edges = Array.from({ length: bins + 1 }, (_, i) => minZ + i * step);
  return { counts, pct, edges, total };
}

// ── Area & dimensions ────────────────────────────────────────────────────────

/** Diện tích thực terrain (ha) — chỉ đếm cell mask=1 */
export function terrainArea(hm: Heightmap): number {
  if (!hm.mask) return (hm.width * hm.height * hm.cellSize * hm.cellSize) / 10_000;
  let count = 0;
  for (let i = 0; i < hm.mask.length; i++) if (hm.mask[i]) count++;
  return (count * hm.cellSize * hm.cellSize) / 10_000;
}

/** Kích thước bbox terrain (m, m) */
export function terrainBboxSize(hm: Heightmap): { w: number; h: number } {
  return { w: hm.width * hm.cellSize, h: hm.height * hm.cellSize };
}

// ── Centroid của vùng top-Z hoặc bottom-Z ───────────────────────────────────

/**
 * Tìm hướng (so với trung tâm) của tốp N% cao nhất hoặc thấp nhất.
 * @param mode 'top' = vùng cao | 'bottom' = vùng thấp
 * @param pctTarget tỉ lệ cell muốn lấy (vd 0.1 = top 10%)
 */
export function extremeZRegionDirection(
  hm: Heightmap,
  mode: 'top' | 'bottom',
  pctTarget = 0.1,
): { dir: DirKey; pct: number } {
  const { width: w, height: h, data, mask } = hm;
  // Threshold
  const valid: number[] = [];
  for (let i = 0; i < data.length; i++) {
    if (mask && !mask[i]) continue;
    valid.push(data[i]);
  }
  if (valid.length === 0) return { dir: 'N', pct: 0 };
  valid.sort((a, b) => mode === 'top' ? b - a : a - b);
  const cutoff = valid[Math.min(valid.length - 1, Math.floor(valid.length * pctTarget))];

  let cx = 0, cy = 0, count = 0;
  const totalCx = w / 2, totalCy = h / 2;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (mask && !mask[i]) continue;
      const v = data[i];
      const isMatch = mode === 'top' ? v >= cutoff : v <= cutoff;
      if (!isMatch) continue;
      cx += x;
      cy += y;
      count++;
    }
  }
  if (count === 0) return { dir: 'N', pct: 0 };
  cx = cx / count - totalCx;
  cy = cy / count - totalCy;
  // cy: row tăng = nam (DXF Y ngược, nhưng đây là grid index). DXF Y tăng = Bắc nhưng row=0 = minY = Nam, row=H = maxY = Bắc. Vậy cy < 0 = phía Bắc (row nhỏ).
  // Convert (cx, cy) sang aspect-style angle: 0 = North, clockwise.
  // Bắc = cy âm (row nhỏ tức minY-edge tức Nam thực!) — wait, row 0 = minY = phía Nam.
  // Nên cy âm nghĩa là phần phía Nam (minY). Đảo lại: Bắc ↔ cy âm? Không.
  // row 0 = DXF minY = phía Nam (Y nhỏ). row H = DXF maxY = phía Bắc.
  // Vậy cy âm (row trung bình < tổng/2) = phía Nam.
  // angle: 0=Bắc → cần dy = +cy lớn → angle 0; cy âm → angle 180 (Nam).
  // atan2(x, -y) where -y means flip: angle 0 = north (cy=positive max).
  const angle = (Math.atan2(cx, cy) * 180 / Math.PI + 360) % 360; // 0=N (cy>0), 90=E (cx>0), 180=S, 270=W
  const dir = aspectToDir(angle);
  return { dir, pct: (count / valid.length) * 100 };
}

// ── Hydrology hotspots ───────────────────────────────────────────────────────

export interface AccumHotspot {
  /** Toạ độ Three.js world (đã centered, đã flip Z) */
  worldX: number;
  worldZ: number;
  /** Độ tích tụ (số cell upstream) */
  accum: number;
  /** Hướng so với trung tâm địa hình */
  dirFromCenter: DirKey;
}

/** Tốp N điểm tích tụ nước (loại bỏ điểm gần biên) */
export function accumulationHotspots(
  hydro: HydrologyData,
  hm: Heightmap,
  topN = 3,
  edgeMargin = 4,
): AccumHotspot[] {
  const { width: w, height: h, cellSize, mask } = hm;
  const cx = (w * cellSize) / 2;
  const cy = (h * cellSize) / 2;
  // Pair (idx, accum), lọc cell biên + ngoài mask
  const items: { idx: number; accum: number }[] = [];
  for (let y = edgeMargin; y < h - edgeMargin; y++) {
    for (let x = edgeMargin; x < w - edgeMargin; x++) {
      const i = y * w + x;
      if (mask && !mask[i]) continue;
      items.push({ idx: i, accum: hydro.flowAccum[i] });
    }
  }
  items.sort((a, b) => b.accum - a.accum);
  // Lấy top N nhưng đảm bảo không quá gần nhau (NMS đơn giản, distance > 8 cell)
  const minDist = 8;
  const picked: { idx: number; accum: number }[] = [];
  for (const it of items) {
    if (picked.length >= topN) break;
    const x = it.idx % w;
    const y = (it.idx / w) | 0;
    const tooClose = picked.some((p) => {
      const px = p.idx % w; const py = (p.idx / w) | 0;
      return Math.hypot(x - px, y - py) < minDist;
    });
    if (!tooClose) picked.push(it);
  }
  return picked.map(({ idx, accum }) => {
    const x = idx % w;
    const y = (idx / w) | 0;
    const worldX = x * cellSize - cx;
    const worldZ = -(y * cellSize - cy);
    // Direction from center to hotspot (world space)
    const angle = (Math.atan2(worldX, -worldZ) * 180 / Math.PI + 360) % 360;
    return { worldX, worldZ, accum, dirFromCenter: aspectToDir(angle) };
  });
}

// ── Helpers ──────────────────────────────────────────────────────────────────

export function fmtPct(v: number, decimals = 1): string {
  return `${v.toFixed(decimals)}%`;
}

export function fmtMeters(v: number, decimals = 1): string {
  return `${v.toFixed(decimals)} m`;
}

export function fmtArea(haValue: number): string {
  if (haValue < 0.1) return `${(haValue * 10_000).toFixed(0)} m²`;
  return `${haValue.toFixed(2)} ha`;
}
