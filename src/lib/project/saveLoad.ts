/**
 * saveLoad.ts
 * Save/load project ra file `.siteproj.json`.
 *
 * Format version 2 (v0.7.0):
 *  - Filename: `YYYY-MM-DD-<tên dự án>.siteproj.json`
 *  - Lưu metadata (name, population, designBrief, scale, tags, ...) + scenes
 *  - Backward compatible: load file v1 → migrate sang v2 trong memory
 *
 * Format version 1 (v0.5–0.6): chỉ heightmap + overlayLayers.
 */

import { buildMeshFromHeightmap } from '../terrain/buildMesh';
import type { TerrainData, Heightmap, OverlayLayer, EnvParams } from '../types';
import type { SavedScene, StoredProject } from '../../store/useSiteStore';

// ── helpers ──────────────────────────────────────────────────────────────────

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = '';
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

/** Format ngày YYYY-MM-DD */
function ymdToday(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Loại bỏ ký tự không hợp lệ trong filename */
function sanitizeFilename(s: string): string {
  return s.replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, '_').slice(0, 80);
}

// ── Serializable shapes ─────────────────────────────────────────────────────

/** Heightmap serialize (giữ nguyên v1) */
interface SerializedHeightmap {
  width: number; height: number; cellSize: number;
  origin: { x: number; y: number };
  minZ: number; maxZ: number;
  data: string;   // base64 Float32Array
  mask?: string;  // base64 Uint8Array
}

/** Terrain serialize cho từng project */
interface SerializedProjectData {
  heightmap: SerializedHeightmap | null;
  bounds: TerrainData['bounds'] | null;
  overlayLayers: OverlayLayer[];
  /** Metadata (StoredProject fields trừ terrain/overlayLayers) */
  meta: Omit<StoredProject, 'terrain' | 'overlayLayers'>;
}

/** File v2 — multi-project + scenes + metadata */
interface ProjectFileV2 {
  version: 2;
  savedAt: string;
  activeProjectId: string | null;
  /** Toàn bộ projects (kèm metadata + heightmap nếu có) */
  projects: SerializedProjectData[];
  /** Scene của active project — duplicate với projects[active].meta.scenes để load nhanh */
  scenes: SavedScene[];
  /** Env params hiện tại */
  env: EnvParams;
}

/** File v1 (legacy) */
interface ProjectFileV1 {
  version: '1';
  savedAt: string;
  heightmap: SerializedHeightmap;
  bounds: TerrainData['bounds'];
  overlayLayers: OverlayLayer[];
}

// ── Public API ───────────────────────────────────────────────────────────────

export interface SaveProjectInput {
  activeProjectName: string;            // dùng cho tên file
  activeProjectId: string | null;
  projects: StoredProject[];            // tất cả projects
  /** Snapshot của state hiện tại — sẽ override vào active project */
  currentTerrain: TerrainData | null;
  currentOverlayLayers: OverlayLayer[];
  currentEnv: EnvParams;
  currentScenes: SavedScene[];
}

