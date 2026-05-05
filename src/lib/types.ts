export type Vec3 = [number, number, number];

export interface ContourPolyline {
  elevation: number;
  points: { x: number; y: number }[];
  layer?: string;
  closed?: boolean;
}

export interface ParsedDxf {
  contours: ContourPolyline[];
  bounds: { minX: number; minY: number; maxX: number; maxY: number; minZ: number; maxZ: number };
  pointCount: number;
}

export interface Heightmap {
  width: number;
  height: number;
  cellSize: number;
  origin: { x: number; y: number };
  data: Float32Array;
  minZ: number;
  maxZ: number;
  /** 1 = cell was rasterized from TIN triangles, 0 = gap-filled by fillHoles */
  mask?: Uint8Array;
}

// ── Auto-generated analysis report ──────────────────────────────────────────

export interface ReportMetric {
  label: string;       // "Cao nhất"
  value: string;       // "975 m"
  emphasis?: 'good' | 'warn' | 'bad'; // optional badge color
}

export interface ReportSection {
  id: string;          // 'elevation' | 'slope' | …
  title: string;       // "1. Cao độ địa hình"
  icon?: string;       // emoji hoặc lucide icon name
  summary: string;     // 1-2 câu mở đầu
  metrics: ReportMetric[];
  notes: string[];     // bullet points nhận xét
  recommendations?: string[];
  /** Khi không có data hoặc chưa compute */
  empty?: boolean;
  emptyMessage?: string;
}

export interface Report {
  generatedAt: string;
  terrain: {
    minZ: number; maxZ: number;
    areaHa: number;
    cellSize: number;
    width: number; height: number;
  };
  sections: ReportSection[];
}

/** A vector overlay layer loaded from a separate DXF (ranh giới, giao thông, …) */
export interface OverlayLayer {
  id: string;
  name: string;
  color: string;           // CSS hex, hiện tại (có thể bị ghi đè)
  originalColor?: string;  // màu gốc từ file CAD (để reset)
  visible: boolean;
  /** Polylines in Three.js centered world space, ready to render */
  polylines: { x: number; y: number; z: number }[][];
}

export interface TerrainData {
  heightmap: Heightmap;
  meshPositions: Float32Array;
  meshIndices: Uint32Array;
  meshNormals: Float32Array;
  contours: ContourPolyline[];
  bounds: ParsedDxf['bounds'];
}

export type AnalysisMode =
  | 'elevation'
  | 'slope'
  | 'contour'
  | 'features'
  | 'suitability'
  | 'hydrology'
  | 'sun'
  | 'wind'
  | 'viewshed';

export interface EnvParams {
  month: number;
  hour: number;
  northRotation: number;
  windDirection: number;
  windSpeed: number;
  latitude: number;
  contourInterval: number;
  flowArrowDensity: number;
  /** 'elevation' = màu theo dải cao độ | 'single' = một màu đồng nhất */
  contourColorMode: 'elevation' | 'single';
  contourSingleColor: string;   // CSS hex, e.g. '#ffffff'
  contourOpacity: number;       // 0–1
  /**
   * true (mặc định) → render đường đồng mức nguyên bản từ DXF gốc
   * false → tự tính lại từ heightmap với contourInterval (cho phép đổi interval)
   */
  useOriginalContours: boolean;
}
