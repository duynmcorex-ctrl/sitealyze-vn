import { create } from 'zustand';
import type { AnalysisMode, EnvParams, TerrainData, OverlayLayer, Report } from '../lib/types';
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
  generateReport: () => void;
  toggleAllPeakElevations: () => void;
  setCameraPreset: (v: string | null) => void;
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

  setTerrain: (t) => set({ terrain: t, analysis: {}, viewpoint: null, error: null }),
  setLayerPattern: (p) => set({ layerPattern: p }),
  setMode: (m) => {
    set({ mode: m });
    get().computeForMode(m);
  },
  setEnv: (patch) => {
    set({ env: { ...get().env, ...patch } });
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

  toggleReportPanel: () => set((s) => ({ showReportPanel: !s.showReportPanel })),
  toggleAllPeakElevations: () => set((s) => ({ showAllPeakElevations: !s.showAllPeakElevations })),
  setCameraPreset: (v) => set({ cameraPreset: v }),

  generateReport: () => {
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
    });

    set({ report, reportLoading: false, showReportPanel: true });
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
      default:
        break;
    }
    set({ analysis: a });
  },
}));
