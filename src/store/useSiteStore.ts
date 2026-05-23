import { create } from 'zustand';
import type { AnalysisMode, EnvParams, TerrainData, OverlayLayer, Report, LanduseData, MCAData } from '../lib/types';
import type { SlopeData, SlopeClassMode } from '../lib/analysis/slope';
import type { HydrologyData } from '../lib/analysis/hydrology';
import type { TerrainFeatures } from '../lib/analysis/features';
import type { SuitabilityData } from '../lib/analysis/suitability';
import type { ContourLineSegment } from '../lib/analysis/contours';
import { computeSlope } from '../lib/analysis/slope';
import { computeHydrology } from '../lib/analysis/hydrology';
import { detectFeatures } from '../lib/analysis/features';
import { computeSuitability } from '../lib/analysis/suitability';
import { computeMCA, DEFAULT_MCA_WEIGHTS } from '../lib/analysis/mca';
import { computeContourLines } from '../lib/analysis/contours';
import { computeViewshed } from '../lib/analysis/viewshed';
import { buildReport } from '../lib/report/generateReport';
import { detectVN2000Zone } from '../lib/coord/vn2000';
import { findProvince, makeGeoFromProvinceName } from '../lib/coord/provinces';
import type { GeoInfo } from '../lib/coord/provinces';
import { getWindClimate } from '../lib/analysis/climatology';
import { applyBoundaryClip, restoreOriginalMask } from '../lib/terrain/heightmap';
import { buildMeshFromHeightmap } from '../lib/terrain/buildMesh';

/** Loại dự án quy hoạch VN */
export type ProjectType =
  | 'kdc'          // Khu dân cư
  | 'kdt'          // Khu đô thị mới
  | 'kcn'          // Khu công nghiệp
  | 'du_lich'      // Du lịch / nghỉ dưỡng
  | 'golf'         // Sân golf
  | 'nong_lam'     // Nông - lâm nghiệp
  | 'hanh_chinh'   // Hành chính - trung tâm
  | 'khac';        // Khác

/** Tỉ lệ quy hoạch theo QCVN */
export type PlanningScale = '1/5000' | '1/2000' | '1/500';

/** Scene đã lưu — snapshot góc camera, dùng cho trình chiếu + xuất ảnh */
export interface SavedScene {
  id: string;
  name: string;
  position: [number, number, number];   // camera world position
  target:   [number, number, number];   // OrbitControls target (point camera đang nhìn)
  fov:      number;
  thumbnail?: string;                   // dataURL 80×60 (capture canvas)
  createdAt: number;
}

/** Snapshot của một dự án — lưu để switch qua lại */
export interface StoredProject {
  id: string;
  name: string;
  visible: boolean;          // có render trong scene không
  terrain: TerrainData | null;
  overlayLayers: OverlayLayer[];
  geo: GeoInfo | null;
  env: EnvParams;
  viewpoint: { x: number; z: number; height: number } | null;
  /** Thông tin dự án bổ sung (điền trong ProjectInfoPanel) */
  projectType?: ProjectType;
  description?: string;
  /** Diện tích thủ công (ha) — nếu chưa có terrain hoặc muốn ghi đè */
  manualAreaHa?: number;
  /** Chủ đầu tư / đơn vị tư vấn */
  investor?: string;

  // ── Mục 1. Thông tin chung — fields MỚI (v0.7.0) ─────────────────────────
  /** Dân số dự kiến (người) */
  population?: number;
  /** Nhiệm vụ thiết kế — textarea dài */
  designBrief?: string;
  /** Tỉ lệ quy hoạch */
  scale?: PlanningScale;
  /** Tags loại hình (đa giá trị, có thể custom) — vd: ['Đô thị', 'Du lịch'] */
  tags?: string[];

  // ── Scene save (camera bookmarks) ────────────────────────────────────────
  scenes?: SavedScene[];
}

interface AnalysisCache {
  slope?: SlopeData;
  hydro?: HydrologyData;
  features?: TerrainFeatures;
  suitability?: SuitabilityData;
  contours?: ContourLineSegment[];
  contourInterval?: number;
  arrowDensity?: number;
  viewshed?: Uint8Array;
  viewshedAt?: { x: number; z: number };
}

interface State {
  terrain: TerrainData | null;
  loading: boolean;
  error: string | null;
  mode: AnalysisMode;
  env: EnvParams;
  viewpoint: { x: number; z: number; height: number } | null;
  analysis: AnalysisCache;
  hideOverlay: boolean;
  layerPattern: string;
  /** Azimuth của camera trong OrbitControls (rad) — cập nhật realtime từ Canvas3D */
  cameraAzimuth: number;
  setCameraAzimuth: (rad: number) => void;
  /** Điểm vừa được click trên TerrainMesh — hiển thị marker + cao độ */
  clickedPoint: { x: number; y: number; z: number } | null;
  setClickedPoint: (p: { x: number; y: number; z: number } | null) => void;
  /** Số đường đồng mức đang hiển thị / tổng số (để TerrainTab hiện "Đang giữ N/M") */
  contourCount: { kept: number; total: number };
  setContourCount: (c: { kept: number; total: number }) => void;
  /** Hiện/ẩn đường sống núi nối các đỉnh (MST) trong mode features */
  showRidgeLines: boolean;
  toggleRidgeLines: () => void;
  /** Hiện khối 3D công trình (Mục 3 — extrude từ Excel SDD) */
  showMassing3D: boolean;
  toggleMassing3D: () => void;
  /** Chiều cao mỗi tầng (m) — mặc định 3.5m theo chuẩn QH VN */
  floorHeight: number;
  setFloorHeight: (h: number) => void;
  showContourOverlay: boolean;
  showGrid: boolean;
  slopeMode: SlopeClassMode;
  overlayLayers: OverlayLayer[];
  showReportPanel: boolean;
  report: Report | null;
  reportLoading: boolean;
  showAllPeakElevations: boolean;
  cameraPreset: string | null;
  /** Thông tin địa lý phát hiện từ toạ độ VN2000 của file DXF */
  geo: GeoInfo | null;

