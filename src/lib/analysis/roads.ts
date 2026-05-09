/**
 * Phân tích giao thông hiện trạng từ overlay DXF có layer được tag `isRoad`.
 *
 * Metrics:
 *  - Tổng chiều dài đường (m)
 *  - Theo từng layer: chiều dài, độ dốc dọc TB và max
 *  - Hệ số tiếp cận: % chu vi địa hình có đường trong buffer 50m
 *
 * Lưu ý: Polylines đã ở world space (m) với Z = cao độ thực.
 */

import type { OverlayLayer, Heightmap } from '../types';

export interface RoadSegmentInfo {
  name: string;
  color: string;
  lengthM: number;
  avgSlopePct: number;
  maxSlopePct: number;
}

export interface RoadsAnalysis {
  totalLengthM: number;
  segments: RoadSegmentInfo[];
  /** 0–100: % chu vi địa hình có đường trong 50m */
  accessibilityPct: number;
}

/**
 * Regex auto-detect tên layer giao thông.
 *
 * QUAN TRỌNG: Cần loại trừ các pattern dễ nhầm:
 *   - DUONG_DONG_MUC, DUONG-DONG-MUC = đường ĐỒNG MỨC (contour) — KHÔNG phải đường giao thông
 *   - BINH_DO, BINH-DO = bình đồ (terrain) — không phải đường
 *   - DM, DC, DG = layer code đường đồng mức
 *
 * Dùng negative lookahead `DUONG(?![-_ ]?(DONG|MUC|BINH|DO|DM|DC|DG))` để
 * không match "DUONG_DONG_MUC", "DUONG_DONG", "DUONG_MUC", v.v.
 */
export const ROAD_LAYER_RE =
  /(GIAOTHONG|GIAO[-_ ]?THONG|^GT$|^GT[-_ ]|[-_ ]GT[-_ ]|[-_ ]GT$|DUONG(?![-_ ]?(DONG|MUC|BINH|DO|DM|DC|DG))|D[-_]T|LO[-_ ]?GIOI|MEPDUONG|MEP[-_ ]?DUONG|TIMDUONG|TIM[-_ ]?DUONG|VIA[-_ ]?HE|VIAHE|ROAD(?![-_ ]?ELEV)|STREET|LANE|TRAFFIC|TRANSPORT)/i;

/** Trả về true nếu tên layer thuộc giao thông */
export function isRoadLayer(layerName: string): boolean {
  return ROAD_LAYER_RE.test(layerName);
}

/** Chiều dài 3D của một polyline (m) */
function polylineLength3D(pts: { x: number; y: number; z: number }[]): number {
  let len = 0;
  for (let i = 1; i < pts.length; i++) {
    const dx = pts[i].x - pts[i - 1].x;
    const dy = pts[i].y - pts[i - 1].y;
    const dz = pts[i].z - pts[i - 1].z;
    len += Math.sqrt(dx * dx + dy * dy + dz * dz);
  }
  return len;
}

/** Độ dốc dọc (%) từng đoạn và trả về {avg, max} */
function polylineSlope(pts: { x: number; y: number; z: number }[]): { avg: number; max: number } {
  if (pts.length < 2) return { avg: 0, max: 0 };
  let sumSlope = 0, maxSlope = 0, count = 0;
  for (let i = 1; i < pts.length; i++) {
    const dx = pts[i].x - pts[i - 1].x;
    const dy = pts[i].y - pts[i - 1].y;
    const dz = Math.abs(pts[i].z - pts[i - 1].z);
    const horiz = Math.sqrt(dx * dx + dy * dy);
    if (horiz < 0.01) continue;
    const s = (dz / horiz) * 100;
    sumSlope += s;
    if (s > maxSlope) maxSlope = s;
    count++;
  }
  return { avg: count > 0 ? sumSlope / count : 0, max: maxSlope };
}

/**
 * Tính % chu vi địa hình có đường trong buffer 50m.
 * Sample 100 điểm đều trên chu vi, kiểm tra có polyline nào trong 50m không.
 */
function computeAccessibility(
  roadLayers: OverlayLayer[],
  hm: Heightmap,
): number {
  const hw = (hm.width  * hm.cellSize) / 2;
  const hh = (hm.height * hm.cellSize) / 2;
  const BUFFER = 50; // m
  const SAMPLES = 100;
  const BUFFER2 = BUFFER * BUFFER;

  // Thu thập tất cả điểm đường
  const roadPts: { x: number; z: number }[] = [];
  for (const layer of roadLayers) {
    for (const poly of layer.polylines) {
      for (const p of poly) roadPts.push({ x: p.x, z: p.z });
    }
  }
  if (roadPts.length === 0) return 0;

  const perimeter = 2 * (hm.width + hm.height) * hm.cellSize;
  let hits = 0;

  for (let i = 0; i < SAMPLES; i++) {
    const d = (i / SAMPLES) * perimeter;
    let px: number, pz: number;
    if (d < hm.width * hm.cellSize) {
      px = -hw + d; pz = -hh;
    } else if (d < (hm.width + hm.height) * hm.cellSize) {
      px = hw; pz = -hh + (d - hm.width * hm.cellSize);
    } else if (d < (2 * hm.width + hm.height) * hm.cellSize) {
      px = hw - (d - (hm.width + hm.height) * hm.cellSize); pz = hh;
    } else {
      px = -hw; pz = hh - (d - (2 * hm.width + hm.height) * hm.cellSize);
    }

    let found = false;
    for (const rp of roadPts) {
      const dx = rp.x - px, dz = rp.z - pz;
      if (dx * dx + dz * dz <= BUFFER2) { found = true; break; }
    }
    if (found) hits++;
  }

  return Math.round((hits / SAMPLES) * 100);
}

/**
 * Phân tích tất cả road layers.
 * @param roadLayers Các layer đã được tag isRoad = true
 * @param hm Heightmap của terrain (dùng tính accessibility)
 */
export function analyzeRoads(roadLayers: OverlayLayer[], hm?: Heightmap): RoadsAnalysis {
  let totalLengthM = 0;
  const segments: RoadSegmentInfo[] = [];

  for (const layer of roadLayers) {
    let layerLen = 0;
    let sumSlope = 0, maxSlope = 0, slopeCount = 0;

    for (const poly of layer.polylines) {
      layerLen += polylineLength3D(poly);
      const { avg, max } = polylineSlope(poly);
      sumSlope += avg;
      if (max > maxSlope) maxSlope = max;
      slopeCount++;
    }

    totalLengthM += layerLen;
    segments.push({
      name: layer.name,
      color: layer.color,
      lengthM: layerLen,
      avgSlopePct: slopeCount > 0 ? sumSlope / slopeCount : 0,
      maxSlopePct: maxSlope,
    });
  }

  const accessibilityPct = hm ? computeAccessibility(roadLayers, hm) : 0;

  return { totalLengthM, segments, accessibilityPct };
}
