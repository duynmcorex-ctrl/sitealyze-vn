export type Vec3 = [number, number, number];

export interface ContourPolyline {
  elevation: number;
  points: { x: number; y: number }[];
  layer?: string;
  closed?: boolean;
}

/** Candidate boundary polyline — user chọn manual qua dropdown */
export interface BoundaryCandidate {
  polygon: { x: number; y: number }[];
  layer: string;
  area: number;
  aspectRatio: number;
  pctOfBbox: number;
  closedKind: 'flag-shape' | 'flag-closed' | 'endpoints' | 'forced-open';
  isLikelyBoundary: boolean;
}

export interface ParsedDxf {
  contours: ContourPolyline[];
  bounds: { minX: number; minY: number; maxX: number; maxY: number; minZ: number; maxZ: number };
  pointCount: number;
  /** Road polylines thô từ file CAD — tách riêng để worker pass qua TerrainData */
  rawRoads?: RawRoadPolyline[];
  /** List candidate ranh giới — UI hiển thị dropdown cho user pick */
  boundaryCandidates?: BoundaryCandidate[];
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
  /** Mask gốc trước khi user pick boundary — giữ để switch boundary không phá data
   *  Khi user pick boundary mới: mask = clone(originalMask) → apply clip */
  originalMask?: Uint8Array;
  /** minZ/maxZ gốc khi chưa clip */
  originalMinZ?: number;
  originalMaxZ?: number;
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
  /** Vị trí TEXT/MTEXT entity trong layer (toạ độ DXF gốc — để manual-tag làm tree) */
  textPositions?: { x: number; y: number; content: string }[];
  /** Số entity theo loại — phục vụ TreesDiagnostic */
  entityCounts?: { polyline: number; circle: number; text: number; insert: number };
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
  /** Candidate ranh giới — UI dropdown để user chọn manual */
  boundaryCandidates?: BoundaryCandidate[];
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
  | 'mca'           // V2 — GIS-MCA 9 tiêu chí (theo NCKH ĐH Kiến trúc HN 2026)
  | 'hydrology'
  | 'sun'
  | 'wind'
  | 'viewshed'
  | 'roads'
  | 'landuse';

// ── Multi-Criteria Analysis (MCA) ─────────────────────────────────────────
// Phương pháp đánh giá quỹ đất xây dựng theo nghiên cứu KTS HN 2026:
//   9 tiêu chí X1-X9, mỗi tiêu chí scored 1-10 theo bảng tra,
//   weighted sum + hard constraint → 3 lớp Y=0/1/2.
//   Grid 20×20m (tương ứng đơn vị lô đất QH 1/500).

/** Kết quả 1 cell trong Grid 20×20m */
export interface MCACell {
  /** Index trong grid (row-major) */
  i: number;
  /** Center cell trong DXF coords (m) */
  centerX: number;
  centerY: number;
  /** 9 điểm tiêu chí — mỗi giá trị 1-10 */
  x1: number; x2: number; x3: number;
  x4: number; x5: number; x6: number;
  x7: number; x8: number; x9: number;
  /** Tổng điểm 0-100 (weighted sum × 10, sau khi áp hard constraint) */
  score: number;
  /** Lớp đầu ra: 0=Không thuận lợi, 1=Ít thuận lợi, 2=Thuận lợi */
  classY: 0 | 1 | 2;
  /** Mean Z trong ô (m) — dùng drape khối lên terrain */
  meanZ: number;
  /** Lý do bị veto (nếu có) */
  vetoReason?: string;
}

export interface MCAData {
  /** Cạnh ô grid (m) — mặc định 20 */
  gridSize: number;
  cols: number;
  rows: number;
  /** Origin DXF của grid (góc dưới-trái) */
  originX: number;
  originY: number;
  cells: MCACell[];
  /** Trọng số 9 tiêu chí — sum ≈ 1.0 */
  weights: { x1: number; x2: number; x3: number; x4: number; x5: number;
             x6: number; x7: number; x8: number; x9: number };
  /** Phân bố % theo lớp */
  classDist: { y0: number; y1: number; y2: number };
  /** Diện tích (m²) theo lớp */
  classArea: { y0: number; y1: number; y2: number };
  /** Mean score theo từng tiêu chí — cho biểu đồ Feature Importance */
  meanScores: { x1: number; x2: number; x3: number; x4: number; x5: number;
                x6: number; x7: number; x8: number; x9: number };
  /** Có dùng hard constraint không */
  hardConstraintsApplied: boolean;
}

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
  /**
   * Kiểu hiển thị gió 3D:
   *   'v1' — cũ: hạt đơn sắc nổi đều (đơn giản)
   *   'v2' — Windy-style: streak + màu theo tốc độ + địa hình ảnh hưởng tốc độ
   */
  windVisualization: 'v1' | 'v2';
}