  showRoads: boolean;
  toggleRoads: () => void;
  /** Override tỉnh thủ công (khi auto-detect VN2000 fail) */
  setGeoOverride: (provinceName: string | null) => void;

  /** Hiện/ẩn panel bản đồ 2D (ESRI + OSM) */
  showBasemap: boolean;
  toggleBasemap: () => void;

  /** Giao diện: 'dark' (mặc định) hoặc 'light' */
  theme: 'dark' | 'light';
  toggleTheme: () => void;

  // ── Multi-project ──────────────────────────────────────────────────────
  projects: StoredProject[];
  activeProjectId: string | null;
  createProject: (name?: string) => void;
  switchProject: (id: string) => void;
  removeProject: (id: string) => void;
  renameProject: (id: string, name: string) => void;
  toggleProjectVisible: (id: string) => void;
  /** Cập nhật thông tin thêm cho active project (type, description, investor, manualAreaHa) */
  updateProjectMeta: (patch: Partial<Pick<StoredProject, 'projectType' | 'description' | 'investor' | 'manualAreaHa'>>) => void;
  // ──────────────────────────────────────────────────────────────────────

  setTerrain: (t: TerrainData | null) => void;
  setMode: (m: AnalysisMode) => void;
  setEnv: (patch: Partial<EnvParams>) => void;
  setLoading: (v: boolean) => void;
  setError: (e: string | null) => void;
  setViewpoint: (vp: State['viewpoint']) => void;
  toggleHideOverlay: () => void;
  toggleGrid: () => void;
  setSlopeMode: (m: SlopeClassMode) => void;
  setLayerPattern: (p: string) => void;
  computeForMode: (m: AnalysisMode) => void;
  // contour overlay
  toggleContourOverlay: () => void;
  ensureContoursComputed: () => void;
  // overlay layers
  addOverlayLayer: (layer: OverlayLayer) => void;
  removeOverlayLayer: (id: string) => void;
  toggleOverlayLayerVisible: (id: string) => void;
  updateOverlayLayerColor: (id: string, color: string) => void;
  renameOverlayLayer: (id: string, name: string) => void;
  setOverlayLayers: (layers: OverlayLayer[]) => void;
  /** Thủ công đánh dấu/bỏ đánh dấu layer là tree — sinh treePoints từ polylines/circles */
  toggleOverlayLayerIsTree: (id: string) => void;
  toggleReportPanel: () => void;
  /** Build report. Mặc định cũng mở panel; truyền `false` để chỉ build (cho Legend inline) */
  generateReport: (openPanel?: boolean) => void;
  toggleAllPeakElevations: () => void;
  setCameraPreset: (v: string | null) => void;

  // ── Land use planning (parse từ bản vẽ QH chi tiết) ─────────────────────
  landuse: LanduseData | null;
  setLanduse: (l: LanduseData | null) => void;

  // ── Flood simulation 3D ───────────────────────────────────────────────────
  showFlood3D: boolean;
  waterLevel3D: number;
  toggleFlood3D: () => void;
  setWaterLevel3D: (v: number) => void;

  // ── Scene save (camera bookmarks) — Mục 0. Quản lý dự án ─────────────────
  /** Scene list của active project (mirror với projects[active].scenes) */
  scenes: SavedScene[];
  /** Yêu cầu camera tween đến scene này — Canvas3D nhận và animate */
  pendingSceneLoad: SavedScene | null;
  /** Đếm số lần user click "Lưu scene hiện tại" — SceneCapturer trong Canvas xử lý */
  saveSceneTrigger: number;
  /** Tên scene chuẩn bị lưu */
  pendingSceneName: string | null;
  addScene: (s: SavedScene) => void;
  removeScene: (id: string) => void;
  renameScene: (id: string, name: string) => void;
  /** Trigger tween đến scene */
  requestLoadScene: (id: string) => void;
  /** Clear pendingSceneLoad sau khi đã xử lý */
  clearPendingScene: () => void;
  /** UI gọi → SceneCapturer trong Canvas sẽ capture camera + thumbnail và addScene */
  requestSaveScene: (name?: string) => void;
  /** SceneCapturer clear sau khi capture xong */
  clearSaveSceneTrigger: () => void;

  // ── Cách render terrain mesh — Mục 2 tab Cao độ ───────────────────────────
  /** 'filled' = mesh có vertex color (mặc định); 'wireframe' = chỉ đường lưới */
  terrainRenderMode: 'filled' | 'wireframe';
  setTerrainRenderMode: (m: 'filled' | 'wireframe') => void;
  /** Bảng màu elevation: 'natural' = 10-bước đất tự nhiên; 'rainbow' = gradient HSL liên tục kiểu topo */
  elevColorMode: 'natural' | 'rainbow';
  setElevColorMode: (m: 'natural' | 'rainbow') => void;

  // ── Boundary picker (Mục 2 tab Cao độ) ────────────────────────────────────
  /** Index trong terrain.boundaryCandidates đang được chọn; null = không clip */
  selectedBoundaryIdx: number | null;
  /** Set boundary; null = bỏ clip (terrain quay về full coverage) */
  setSelectedBoundaryIdx: (i: number | null) => void;

