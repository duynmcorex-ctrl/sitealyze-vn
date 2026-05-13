import { create } from 'zustand';
import type { AnalysisMode, EnvParams, TerrainData, OverlayLayer, Report, LanduseData } from '../lib/types';
import type { SlopeData, SlopeClassMode } from '../lib/analysis/slope';
import type { HydrologyData } from '../lib/analysis/hydrology';
import type { TerrainFeatures } from '../lib/analysis/features';
import type { SuitabilityData } from '../lib/analysis/suitability';
import type { ContourLineSegment } from '../lib/analysis/contours';
import { computeSlope } from '../lib/analysis/slope';
import { computeHydrology } from '../lib/analysis/hydrology';
import { detectFeatures } from '../lib/analysis/features';
import { computeSuitability } from '../lib/analysis/suitability';
import { computeContourLines } from '../lib/analysis/contours';
import { computeViewshed } from '../lib/analysis/viewshed';
import { buildReport } from '../lib/report/generateReport';
import { detectVN2000Zone } from '../lib/coord/vn2000';
import { findProvince, makeGeoFromProvinceName } from '../lib/coord/provinces';
import type { GeoInfo } from '../lib/coord/provinces';
import { getWindClimate } from '../lib/analysis/climatology';

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
  toggleReportPanel: () => void;
  /** Build report. Mặc định cũng mở panel; truyền `false` để chỉ build (cho Legend inline) */
  generateReport: (openPanel?: boolean) => void;
  toggleAllPeakElevations: () => void;
  setCameraPreset: (v: string | null) => void;

  // ── Land use planning (parse từ bản vẽ QH chi tiết) ─────────────────────
  landuse: LanduseData | null;
  setLanduse: (l: LanduseData | null) => void;
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
      };
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
    // Lưu state hiện tại vào project đang active
    const updatedProjects = s.projects.map(p =>
      p.id === s.activeProjectId
        ? { ...p, terrain: s.terrain, overlayLayers: s.overlayLayers, geo: s.geo, env: s.env, viewpoint: s.viewpoint }
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

    // Lưu state hiện tại vào active project
    const updatedProjects = s.projects.map(p =>
      p.id === s.activeProjectId
        ? { ...p, terrain: s.terrain, overlayLayers: s.overlayLayers, geo: s.geo, env: s.env, viewpoint: s.viewpoint }
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
        if (!a.suitability) a.suitability = computeSuitability(t.heightmap, a.slope!, a.hydro!);
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
