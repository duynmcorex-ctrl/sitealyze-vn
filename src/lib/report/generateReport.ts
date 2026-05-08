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

  const sections = [
    buildElevationSection(hm, features, slope, aspectHist),
    buildSlopeSection(hm, slope, slopeMode),
    buildContourSection(hm, contours, env.contourInterval),
    buildFeaturesSection(hm, features),
    buildHydrologySection(hm, hydro),
    buildSuitabilitySection(hm, suitability),
    buildSunSection(hm, env, aspectHist, geo),
    buildWindSection(env, aspectHist, geo),
    buildViewshedSection(hm, viewshed, viewpoint ?? null),
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
