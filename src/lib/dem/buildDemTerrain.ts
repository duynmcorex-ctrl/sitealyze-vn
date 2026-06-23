/**
 * buildDemTerrain.ts
 * Tái tạo TerrainData từ ranh giới Google Earth (lat/lon polygon) + DEM SRTM 30m.
 *
 * Pipeline:
 *   1. Chọn kinh tuyến trục VN-2000 gần đúng theo centroid ranh giới
 *   2. Forward-project ranh giới → easting/northing (mặt phẳng, mét)
 *   3. Buffer bbox ra ngoài ranh giới (margin) — tạo lưới RỘNG HƠN ranh giới thật
 *   4. Tạo lưới điểm lat/lon tương ứng (inverse projection từng cell)
 *   5. Gọi OpenTopoData lấy elevation cho từng điểm lưới
 *   6. Build Heightmap — mask theo "có cao độ hợp lệ" (KHÔNG khoét theo polygon ngay)
 *      → terrain liền mạch, không lỗ rỗ do ranh giới hẹp/ngoằn ngoèo cắt qua lưới thô.
 *   7. Đưa ranh giới thật vào `boundaryCandidates` (toạ độ cùng hệ với heightmap.origin)
 *      → tái dùng UI "Ranh giới hiển thị" có sẵn (giống pipeline DXF) để user TỰ chọn
 *      áp clip sau, không tự động clip (isLikelyBoundary=false) nên mặc định hiện
 *      toàn bộ terrain liền mạch.
 *   8. Trả về TerrainData — tương thích nguyên vẹn pipeline phân tích hiện có
 */

import { latLonToVN2000, vn2000ToLatLon, pickMeridianForLatLon } from '../coord/vn2000';
import { fetchElevations } from './fetchDem';
import { buildMeshFromHeightmap } from '../terrain/buildMesh';
import { smoothHeightmap } from '../terrain/heightmap';
import type { BoundaryCandidate, Heightmap, TerrainData } from '../types';

const MAX_GRID_DIM = 64;       // tối đa 65×65 điểm lưới (~4225 điểm, ~43 request)
const MIN_CELL_SIZE = 30;      // mét — giới hạn phân giải thật của SRTM 30m
const MIN_GRID_DIM = 6;
const BUFFER_RATIO = 0.15;     // mở rộng bbox thêm 15% mỗi chiều
const BUFFER_MIN_M = 150;      // buffer tối thiểu (m) — đủ cho site nhỏ/ranh giới hẹp

export interface BuildDemTerrainOptions {
  onProgress?: (message: string) => void;
}

/** Shoelace area (m²) — toạ độ phẳng mét */
function shoelaceArea(poly: { x: number; y: number }[]): number {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const p1 = poly[i], p2 = poly[(i + 1) % poly.length];
    a += p1.x * p2.y - p2.x * p1.y;
  }
  return Math.abs(a) / 2;
}

