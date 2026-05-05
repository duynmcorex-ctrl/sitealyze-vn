import { buildMeshFromHeightmap } from '../terrain/buildMesh';
import type { TerrainData, Heightmap, OverlayLayer } from '../types';

interface ProjectFile {
  version: '1';
  savedAt: string;
  heightmap: {
    width: number; height: number; cellSize: number;
    origin: { x: number; y: number };
    minZ: number; maxZ: number;
    data: string;   // base64-encoded Float32Array
    mask?: string;  // base64-encoded Uint8Array
  };
  bounds: TerrainData['bounds'];
  overlayLayers: OverlayLayer[];
}

// ── helpers ──────────────────────────────────────────────────────────────────

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = '';
  // Process in chunks to avoid stack overflow on large arrays
  const CHUNK = 8192;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

function fromBase64Float32(b64: string): Float32Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Float32Array(bytes.buffer);
}

function fromBase64Uint8(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

// ── public API ───────────────────────────────────────────────────────────────

export function saveProject(terrain: TerrainData, overlayLayers: OverlayLayer[]): void {
  const hm = terrain.heightmap;
  const proj: ProjectFile = {
    version: '1',
    savedAt: new Date().toISOString(),
    heightmap: {
      width: hm.width, height: hm.height,
      cellSize: hm.cellSize, origin: hm.origin,
      minZ: hm.minZ, maxZ: hm.maxZ,
      data: toBase64(hm.data.buffer as ArrayBuffer),
      mask: hm.mask ? toBase64(hm.mask.buffer as ArrayBuffer) : undefined,
    },
    bounds: terrain.bounds,
    overlayLayers,
  };

  const blob = new Blob([JSON.stringify(proj)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `sitealyze-${Date.now()}.siteproj.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function loadProject(jsonText: string): {
  terrain: TerrainData;
  overlayLayers: OverlayLayer[];
} {
  const proj = JSON.parse(jsonText) as ProjectFile;
  const hd = proj.heightmap;

  const hm: Heightmap = {
    width: hd.width, height: hd.height,
    cellSize: hd.cellSize, origin: hd.origin,
    minZ: hd.minZ, maxZ: hd.maxZ,
    data: fromBase64Float32(hd.data),
    mask: hd.mask ? fromBase64Uint8(hd.mask) : undefined,
  };

  const mesh = buildMeshFromHeightmap(hm);
  const terrain: TerrainData = {
    heightmap: hm,
    meshPositions: mesh.positions,
    meshIndices: mesh.indices,
    meshNormals: mesh.normals,
    contours: [],
    bounds: proj.bounds,
  };

  return { terrain, overlayLayers: proj.overlayLayers ?? [] };
}
