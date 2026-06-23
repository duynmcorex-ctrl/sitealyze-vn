/**
 * buildDemTerrain.ts
 * Tái tạo TerrainData từ ranh giới Google Earth (lat/lon polygon) + DEM SRTM 30m.
 *
 * Pipeline:
 *   1. Chọn kinh tuyến trục VN-2000 gần đúng theo centroid ranh giới
 *   2. Forward-project ranh giới → easting/northing (mặt phẳng, mét)
 *   3. Xác định cellSize (>=30m, theo độ phân giải SRTM) + kích thước lưới
 *   4. Tạo lưới điểm lat/lon tương ứng (inverse projection từng cell)
 *   5. Gọi OpenTopoData lấy elevation cho từng điểm lưới
 *   6. Build Heightmap (mask = nằm trong polygon ranh giới), build mesh
 *   7. Trả về TerrainData — tương thích nguyên vẹn pipeline phân tích hiện có
 */

import { latLonToVN2000, vn2000ToLatLon, pickMeridianForLatLon } from '../coord/vn2000';
import { fetchElevations } from './fetchDem';
import { buildMeshFromHeightmap } from '../terrain/buildMesh';
import { smoothHeightmap } from '../terrain/heightmap';
import type { Heightmap, TerrainData } from '../types';

const MAX_GRID_DIM = 64;       // tối đa 65×65 điểm lưới (~4225 điểm, ~43 request)
const MIN_CELL_SIZE = 30;      // mét — giới hạn phân giải thật của SRTM 30m
const MIN_GRID_DIM = 6;

export interface BuildDemTerrainOptions {
  onProgress?: (message: string) => void;
}

/** Point-in-polygon ray-casting (toạ độ phẳng mét, đa giác không cần khép vòng) */
function pointInPolygon(x: number, y: number, poly: { x: number; y: number }[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y;
    const xj = poly[j].x, yj = poly[j].y;
    const intersect =
      yi > y !== yj > y &&
      x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export async function buildTerrainFromBoundary(
  boundaryLatLon: { lat: number; lon: number }[],
  opts: BuildDemTerrainOptions = {},
): Promise<TerrainData> {
  if (boundaryLatLon.length < 3) {
    throw new Error('Ranh giới cần tối thiểu 3 điểm.');
  }

  // ── 1. Chọn kinh tuyến trục theo centroid ──
  const centroidLat = boundaryLatLon.reduce((s, p) => s + p.lat, 0) / boundaryLatLon.length;
  const centroidLon = boundaryLatLon.reduce((s, p) => s + p.lon, 0) / boundaryLatLon.length;
  const projOpts = pickMeridianForLatLon(centroidLat, centroidLon);

  // ── 2. Forward-project ranh giới → mặt phẳng (easting/northing) ──
  const boundaryXY = boundaryLatLon.map((p) => {
    const { easting, northing } = latLonToVN2000(p.lat, p.lon, projOpts);
    return { x: easting, y: northing };
  });

  const minX = Math.min(...boundaryXY.map((p) => p.x));
  const maxX = Math.max(...boundaryXY.map((p) => p.x));
  const minY = Math.min(...boundaryXY.map((p) => p.y));
  const maxY = Math.max(...boundaryXY.map((p) => p.y));
  const widthM = maxX - minX;
  const heightM = maxY - minY;

  if (!(widthM > 0) || !(heightM > 0) || widthM > 50000 || heightM > 50000) {
    throw new Error('Ranh giới không hợp lệ hoặc quá lớn (>50km).');
  }

  // ── 3. Xác định cellSize + kích thước lưới ──
  const cellSize = Math.max(MIN_CELL_SIZE, Math.max(widthM, heightM) / MAX_GRID_DIM);
  const width  = Math.min(MAX_GRID_DIM + 1, Math.max(MIN_GRID_DIM, Math.round(widthM / cellSize) + 1));
  const height = Math.min(MAX_GRID_DIM + 1, Math.max(MIN_GRID_DIM, Math.round(heightM / cellSize) + 1));

  // ── 4. Tạo lưới điểm lat/lon (inverse projection từng cell) ──
  opts.onProgress?.(`Đang tạo lưới ${width}×${height} điểm…`);
  const gridPoints: { lat: number; lon: number }[] = [];
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const e = minX + col * cellSize;
      const n = minY + row * cellSize;
      const { lat, lon } = vn2000ToLatLon(e, n, projOpts);
      gridPoints.push({ lat, lon });
    }
  }

  // ── 5. Gọi OpenTopoData lấy elevation ──
  opts.onProgress?.(`Đang tải cao độ SRTM cho ${gridPoints.length} điểm…`);
  const elevations = await fetchElevations(gridPoints, (done, total) => {
    opts.onProgress?.(`Đang tải cao độ SRTM… ${done}/${total}`);
  });

  // ── 6. Build Heightmap ──
  const data = new Float32Array(width * height);
  const mask = new Uint8Array(width * height);
  let minZ = Infinity, maxZ = -Infinity;
  let validCount = 0;

  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const idx = row * width + col;
      const e = minX + col * cellSize;
      const n = minY + row * cellSize;
      const inside = pointInPolygon(e, n, boundaryXY);
      const elev = elevations[idx];
      const z = elev ?? 0;
      data[idx] = z;
      if (inside && elev !== null) {
        mask[idx] = 1;
        validCount++;
        if (z < minZ) minZ = z;
        if (z > maxZ) maxZ = z;
      }
    }
  }

  if (validCount === 0) {
    throw new Error(
      'Không lấy được cao độ hợp lệ trong ranh giới (có thể vùng ngoài phạm vi SRTM hoặc lỗi mạng).',
    );
  }
  if (!Number.isFinite(minZ)) { minZ = 0; maxZ = 0; }

  // Gap-fill các điểm null/outside để mesh không bị răng cưa — dùng giá trị trung bình hợp lệ
  const meanZ = (minZ + maxZ) / 2;
  for (let i = 0; i < data.length; i++) {
    if (!mask[i] && elevations[i] === null) data[i] = meanZ;
  }

  let heightmap: Heightmap = {
    width, height, cellSize,
    origin: { x: minX, y: minY },
    data, minZ, maxZ, mask,
  };

  // Smoothing nhẹ — SRTM 30m thô, mượt hoá để terrain mesh đỡ răng cưa
  heightmap = smoothHeightmap(heightmap, 2);

  // ── 7. Build mesh + TerrainData ──
  opts.onProgress?.('Đang dựng mesh 3D…');
  const mesh = buildMeshFromHeightmap(heightmap);

  const terrain: TerrainData = {
    heightmap,
    meshPositions: mesh.positions,
    meshIndices: mesh.indices,
    meshNormals: mesh.normals,
    contours: [],
    bounds: { minX, minY, maxX: minX + width * cellSize, maxY: minY + height * cellSize, minZ, maxZ },
  };

  return terrain;
}