/** Gap-fill các cell mask=0 bằng trung bình 4-hướng lân cận có mask=1 — lặp vài pass để loại nốt lỗ nhỏ */
function fillNullGaps(data: Float32Array, mask: Uint8Array, width: number, height: number, passes = 8): void {
  for (let p = 0; p < passes; p++) {
    let remaining = 0;
    const fillIdx: number[] = [];
    const fillVal: number[] = [];
    for (let row = 0; row < height; row++) {
      for (let col = 0; col < width; col++) {
        const i = row * width + col;
        if (mask[i]) continue;
        let sum = 0, count = 0;
        const neighbors = [
          [col - 1, row], [col + 1, row], [col, row - 1], [col, row + 1],
        ];
        for (const [nc, nr] of neighbors) {
          if (nc < 0 || nc >= width || nr < 0 || nr >= height) continue;
          const ni = nr * width + nc;
          if (mask[ni]) { sum += data[ni]; count++; }
        }
        if (count > 0) {
          fillIdx.push(i);
          fillVal.push(sum / count);
        } else {
          remaining++;
        }
      }
    }
    for (let k = 0; k < fillIdx.length; k++) {
      data[fillIdx[k]] = fillVal[k];
      mask[fillIdx[k]] = 1;
    }
    if (remaining === 0 && fillIdx.length === 0) break;
  }
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

  const rawMinX = Math.min(...boundaryXY.map((p) => p.x));
  const rawMaxX = Math.max(...boundaryXY.map((p) => p.x));
  const rawMinY = Math.min(...boundaryXY.map((p) => p.y));
  const rawMaxY = Math.max(...boundaryXY.map((p) => p.y));
  const rawWidthM = rawMaxX - rawMinX;
  const rawHeightM = rawMaxY - rawMinY;

  if (!(rawWidthM > 0) || !(rawHeightM > 0) || rawWidthM > 50000 || rawHeightM > 50000) {
    throw new Error('Ranh giới không hợp lệ hoặc quá lớn (>50km).');
  }

  // ── 3. Buffer bbox ra ngoài ranh giới — tạo lưới RỘNG HƠN để terrain liền mạch ──
  const bufferM = Math.max(BUFFER_MIN_M, BUFFER_RATIO * Math.max(rawWidthM, rawHeightM));
  const minX = rawMinX - bufferM, maxX = rawMaxX + bufferM;
  const minY = rawMinY - bufferM, maxY = rawMaxY + bufferM;
  const widthM = maxX - minX, heightM = maxY - minY;

  // ── 4. Xác định cellSize + kích thước lưới (trên bbox đã buffer) ──
  const cellSize = Math.max(MIN_CELL_SIZE, Math.max(widthM, heightM) / MAX_GRID_DIM);
  const width  = Math.min(MAX_GRID_DIM + 1, Math.max(MIN_GRID_DIM, Math.round(widthM / cellSize) + 1));
  const height = Math.min(MAX_GRID_DIM + 1, Math.max(MIN_GRID_DIM, Math.round(heightM / cellSize) + 1));

  // ── 5. Tạo lưới điểm lat/lon (inverse projection từng cell) ──
  opts.onProgress?.(`Đang tạo lưới ${width}×${height} điểm (đã mở rộng +${bufferM.toFixed(0)}m quanh ranh giới)…`);
  const gridPoints: { lat: number; lon: number }[] = [];
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const e = minX + col * cellSize;
      const n = minY + row * cellSize;
      const { lat, lon } = vn2000ToLatLon(e, n, projOpts);
      gridPoints.push({ lat, lon });
    }
  }

  // ── 6. Gọi OpenTopoData lấy elevation ──
  opts.onProgress?.(`Đang tải cao độ SRTM cho ${gridPoints.length} điểm…`);
  const elevations = await fetchElevations(gridPoints, (done, total) => {
    opts.onProgress?.(`Đang tải cao độ SRTM… ${done}/${total}`);
  });

  // ── 7. Build Heightmap — mask theo "có cao độ hợp lệ", KHÔNG khoét theo polygon ──
  const data = new Float32Array(width * height);
  const mask = new Uint8Array(width * height);
  let minZ = Infinity, maxZ = -Infinity;
  let validCount = 0;

  for (let i = 0; i < elevations.length; i++) {
    const elev = elevations[i];
    if (elev !== null) {
      data[i] = elev;
      mask[i] = 1;
      validCount++;
      if (elev < minZ) minZ = elev;
      if (elev > maxZ) maxZ = elev;
    }
  }

  if (validCount === 0) {
    throw new Error(
      'Không lấy được cao độ hợp lệ trong vùng ranh giới (có thể vùng ngoài phạm vi SRTM hoặc lỗi mạng).',
    );
  }
  if (!Number.isFinite(minZ)) { minZ = 0; maxZ = 0; }

  // Gap-fill các điểm null còn lại (SRTM thiếu dữ liệu cục bộ, hiếm) — không để lỗ rỗ
  fillNullGaps(data, mask, width, height);

  let heightmap: Heightmap = {
    width, height, cellSize,
    origin: { x: minX, y: minY },
    data, minZ, maxZ, mask,
  };

  // Smoothing nhẹ — SRTM 30m thô, mượt hoá để terrain mesh đỡ răng cưa
  heightmap = smoothHeightmap(heightmap, 2);

  // ── 8. Ranh giới thật → boundaryCandidate (toạ độ cùng hệ heightmap.origin/bounds) ──
  // isLikelyBoundary=false → KHÔNG tự động clip, terrain mặc định hiện liền mạch.
  // User có thể tự chọn áp clip qua dropdown "Ranh giới hiển thị" có sẵn trong Sidebar.
  const boundaryArea = shoelaceArea(boundaryXY);
  const bboxArea = rawWidthM * rawHeightM;
  const aspectRatio = Math.max(rawWidthM, rawHeightM) / Math.max(1, Math.min(rawWidthM, rawHeightM));
  const boundaryCandidate: BoundaryCandidate = {
    polygon: boundaryXY,
    layer: 'Ranh giới (Google Earth)',
    area: boundaryArea,
    aspectRatio,
    pctOfBbox: bboxArea > 0 ? (boundaryArea / bboxArea) * 100 : 0,
    closedKind: 'flag-closed',
    isLikelyBoundary: false,
  };

  // ── 9. Build mesh + TerrainData ──
  opts.onProgress?.('Đang dựng mesh 3D…');
  const mesh = buildMeshFromHeightmap(heightmap);

  const terrain: TerrainData = {
    heightmap,
    meshPositions: mesh.positions,
    meshIndices: mesh.indices,
    meshNormals: mesh.normals,
    contours: [],
    bounds: { minX, minY, maxX: minX + width * cellSize, maxY: minY + height * cellSize, minZ, maxZ },
    boundaryCandidates: [boundaryCandidate],
  };

  return terrain;
}