  // ── Per-type massing override (Mục 3 PlanningSection) ─────────────────────
  /** Override MĐXD/Tầng cho từng LanduseType — áp cho TẤT CẢ parcel cùng type
   *  nếu parcel đó CHƯA có indicator riêng từ DXF/Excel.
   *  Indicator parcel-level WIN; type-level chỉ fallback. */
  typeOverrides: Partial<Record<import('../lib/types').LanduseType, { maxDensity?: number; maxFloors?: number }>>;
  setTypeOverride: (type: import('../lib/types').LanduseType, patch: { maxDensity?: number; maxFloors?: number }) => void;
  clearTypeOverride: (type: import('../lib/types').LanduseType) => void;

  // ── MCA — Quỹ đất XD V2 (GIS-MCA 9 tiêu chí) ──────────────────────────────
  /** Kết quả compute MCA (Grid 20×20m, 9 tiêu chí, 3 lớp Y) */
  mca: MCAData | null;
  setMca: (d: MCAData | null) => void;
  /** Trọng số 9 tiêu chí — user có thể chỉnh, default theo Bảng 15 PDF */
  mcaWeights: typeof DEFAULT_MCA_WEIGHTS;
  setMcaWeight: (key: keyof typeof DEFAULT_MCA_WEIGHTS, value: number) => void;
  resetMcaWeights: () => void;
  /** X6 (phù hợp QH cấp trên) — user input, default 8 */
  mcaX6Default: number;
  setMcaX6Default: (v: number) => void;
  /** Áp hard constraints (X3<4, X2<5 → Y=0) */
  mcaHardConstraints: boolean;
  toggleMcaHardConstraints: () => void;

  // ── Suitability cải tiến — flood-aware penalty ────────────────────────────
  /** Có áp dụng phạt vùng ngập cho mode 'suitability' (V1) không. Default true. */
  applyFloodPenalty: boolean;
  setApplyFloodPenalty: (v: boolean) => void;

  // ── Custom wind data (override climatology) ──────────────────────────────
  /** Hoa gió tùy chỉnh 12 tháng — nếu user override.
   *  Mỗi item: [direction_deg, speed_ms]. null nếu chưa override (dùng climatology). */
  customWindData: ([number, number] | null)[]; // length 12
  setCustomWindMonth: (month: number, dir: number, spd: number) => void;
  clearCustomWindMonth: (month: number) => void;
  resetCustomWind: () => void;
  /** Data URL của ảnh hoa gió tham chiếu user upload (PNG/JPG) */
  windRoseRefImage: string | null;
  setWindRoseRefImage: (dataUrl: string | null) => void;

  // ── Update meta fields mới (mục 1) ────────────────────────────────────────
  /** Cập nhật fields mới của active project: population, designBrief, scale, tags */
  updateProjectInfo: (patch: Partial<Pick<StoredProject,
    'name' | 'population' | 'designBrief' | 'scale' | 'tags' | 'description' | 'investor' | 'manualAreaHa' | 'projectType'
  >>) => void;
}

/**
 * Sinh envPatch từ GeoInfo + tháng: cập nhật lat, windDirection, windSpeed.
 * Gọi khi geo thay đổi (detect/override) hoặc khi tháng thay đổi + geo đã có.
 */
function buildClimateEnvPatch(geo: GeoInfo, month: number): Partial<EnvParams> {
  const wind = getWindClimate(geo.climateZone, month);
  return {
    latitude:      Math.round(geo.lat * 10) / 10,
    windDirection: wind.dominantDirDeg,
    windSpeed:     Math.round(wind.avgSpeedMs * 10) / 10,
  };
}

const DEFAULT_ENV: EnvParams = {
  month: 3,
  hour: 12,
  northRotation: 0,
  windDirection: 45,
  windSpeed: 1,
  latitude: 21,
  contourInterval: 5,
  flowArrowDensity: 1,
  contourColorMode: 'elevation',
  contourSingleColor: '#ffffff',
  contourOpacity: 0.9,
  useOriginalContours: true, // mặc định: trung thực với CAD gốc
  treeHeight: 8,             // chiều cao cây mặc định 8m
  showTrees: true,
  baseMSL: 0,                // không dịch chuyển cao độ theo mặc định
  windVisualization: 'v1',   // mặc định dùng V1 (backward compat)
};

