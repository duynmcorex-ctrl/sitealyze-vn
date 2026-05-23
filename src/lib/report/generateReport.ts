/**
 * generateReport.ts
 * Entry point: nhận toàn bộ analysis data → trả về Report object.
 */
import type { Heightmap, Report, EnvParams, OverlayLayer } from '../types';
import type { SlopeData, SlopeClassMode } from '../analysis/slope';
import type { HydrologyData } from '../analysis/hydrology';
import type { TerrainFeatures } from '../analysis/features';
import type { SuitabilityData } from '../analysis/suitability';
import type { ContourLineSegment } from '../analysis/contours';
import type { GeoInfo } from '../coord/provinces';
import { analyzeRoads } from '../analysis/roads';
import { histogramAspect, terrainArea } from './stats';
import {
  buildElevationSection,
  buildSlopeSection,
  buildContourSection,
  buildFeaturesSection,
  buildHydrologySection,
  buildSuitabilitySection,
  buildSunSection,
  buildWindSection,
  buildViewshedSection,
  buildRoadsSection,
} from './sections';

export interface ReportInput {
  heightmap: Heightmap;
  env: EnvParams;
  slopeMode: SlopeClassMode;
  slope?: SlopeData;
  hydro?: HydrologyData;
  features?: TerrainFeatures;
  suitability?: SuitabilityData;
  contours?: ContourLineSegment[];
  viewshed?: Uint8Array;
  viewpoint?: { x: number; z: number; height: number } | null;
  /** Các overlay layer giao thông (isRoad = true) — để phân tích roads */
  roadLayers?: OverlayLayer[];
  /** Thông tin địa lý đã xác định từ VN2000 — để cite vi khí hậu địa phương */
  geo?: GeoInfo | null;
}

export function buildReport(input: ReportInput): Report {
  const { heightmap: hm, env, slopeMode, slope, hydro, features, suitability, contours, viewshed, viewpoint, roadLayers, geo } = input;

  // Pre-compute aspect histogram nếu có slope data
  const aspectHist = slope
    ? histogramAspect(slope.aspectDeg, slope.slopeDeg, hm.mask)
    : undefined;

  // Thứ tự khớp với tabs "Đánh giá hiện trạng" (mục 2):
  // 1. Điều kiện tự nhiên (Nắng, Gió)
  // 2. View (Đặc trưng địa hình, Tầm nhìn)
  // 3. Địa hình (Cao độ, Đường đồng mức)
  // 4. Độ dốc
  // 5. Quỹ đất xây dựng
  // 6. Thủy văn
  // 7. Giao thông
  const sections = [
    buildSunSection(hm, env, aspectHist, geo),
    buildWindSection(env, aspectHist, geo),
    buildFeaturesSection(hm, features),
    buildViewshedSection(hm, viewshed, viewpoint ?? null),
    buildElevationSection(hm, features, slope, aspectHist),
    buildContourSection(hm, contours, env.contourInterval),
    buildSlopeSection(hm, slope, slopeMode),
    buildSuitabilitySection(hm, suitability),
    buildHydrologySection(hm, hydro),
    buildRoadsSection(roadLayers?.length ? analyzeRoads(roadLayers, hm) : undefined, roadLayers),
  ];

  return {
    generatedAt: new Date().toISOString(),
    terrain: {
      minZ: hm.minZ,
      maxZ: hm.maxZ,
      areaHa: terrainArea(hm),
      cellSize: hm.cellSize,
      width: hm.width,
      height: hm.height,
    },
    sections,
  };
}