export function saveProject(input: SaveProjectInput): void {
  // Đảm bảo active project có state mới nhất
  const projectsForFile = input.projects.map(p => {
    const isActive = p.id === input.activeProjectId;
    const t = isActive ? input.currentTerrain : p.terrain;
    const ol = isActive ? input.currentOverlayLayers : p.overlayLayers;
    const sc = isActive ? input.currentScenes : (p.scenes ?? []);

    const { terrain: _t, overlayLayers: _ol, ...metaRest } = p;
    void _t; void _ol;
    return {
      heightmap: t ? serializeHeightmap(t.heightmap) : null,
      bounds: t ? t.bounds : null,
      overlayLayers: ol,
      meta: { ...metaRest, scenes: sc },
    } as SerializedProjectData;
  });

  const proj: ProjectFileV2 = {
    version: 2,
    savedAt: new Date().toISOString(),
    activeProjectId: input.activeProjectId,
    projects: projectsForFile,
    scenes: input.currentScenes,
    env: input.currentEnv,
  };

  const blob = new Blob([JSON.stringify(proj)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${ymdToday()}-${sanitizeFilename(input.activeProjectName || 'SiteAlyze')}.siteproj.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function serializeHeightmap(hm: Heightmap): SerializedHeightmap {
  return {
    width: hm.width, height: hm.height,
    cellSize: hm.cellSize, origin: hm.origin,
    minZ: hm.minZ, maxZ: hm.maxZ,
    data: toBase64(hm.data.buffer as ArrayBuffer),
    mask: hm.mask ? toBase64(hm.mask.buffer as ArrayBuffer) : undefined,
  };
}

function deserializeHeightmap(hd: SerializedHeightmap): Heightmap {
  return {
    width: hd.width, height: hd.height,
    cellSize: hd.cellSize, origin: hd.origin,
    minZ: hd.minZ, maxZ: hd.maxZ,
    data: fromBase64Float32(hd.data),
    mask: hd.mask ? fromBase64Uint8(hd.mask) : undefined,
  };
}

function buildTerrainFromHM(hm: Heightmap, bounds: TerrainData['bounds']): TerrainData {
  const mesh = buildMeshFromHeightmap(hm);
  return {
    heightmap: hm,
    meshPositions: mesh.positions,
    meshIndices: mesh.indices,
    meshNormals: mesh.normals,
    contours: [],
    bounds,
  };
}

export interface LoadProjectResult {
  /** Hiện trạng load — set vào store sau */
  activeProjectId: string | null;
  projects: StoredProject[];
  /** Active project state đã expand */
  terrain: TerrainData | null;
  overlayLayers: OverlayLayer[];
  scenes: SavedScene[];
  env: EnvParams | null;
}

export function loadProject(jsonText: string): LoadProjectResult {
  const parsed = JSON.parse(jsonText) as ProjectFileV1 | ProjectFileV2 | Record<string, unknown>;

  // ── Detect version robustly ──
  // v2: version === 2 (number) + projects array
  // v1: version === '1' (string) | version === 1 (number, some old builds) + heightmap at root
  // legacy: no version field at all but heightmap at root
  const ver = (parsed as Record<string, unknown>).version;
  const hasRootHeightmap = !!(parsed as Record<string, unknown>).heightmap;
  const isV1 = ver === '1' || ver === 1 || (!ver && hasRootHeightmap);

  // ── v1 / legacy → migrate ──
  if (isV1) {
    const v1 = parsed as Partial<ProjectFileV1>;

    // Null-safe: heightmap required, bounds có thể thiếu → dùng giá trị mặc định
    if (!v1.heightmap) {
      throw new Error('File thiếu dữ liệu heightmap. Có thể file bị lỗi hoặc sai định dạng.');
    }

    const hm = deserializeHeightmap(v1.heightmap);

    // Nếu thiếu bounds → tạo bounds từ heightmap origin + size + minZ/maxZ
    const bounds = v1.bounds ?? {
      minX: hm.origin.x,
      maxX: hm.origin.x + hm.width * hm.cellSize,
      minY: hm.origin.y,
      maxY: hm.origin.y + hm.height * hm.cellSize,
      minZ: hm.minZ,
      maxZ: hm.maxZ,
    };

    const terrain = buildTerrainFromHM(hm, bounds);
    const projectId = `proj-${Date.now()}`;
    const project: StoredProject = {
      id: projectId,
      name: 'Dự án đã import',
      visible: true,
      terrain,
      overlayLayers: v1.overlayLayers ?? [],
      geo: null,
      env: {} as EnvParams,
      viewpoint: null,
      scenes: [],
    };
    return {
      activeProjectId: projectId,
      projects: [project],
      terrain,
      overlayLayers: v1.overlayLayers ?? [],
      scenes: [],
      env: null,
    };
  }

  // ── v2 ──
  const v2 = parsed as ProjectFileV2;
  let activeTerrain: TerrainData | null = null;
  let activeOverlayLayers: OverlayLayer[] = [];
  let activeScenes: SavedScene[] = [];

  const projects: StoredProject[] = v2.projects.map(pd => {
    const terrain = pd.heightmap && pd.bounds
      ? buildTerrainFromHM(deserializeHeightmap(pd.heightmap), pd.bounds)
      : null;
    const proj: StoredProject = {
      ...pd.meta,
      terrain,
      overlayLayers: pd.overlayLayers ?? [],
    };
    if (proj.id === v2.activeProjectId) {
      activeTerrain = terrain;
      activeOverlayLayers = pd.overlayLayers ?? [];
      activeScenes = pd.meta.scenes ?? [];
    }
    return proj;
  });

  return {
    activeProjectId: v2.activeProjectId,
    projects,
    terrain: activeTerrain,
    overlayLayers: activeOverlayLayers,
    scenes: activeScenes.length > 0 ? activeScenes : (v2.scenes ?? []),
    env: v2.env ?? null,
  };
}
