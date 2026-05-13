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
  /** Road polylines thô từ file CAD — tách riêng để worker pass qua TerrainData */
  rawRoads?: RawRoadPolyline[];
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

/**
 * Một cây trong toạ độ Three.js world space (đã center + draped lên terrain).
 * Dùng cho instanced rendering trong TreeInstances.tsx.
 */
export interface TreePoint {
  x: number;          // Three.js X
  y: number;          // Three.js Y = terrain height tại vị trí đó
  z: number;          // Three.js Z
  crownRadius: number; // Bán kính tán (m) — từ CIRCLE radius trong DXF hoặc default 3m
}

/** A vector overlay layer loaded from a separate DXF (ranh giới, giao thông, …) */
export interface OverlayLayer {
  id: string;
  /** ID nhóm — tất cả layer từ cùng 1 file có cùng fileId (dạng "file-<timestamp>") */
  fileId?: string;
  /** Tên file gốc (không có extension) — hiện trong folder group header */
  fileName?: string;
  name: string;
  color: string;           // CSS hex, hiện tại (có thể bị ghi đè)
  originalColor?: string;  // màu gốc từ file CAD (để reset)
  visible: boolean;
  /** Tự động tag là layer giao thông (regex GIAOTHONG, GT, DUONG …) */
  isRoad?: boolean;
  /** Metadata phân tích đường — chỉ có khi isRoad = true */
  roadMeta?: RoadMeta;
  /** Tự động tag là layer cây hiện trạng (regex CAY, TREE …) */
  isTree?: boolean;
  /** Dữ liệu cây 3D — chỉ có khi isTree = true */
  treePoints?: TreePoint[];
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
  /**
   * Road polylines thô từ file CAD (tọa độ DXF 2D, chưa center/drape).
   * Được tự động tạo khi parse DXF/DWG có layer giao thông.
   * FileUpload.tsx dùng để tạo OverlayLayer với roadMeta sau khi build terrain.
   */
  rawRoadPolylines?: RawRoadPolyline[];
}

// ── Road classification ──────────────────────────────────────────────────────

/** Loại mặt đường (từ tên layer hoặc màu) */
export type RoadSurface = 'concrete' | 'asphalt' | 'gravel' | 'dirt' | 'unknown';

/** Vai trò của polyline đường trong bản vẽ */
export type RoadRole = 'centerline' | 'edge' | 'row' | 'unknown';

/** Metadata phân tích giao thông — gắn vào OverlayLayer khi isRoad = true */
export interface RoadMeta {
  surface: RoadSurface;
  role: RoadRole;
  /** Chiều rộng ước tính (m) — từ tên layer hoặc đo cặp mep đường song song */
  estimatedWidthM: number | null;
  /** Điểm lối vào: endpoint của polyline gần biên địa hình, tọa độ Three.js XZ */
  entrancePoints: { x: number; z: number }[];
}

/**
 * Road polyline thô từ file CAD — tọa độ DXF 2D gốc (chưa center/drape).
 * Lưu trong TerrainData để FileUpload tự động tạo OverlayLayer sau khi build terrain.
 */
export interface RawRoadPolyline {
  layer: string;
  color: string;    // CSS hex từ DXF layer table
  points: { x: number; y: number }[];
}

// ── Land use planning (parse từ bản vẽ QH chi tiết) ─────────────────────────

/** 18 loại đất theo CHÚ THÍCH KÝ HIỆU chuẩn QH VN */
export type LanduseType =
  | 'TRUNG_TAM_VHTT'    // Trung tâm văn hoá - thể thao
  | 'NHA_VAN_HOA'       // Đất nhà văn hoá
  | 'TMDV'              // Đất thương mại dịch vụ
  | 'TRUONG_MAM_NON'    // Trường mầm non
  | 'TRUONG_TIEU_HOC'   // Trường tiểu học
  | 'NHA_O_LIEN_KE'     // Đất nhà ở liên kế
  | 'BIET_THU_DON_LAP'  // Đất nhà ở biệt thự đơn lập
  | 'BIET_THU_SONG_LAP' // Đất nhà ở biệt thự song lập
  | 'NHA_O_XA_HOI'      // Đất nhà ở xã hội
  | 'CHUNG_CU_HON_HOP'  // Đất nhà chung cư hỗn hợp
  | 'CAY_XANH_CONG_CONG'// Đất cây xanh sử dụng công cộng
  | 'CAY_XANH_THE_DUC'  // Đất cây xanh thể dục thể thao
  | 'HA_TANG_KY_THUAT'  // Đất hạ tầng kỹ thuật
  | 'BAI_DO_XE'         // Đất bãi đỗ xe
  | 'HO_AO_DAM'         // Mặt nước (hồ, ao, đầm)
  | 'DUONG_GIAO_THONG'  // Đường giao thông
  | 'KHOANG_LUI'        // Khoảng lùi
  | 'CAU_BE_TONG'       // Cầu bê tông
  | 'KHAC';             // Loại khác / chưa phân loại

export interface LanduseParcel {
  id: string;
  /** Polygon đa giác (toạ độ DXF gốc, chưa center) */
  polygon: { x: number; y: number }[];
  /** Loại đất suy luận từ màu/layer */
  inferredType: LanduseType;
  /** Màu CSS hex từ entity DXF */
  rawColor: string;
  /** Tên layer DXF nguồn */
  layer: string;
  /** Diện tích tính được từ polygon (m²) — Shoelace */
  areaSqm: number;
  /** Indicator (ô chỉ tiêu) gắn với parcel này, nếu match được */
  indicator?: ParcelIndicator;
}

export interface ParcelIndicator {
  /** Toạ độ tâm vòng tròn chỉ tiêu (toạ độ DXF gốc) */
  center: { x: number; y: number };
  /** A — ký hiệu chức năng ô đất (vd "DTMDV-01", "BT-12") */
  code: string;
  /** B — diện tích ô đất (m²), null nếu chưa biết */
  area: number | null;
  /** C — mật độ XD tối đa (%), null nếu chưa biết */
  maxDensity: number | null;
  /** D — tầng cao tối đa */
  maxFloors: number | null;
  /** E — hệ số sử dụng đất (FAR) */
  far: number | null;
  /** G — dân số (người) */
  population: number | null;
}

export interface LanduseData {
  parcels: LanduseParcel[];
  indicators: ParcelIndicator[];
  /** Tổng diện tích cộng lại (m²) */
  totalAreaSqm: number;
  /** Phân bố diện tích theo loại đất */
  byType: { type: LanduseType; areaSqm: number; pct: number; count: number }[];
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
  | 'viewshed'
  | 'roads'
  | 'landuse';

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
  /** Chiều cao cây hiện trạng (m) — điều chỉnh bằng slider */
  treeHeight: number;
  /** Hiển thị cây hiện trạng hay không */
  showTrees: boolean;
  /**
   * Cao độ gốc (mực nước biển trung bình, m).
   * Dùng khi file CAD có Z = 0 (chưa có cao độ thực).
   * Được cộng vào minZ/maxZ khi hiển thị legend và báo cáo.
   * Không ảnh hưởng phân tích tương đối (độ dốc, thủy văn).
   */
  baseMSL: number;
}