export const useSiteStore = create<State>((set, get) => ({
  terrain: null,
  loading: false,
  error: null,
  mode: 'elevation',
  env: DEFAULT_ENV,
  viewpoint: null,
  analysis: {},
  hideOverlay: false,
  layerPattern: '',
  showContourOverlay: false,
  showGrid: true,
  slopeMode: 'degree',
  overlayLayers: [],
  showReportPanel: false,
  report: null,
  reportLoading: false,
  showAllPeakElevations: false,
  cameraPreset: null,
  geo: null,
  showRoads: true,
  showBasemap: false,
  theme: 'dark',
  projects: [],
  activeProjectId: null,
  landuse: null,
  setLanduse: (l) => set({ landuse: l }),

  // ── Flood simulation 3D ───────────────────────────────────────────────────
  showFlood3D: false,
  waterLevel3D: 0,
  toggleFlood3D: () => set(s => ({ showFlood3D: !s.showFlood3D })),
  setWaterLevel3D: (v) => set({ waterLevel3D: v }),

  // ── Scene save (camera bookmarks) ────────────────────────────────────────
  scenes: [],
  pendingSceneLoad: null,
  saveSceneTrigger: 0,
  pendingSceneName: null,
  requestSaveScene: (name) => set(state => ({
    saveSceneTrigger: state.saveSceneTrigger + 1,
    pendingSceneName: name ?? `Scene ${state.scenes.length + 1}`,
  })),
  clearSaveSceneTrigger: () => set({ pendingSceneName: null }),
  addScene: (s) => set(state => {
    const scenes = [...state.scenes, s];
    // Đồng bộ vào active project
    const projects = state.projects.map(p =>
      p.id === state.activeProjectId ? { ...p, scenes } : p,
    );
    return { scenes, projects };
  }),
  removeScene: (id) => set(state => {
    const scenes = state.scenes.filter(s => s.id !== id);
    const projects = state.projects.map(p =>
      p.id === state.activeProjectId ? { ...p, scenes } : p,
    );
    return { scenes, projects };
  }),
  renameScene: (id, name) => set(state => {
    const scenes = state.scenes.map(s => s.id === id ? { ...s, name } : s);
    const projects = state.projects.map(p =>
      p.id === state.activeProjectId ? { ...p, scenes } : p,
    );
    return { scenes, projects };
  }),
  requestLoadScene: (id) => {
    const sc = get().scenes.find(s => s.id === id);
    if (sc) set({ pendingSceneLoad: sc });
  },
  clearPendingScene: () => set({ pendingSceneLoad: null }),

  // ── Terrain render mode ──────────────────────────────────────────────────
  terrainRenderMode: 'filled',
  setTerrainRenderMode: (m) => set({ terrainRenderMode: m }),
  elevColorMode: 'natural',
  setElevColorMode: (m) => set({ elevColorMode: m }),

  // ── Boundary picker ──────────────────────────────────────────────────────
  selectedBoundaryIdx: null,
  setSelectedBoundaryIdx: (i) => {
    set({ selectedBoundaryIdx: i });
    const t = get().terrain;
    if (!t) return;

    // i === null → restore original mask (no clip)
    if (i === null) {
      const restoredHm = restoreOriginalMask(t.heightmap);
      const mesh = buildMeshFromHeightmap(restoredHm);
      set({
        terrain: {
          ...t,
          heightmap: restoredHm,
          meshPositions: mesh.positions,
          meshIndices: mesh.indices,
          meshNormals: mesh.normals,
        },
        // Invalidate analyses bị phụ thuộc heightmap
        analysis: {},
        mca: null,
      });
      console.log('[setSelectedBoundaryIdx] Restored original mask (no clip)');
      const mode = get().mode;
      if (mode) get().computeForMode(mode);
      return;
    }

    // i >= 0 → clip theo candidate đó
    const cands = t.boundaryCandidates;
    if (!cands || i < 0 || i >= cands.length) {
      console.warn(`[setSelectedBoundaryIdx] Invalid index ${i}, candidates=${cands?.length ?? 0}`);
      return;
    }
    const boundary = cands[i].polygon;
    const clippedHm = applyBoundaryClip(t.heightmap, t.bounds, boundary);
    const mesh = buildMeshFromHeightmap(clippedHm);
    set({
      terrain: {
        ...t,
        heightmap: clippedHm,
        meshPositions: mesh.positions,
        meshIndices: mesh.indices,
        meshNormals: mesh.normals,
      },
      // Invalidate analyses bị phụ thuộc heightmap
      analysis: {},
      mca: null,
    });
    console.log(`[setSelectedBoundaryIdx] Applied boundary #${i} ("${cands[i].layer}")`);
    // Re-compute analyses for new mode (vì min/max thay đổi)
    const mode = get().mode;
    if (mode) get().computeForMode(mode);
  },

  // ── Per-type massing override ───────────────────────────────────────────
  typeOverrides: {},
  setTypeOverride: (type, patch) => set((s) => ({
    typeOverrides: {
      ...s.typeOverrides,
      [type]: { ...s.typeOverrides[type], ...patch },
    },
  })),
  clearTypeOverride: (type) => set((s) => {
    const next = { ...s.typeOverrides };
    delete next[type];
    return { typeOverrides: next };
  }),

  // ── MCA — Quỹ đất XD V2 ──────────────────────────────────────────────────
  mca: null,
  setMca: (d) => set({ mca: d }),
  mcaWeights: { ...DEFAULT_MCA_WEIGHTS },
  setMcaWeight: (key, value) => {
    set((s) => ({
      mcaWeights: { ...s.mcaWeights, [key]: Math.max(0, Math.min(1, value)) },
      mca: null, // invalidate, sẽ recompute khi user xem mode
    }));
    // Trigger recompute nếu đang ở mode mca
    if (get().mode === 'mca') get().computeForMode('mca');
  },
  resetMcaWeights: () => {
    set({ mcaWeights: { ...DEFAULT_MCA_WEIGHTS }, mca: null });
    if (get().mode === 'mca') get().computeForMode('mca');
  },
  mcaX6Default: 8,
  setMcaX6Default: (v) => {
    set({ mcaX6Default: Math.max(1, Math.min(10, v)), mca: null });
    if (get().mode === 'mca') get().computeForMode('mca');
  },
  mcaHardConstraints: true,
  toggleMcaHardConstraints: () => {
    set((s) => ({ mcaHardConstraints: !s.mcaHardConstraints, mca: null }));
    if (get().mode === 'mca') get().computeForMode('mca');
  },

  // ── Flood penalty cho suitability cũ ─────────────────────────────────────
  applyFloodPenalty: true,
  setApplyFloodPenalty: (v) => {
    set((s) => ({
      applyFloodPenalty: v,
      analysis: { ...s.analysis, suitability: undefined },
    }));
    if (get().mode === 'suitability') get().computeForMode('suitability');
  },

  // ── Custom wind data ────────────────────────────────────────────────────
  customWindData: Array(12).fill(null),
  setCustomWindMonth: (month, dir, spd) => set((s) => {
    const next = [...s.customWindData];
    const idx = Math.max(0, Math.min(11, month - 1));
    next[idx] = [Math.max(0, Math.min(359, Math.round(dir))), Math.max(0, Math.min(50, spd))];
    return { customWindData: next };
  }),
  clearCustomWindMonth: (month) => set((s) => {
    const next = [...s.customWindData];
    const idx = Math.max(0, Math.min(11, month - 1));
    next[idx] = null;
    return { customWindData: next };
  }),
  resetCustomWind: () => set({ customWindData: Array(12).fill(null) }),
  windRoseRefImage: null,
  setWindRoseRefImage: (dataUrl) => set({ windRoseRefImage: dataUrl }),

  // ── Mục 1 - update info fields ───────────────────────────────────────────
  updateProjectInfo: (patch) => set(state => {
    const projects = state.projects.map(p =>
      p.id === state.activeProjectId ? { ...p, ...patch } : p,
    );
    return { projects };
  }),

  // ── Helper nội bộ: lưu state hiện tại vào project đang active ──────────
  // (gọi trước khi switch, không expose ra ngoài)

  setTerrain: (t) => {
    if (!t) {
      set({ terrain: null, analysis: {}, viewpoint: null, error: null, geo: null });
      return;
    }
    // Tự động phát hiện tỉnh + vùng khí hậu từ toạ độ VN2000 trung tâm
    let geo: GeoInfo | null = null;
    try {
      const cx = (t.bounds.minX + t.bounds.maxX) / 2;
      const cy = (t.bounds.minY + t.bounds.maxY) / 2;
      // Hint: cao độ trung bình từ file — Z > 500m gợi ý vùng cao (Tây Nguyên/núi)
      const zMid = (t.bounds.minZ + t.bounds.maxZ) / 2;
      console.log('[VN2000] bounds center:', cx.toFixed(2), cy.toFixed(2), 'Z mid:', zMid.toFixed(1));
      const zone = detectVN2000Zone(cx, cy, { elevationHint: zMid });
      console.log('[VN2000] detected zone:', zone);
      if (zone) {
        geo = findProvince(zone.lat, zone.lon);
        console.log(
          '[Province]',
          zone.lat.toFixed(3) + '°N,',
          zone.lon.toFixed(3) + '°E',
          '→',
          geo?.province ?? 'KHÔNG TÌM THẤY (provinces.ts không cover vùng này)',
        );
      }
    } catch (e) {
      console.error('[Geo] detection error:', e);
    }

    // Tự động cập nhật lat + gió khí hậu theo tỉnh & tháng hiện tại
    const currentMonth = get().env.month;
    const envPatch: Partial<EnvParams> = geo
      ? buildClimateEnvPatch(geo, currentMonth)
      : {};

    set((s) => {
      const newEnv = { ...s.env, ...envPatch };

      // Đảm bảo có active project để chứa terrain này
      let projects = s.projects;
      let activeProjectId = s.activeProjectId;

      const activeExists = activeProjectId && projects.some(p => p.id === activeProjectId);
      if (!activeExists) {
        // Chưa có project → tạo "Dự án 1"
        const newId = `proj-${Date.now()}`;
        const newProject: StoredProject = {
          id: newId,
          name: `Dự án ${projects.length + 1}`,
          visible: true,
          terrain: t,
          overlayLayers: [],
          geo,
          env: newEnv,
          viewpoint: null,
        };
        return {
          terrain: t, analysis: {}, viewpoint: null, error: null, geo,
          env: newEnv,
          projects: [...projects, newProject],
          activeProjectId: newId,
          overlayLayers: [],
        };
      }

      // Cập nhật terrain trong active project
      projects = projects.map(p =>
        p.id === activeProjectId
          ? { ...p, terrain: t, geo, env: newEnv, overlayLayers: [], viewpoint: null }
          : p
      );

      return {
        terrain: t, analysis: {}, viewpoint: null, error: null, geo,
        env: newEnv,
        projects,
        overlayLayers: [],
        // Reset boundary picker → user phải pick lại (hoặc auto-pick bên dưới)
        selectedBoundaryIdx: null,
      };
    });

    // Auto-pick boundary likely (sau setState) — chạy bất đồng bộ
    // để UI cập nhật trước, rồi clip → tránh flash
    queueMicrotask(() => {
      const cands = t.boundaryCandidates;
      if (!cands || cands.length === 0) return;
      const likelyIdx = cands.findIndex(c => c.isLikelyBoundary);
      if (likelyIdx >= 0) {
        console.log(
          `[setTerrain] Auto-pick likely boundary #${likelyIdx} ` +
          `("${cands[likelyIdx].layer}", ${cands[likelyIdx].area.toFixed(0)} m²)`
        );
        get().setSelectedBoundaryIdx(likelyIdx);
      }
    });
  },
  setLayerPattern: (p) => set({ layerPattern: p }),
  setMode: (m) => {
    set({ mode: m });
    get().computeForMode(m);
    // Auto-build report (silent) để Legend hiện nhận xét inline cho mode đang chọn.
    // Không tự mở panel — user phải nhấn "Báo cáo" để mở full.
    if (get().terrain) {
      try { get().generateReport(false); } catch { /* ignore */ }
    }
  },
  setEnv: (patch) => {
    // Khi tháng thay đổi + đã có geo → tự động cập nhật hướng/tốc độ gió theo mùa
    // (chỉ override nếu user KHÔNG đồng thời thay đổi windDirection/windSpeed thủ công)
    const s = get();
    let effectivePatch = patch;
    if (patch.month !== undefined && patch.windDirection === undefined && patch.windSpeed === undefined && s.geo) {
      const climatePatch = buildClimateEnvPatch(s.geo, patch.month);
      effectivePatch = { ...patch, windDirection: climatePatch.windDirection, windSpeed: climatePatch.windSpeed };
    }
    set({ env: { ...s.env, ...effectivePatch } });
    const m = get().mode;
    if (m === 'contour' || m === 'hydrology' || m === 'suitability') {
      const a = get().analysis;
      const newAnalysis = { ...a };
      if (m === 'contour') delete newAnalysis.contours;
      if (m === 'hydrology') delete newAnalysis.hydro;
      set({ analysis: newAnalysis });
      get().computeForMode(m);
    }
    // Recompute contour overlay khi thay đổi interval
    if (get().showContourOverlay) {
      const a = { ...get().analysis };
      delete a.contours;
      set({ analysis: a });
      get().ensureContoursComputed();
    }
  },
  setLoading: (v) => set({ loading: v }),
  setError: (e) => set({ error: e }),
  setViewpoint: (vp) => {
    set({ viewpoint: vp });
    if (get().mode === 'viewshed' && vp && get().terrain) {
      const vis = computeViewshed(get().terrain!.heightmap, vp);
      set({ analysis: { ...get().analysis, viewshed: vis, viewshedAt: { x: vp.x, z: vp.z } } });
    }
  },
  cameraAzimuth: 0,
  setCameraAzimuth: (rad) => set({ cameraAzimuth: rad }),
  clickedPoint: null,
  setClickedPoint: (p) => set({ clickedPoint: p }),
  contourCount: { kept: 0, total: 0 },
  setContourCount: (c) => {
    // Avoid unnecessary re-render: chỉ update nếu thực sự khác
    const cur = get().contourCount;
    if (cur.kept !== c.kept || cur.total !== c.total) set({ contourCount: c });
  },
  showRidgeLines: true,
  toggleRidgeLines: () => set({ showRidgeLines: !get().showRidgeLines }),
  showMassing3D: false,
  toggleMassing3D: () => set({ showMassing3D: !get().showMassing3D }),
  floorHeight: 3.5,
  setFloorHeight: (h) => set({ floorHeight: Math.max(2.5, Math.min(5, h)) }),
  toggleHideOverlay: () => set({ hideOverlay: !get().hideOverlay }),
  toggleGrid: () => set({ showGrid: !get().showGrid }),
  setSlopeMode: (m) => {
    set({ slopeMode: m, analysis: { ...get().analysis, slope: undefined } });
    if (get().mode === 'slope' || get().mode === 'suitability') get().computeForMode(get().mode);
  },

  toggleContourOverlay: () => {
    const next = !get().showContourOverlay;
    set({ showContourOverlay: next });
    if (next) get().ensureContoursComputed();
  },
  ensureContoursComputed: () => {
    const t = get().terrain;
    if (!t) return;
    const a = { ...get().analysis };
    const env = get().env;
    if (!a.contours || a.contourInterval !== env.contourInterval) {
      a.contours = computeContourLines(t.heightmap, env.contourInterval, true, t.heightmap.mask);
      a.contourInterval = env.contourInterval;
      set({ analysis: a });
    }
  },

  // Overlay layers
  addOverlayLayer: (layer) => set((s) => ({ overlayLayers: [...s.overlayLayers, layer] })),
  removeOverlayLayer: (id) => set((s) => ({ overlayLayers: s.overlayLayers.filter((l) => l.id !== id) })),
  toggleOverlayLayerVisible: (id) =>
    set((s) => ({
      overlayLayers: s.overlayLayers.map((l) =>
        l.id === id ? { ...l, visible: !l.visible } : l
      ),
    })),
  updateOverlayLayerColor: (id, color) =>
    set((s) => ({
      overlayLayers: s.overlayLayers.map((l) => (l.id === id ? { ...l, color } : l)),
    })),
  renameOverlayLayer: (id, name) =>
    set((s) => ({
      overlayLayers: s.overlayLayers.map((l) => (l.id === id ? { ...l, name } : l)),
    })),
  setOverlayLayers: (layers) => set({ overlayLayers: layers }),

  /** Thủ công đánh dấu layer là tree.
   *  Khi bật: sinh treePoints từ polylines (centroid), circles, hoặc textPositions.
   *  Khi tắt: xoá treePoints, layer trở lại render dạng polyline thường. */
  toggleOverlayLayerIsTree: (id) => set((s) => {
    const terrain = s.terrain;
    if (!terrain) return s;
    const layers = s.overlayLayers.map((l) => {
      if (l.id !== id) return l;
      if (l.isTree) {
        return { ...l, isTree: false, treePoints: undefined };
      }

      const points: { x: number; y: number; z: number; crownRadius: number }[] = [];
      const hm = terrain.heightmap;
      const bounds = terrain.bounds;
      const cxDxf = (bounds.minX + bounds.maxX) / 2;
      const cyDxf = (bounds.minY + bounds.maxY) / 2;

      /** Sample heightmap Y từ world coords (Three.js XZ) */
      function sampleY(wx: number, wz: number): number {
        const dxfX = wx + cxDxf;
        const dxfY = cyDxf - wz;
        const col = Math.round((dxfX - hm.origin.x) / hm.cellSize);
        const row = Math.round((dxfY - hm.origin.y) / hm.cellSize);
        if (col >= 0 && col < hm.width && row >= 0 && row < hm.height) {
          const v = hm.data[row * hm.width + col];
          if (Number.isFinite(v)) return v;
        }
        return hm.minZ;
      }

      // 1) Polylines → centroid mỗi polyline = 1 cây
      for (const poly of l.polylines) {
        if (poly.length === 0) continue;
        let sx = 0, sz = 0;
        for (const p of poly) { sx += p.x; sz += p.z; }
        const cx = sx / poly.length;
        const cz = sz / poly.length;
        // Bán kính tán: bbox half-extent
        let minX = Infinity, maxX = -Infinity, minZ2 = Infinity, maxZ2 = -Infinity;
        for (const p of poly) {
          if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
          if (p.z < minZ2) minZ2 = p.z; if (p.z > maxZ2) maxZ2 = p.z;
        }
        const ext = Math.max(maxX - minX, maxZ2 - minZ2) / 2;
        const r = Math.max(1.5, Math.min(8, ext > 0.1 ? ext : 3));
        points.push({ x: cx, y: sampleY(cx, cz), z: cz, crownRadius: r });
      }

      // 2) textPositions → mỗi TEXT position = 1 cây (nếu không có polyline)
      if (points.length === 0 && l.textPositions && l.textPositions.length > 0) {
        for (const tp of l.textPositions) {
          // textPositions lưu DXF coords (không phải world) — cần convert
          const wx = tp.x - cxDxf;
          const wz = cyDxf - tp.y;
          points.push({ x: wx, y: sampleY(wx, wz), z: wz, crownRadius: 3 });
        }
      }

      console.log(
        `[toggleIsTree] Layer "${l.name}" → ${points.length} cây ` +
        `(polys: ${l.polylines.length}, texts: ${l.textPositions?.length ?? 0})`
      );
      return { ...l, isTree: true, treePoints: points };
    });
    return { overlayLayers: layers };
  }),

  toggleRoads: () => set((s) => ({ showRoads: !s.showRoads })),
  toggleBasemap: () => set((s) => ({ showBasemap: !s.showBasemap })),

  toggleTheme: () => {
    const next = get().theme === 'dark' ? 'light' : 'dark';
    set({ theme: next });
    // Áp dụng/gỡ class 'light' trên <html> để CSS variables chuyển theo
    document.documentElement.classList.toggle('light', next === 'light');
    // Lưu preference vào localStorage
    try { localStorage.setItem('siteAlyzeTheme', next); } catch { /* ignore */ }
  },

  setGeoOverride: (provinceName) => {
    const newGeo = provinceName ? makeGeoFromProvinceName(provinceName) : null;
    set((s) => {
      // Cập nhật lat + gió khí hậu theo tỉnh đã chọn + tháng hiện tại
      const envPatch: Partial<EnvParams> = newGeo
        ? buildClimateEnvPatch(newGeo, s.env.month)
        : {};
      // Cập nhật cả active project trong projects[] (nếu có)
      const projects = s.projects.map(p =>
        p.id === s.activeProjectId
          ? { ...p, geo: newGeo, env: { ...p.env, ...envPatch } }
          : p
      );
      return { geo: newGeo, env: { ...s.env, ...envPatch }, projects };
    });
  },
  toggleReportPanel: () => set((s) => ({ showReportPanel: !s.showReportPanel })),
  toggleAllPeakElevations: () => set((s) => ({ showAllPeakElevations: !s.showAllPeakElevations })),
  setCameraPreset: (v) => set({ cameraPreset: v }),

  // ── Multi-project actions ────────────────────────────────────────────────

  createProject: (name) => {
    const s = get();
    // Lưu state hiện tại vào project đang active (kèm scenes)
    const updatedProjects = s.projects.map(p =>
      p.id === s.activeProjectId
        ? { ...p, terrain: s.terrain, overlayLayers: s.overlayLayers, geo: s.geo, env: s.env, viewpoint: s.viewpoint, scenes: s.scenes }
        : p
    );
    const newId = `proj-${Date.now()}`;
    const newProject: StoredProject = {
      id: newId,
      name: name ?? `Dự án ${updatedProjects.length + 1}`,
      visible: true,
      terrain: null,
      overlayLayers: [],
      geo: null,
      env: DEFAULT_ENV,
      viewpoint: null,
      scenes: [],
    };
    set({
      projects: [...updatedProjects, newProject],
      activeProjectId: newId,
      terrain: null,
      analysis: {},
      overlayLayers: [],
      geo: null,
      env: DEFAULT_ENV,
      viewpoint: null,
    });
  },

  switchProject: (id) => {
    const s = get();
    if (id === s.activeProjectId) return;
    const target = s.projects.find(p => p.id === id);
    if (!target) return;

    // Lưu state hiện tại vào active project (kèm scenes)
    const updatedProjects = s.projects.map(p =>
      p.id === s.activeProjectId
        ? { ...p, terrain: s.terrain, overlayLayers: s.overlayLayers, geo: s.geo, env: s.env, viewpoint: s.viewpoint, scenes: s.scenes }
        : p
    );

    set({
      projects: updatedProjects,
      activeProjectId: id,
      terrain: target.terrain,
      analysis: {},
      overlayLayers: target.overlayLayers,
      geo: target.geo,
      env: target.env,
      viewpoint: target.viewpoint,
      scenes: target.scenes ?? [],
      pendingSceneLoad: null,
    });
  },

  removeProject: (id) => {
    const s = get();
    const remaining = s.projects.filter(p => p.id !== id);

    if (id !== s.activeProjectId) {
      // Xoá project không active → chỉ xoá khỏi list
      set({ projects: remaining });
      return;
    }

    // Xoá project đang active → chuyển sang project đầu tiên còn lại
    const next = remaining[0] ?? null;
    set({
      projects: remaining,
      activeProjectId: next?.id ?? null,
      terrain: next?.terrain ?? null,
      analysis: {},
      overlayLayers: next?.overlayLayers ?? [],
      geo: next?.geo ?? null,
      env: next?.env ?? DEFAULT_ENV,
      viewpoint: next?.viewpoint ?? null,
      scenes: next?.scenes ?? [],
      pendingSceneLoad: null,
    });
  },

  renameProject: (id, name) =>
    set((s) => ({
      projects: s.projects.map(p => p.id === id ? { ...p, name } : p),
    })),

  toggleProjectVisible: (id) =>
    set((s) => ({
      projects: s.projects.map(p => p.id === id ? { ...p, visible: !p.visible } : p),
    })),

  updateProjectMeta: (patch) =>
    set((s) => {
      if (!s.activeProjectId) return {};
      return {
        projects: s.projects.map(p =>
          p.id === s.activeProjectId ? { ...p, ...patch } : p
        ),
      };
    }),

  generateReport: (openPanel = true) => {
    const t = get().terrain;
    if (!t) return;
    set({ reportLoading: true });

    // Compute tất cả modes cần thiết (synchronous — các hàm này đủ nhanh)
    const env = get().env;
    const sm = get().slopeMode;
    const a = { ...get().analysis };

    // Slope (bắt buộc)
    if (!a.slope || a.slope.mode !== sm) a.slope = computeSlope(t.heightmap, sm);
    // Hydrology
    if (!a.hydro || a.arrowDensity !== env.flowArrowDensity) {
      a.hydro = computeHydrology(t.heightmap, env.flowArrowDensity);
      a.arrowDensity = env.flowArrowDensity;
    }
    // Features
    if (!a.features) a.features = detectFeatures(t.heightmap);
    // Suitability
    if (!a.suitability) a.suitability = computeSuitability(t.heightmap, a.slope, a.hydro);
    // Contours
    if (!a.contours || a.contourInterval !== env.contourInterval) {
      a.contours = computeContourLines(t.heightmap, env.contourInterval, true, t.heightmap.mask);
      a.contourInterval = env.contourInterval;
    }

    set({ analysis: a });

    const roadLayers = get().overlayLayers.filter(l => l.isRoad && l.visible);
    const report = buildReport({
      heightmap: t.heightmap,
      env,
      slopeMode: sm,
      slope: a.slope,
      hydro: a.hydro,
      features: a.features,
      suitability: a.suitability,
      contours: a.contours,
      viewshed: a.viewshed,
      viewpoint: get().viewpoint,
      roadLayers,
      geo: get().geo,
    });

    set({ report, reportLoading: false, ...(openPanel ? { showReportPanel: true } : {}) });
  },

  computeForMode: (m) => {
    const t = get().terrain;
    if (!t) return;
    const a = { ...get().analysis };
    const env = get().env;

    const ensureSlope = () => {
      const sm = get().slopeMode;
      if (!a.slope || a.slope.mode !== sm) a.slope = computeSlope(t.heightmap, sm);
    };
    const ensureHydro = () => {
      if (!a.hydro || a.arrowDensity !== env.flowArrowDensity) {
        a.hydro = computeHydrology(t.heightmap, env.flowArrowDensity);
        a.arrowDensity = env.flowArrowDensity;
      }
    };

    switch (m) {
      case 'slope':
        ensureSlope();
        break;
      case 'contour':
        if (!a.contours || a.contourInterval !== env.contourInterval) {
          a.contours = computeContourLines(t.heightmap, env.contourInterval, true, t.heightmap.mask);
          a.contourInterval = env.contourInterval;
        }
        break;
      case 'features':
        if (!a.features) a.features = detectFeatures(t.heightmap);
        break;
      case 'hydrology':
        ensureHydro();
        break;
      case 'suitability':
        ensureSlope();
        ensureHydro();
        if (!a.suitability) {
          a.suitability = computeSuitability(t.heightmap, a.slope!, a.hydro!, {
            applyFloodPenalty: get().applyFloodPenalty,
            waterLevel: get().showFlood3D ? get().waterLevel3D : undefined,
          });
        }
        break;
      case 'mca':
        // V2 — GIS-MCA 9 tiêu chí
        if (!get().mca) {
          const mca = computeMCA(t, {
            landuse: get().landuse,
            overlays: get().overlayLayers,
            weights: get().mcaWeights,
            x6Default: get().mcaX6Default,
            applyHardConstraints: get().mcaHardConstraints,
            waterLevel: get().showFlood3D ? get().waterLevel3D : undefined,
          });
          set({ mca });
          console.log(
            `[MCA] Computed: ${mca.cells.length} cells (${mca.cols}×${mca.rows}), ` +
            `Y=2 ${mca.classDist.y2.toFixed(1)}% / Y=1 ${mca.classDist.y1.toFixed(1)}% / Y=0 ${mca.classDist.y0.toFixed(1)}%`,
          );
        }
        break;
      case 'roads':
        // Roads data đã có sẵn trong overlayLayers, chỉ cần auto-bật showRoads
        if (!get().showRoads) set({ showRoads: true });
        break;
      case 'landuse':
        // Land use data được set qua setLanduse() từ panel upload riêng
        // Không cần compute gì thêm — render bằng LanduseLayer khi mode === 'landuse'
        break;
      default:
        break;
    }
    set({ analysis: a });
  },
}));
