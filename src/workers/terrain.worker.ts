import { expose } from 'comlink';
import { parseDxfText } from '../lib/dxf/parseDxf';
import { parseDwgBuffer } from '../lib/dxf/parseDwg';
import { buildTIN } from '../lib/terrain/triangulate';
import { rasterizeTinToHeightmap, smoothHeightmap } from '../lib/terrain/heightmap';
import { buildMeshFromHeightmap } from '../lib/terrain/buildMesh';
import type { TerrainData } from '../lib/types';

export interface TerrainWorkerAPI {
  processDxf(text: string, gridResolution?: number, layerPattern?: string): Promise<TerrainData>;
  processDwg(buffer: ArrayBuffer, gridResolution?: number, layerPattern?: string): Promise<TerrainData>;
}

async function buildTerrain(
  parsed: import('../lib/types').ParsedDxf,
  gridResolution: number,
): Promise<TerrainData> {
  const { contours, bounds, rawRoads, boundaryCandidates } = parsed;
  const tin = buildTIN(contours);
  // Rasterize KHÔNG truyền boundary — user sẽ pick manual qua UI dropdown
  // (applyBoundaryClip gọi sau ở client side khi user chọn)
  let heightmap = rasterizeTinToHeightmap(tin, bounds, gridResolution);
  heightmap = smoothHeightmap(heightmap, 6);
  const mesh = buildMeshFromHeightmap(heightmap);
  return {
    heightmap,
    meshPositions: mesh.positions,
    meshIndices: mesh.indices,
    meshNormals: mesh.normals,
    contours,
    bounds,
    rawRoadPolylines: rawRoads,
    boundaryCandidates,
  };
}

const api: TerrainWorkerAPI = {
  async processDxf(text, gridResolution = 384, layerPattern) {
    const parsed = parseDxfText(text, layerPattern);
    return buildTerrain(parsed, gridResolution);
  },

  async processDwg(buffer, gridResolution = 384, layerPattern) {
    const parsed = await parseDwgBuffer(buffer, layerPattern);
    return buildTerrain(parsed, gridResolution);
  },
};

expose(api);
