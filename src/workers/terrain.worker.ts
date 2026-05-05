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
  contours: import('../lib/types').ContourPolyline[],
  bounds: import('../lib/types').ParsedDxf['bounds'],
  gridResolution: number,
): Promise<TerrainData> {
  const tin = buildTIN(contours);
  let heightmap = rasterizeTinToHeightmap(tin, bounds, gridResolution);
  heightmap = smoothHeightmap(heightmap, 2);
  const mesh = buildMeshFromHeightmap(heightmap);
  return {
    heightmap,
    meshPositions: mesh.positions,
    meshIndices: mesh.indices,
    meshNormals: mesh.normals,
    contours,
    bounds,
  };
}

const api: TerrainWorkerAPI = {
  async processDxf(text, gridResolution = 384, layerPattern) {
    const parsed = parseDxfText(text, layerPattern);
    return buildTerrain(parsed.contours, parsed.bounds, gridResolution);
  },

  async processDwg(buffer, gridResolution = 384, layerPattern) {
    const parsed = await parseDwgBuffer(buffer, layerPattern);
    return buildTerrain(parsed.contours, parsed.bounds, gridResolution);
  },
};

expose(api);
