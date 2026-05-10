/**
 * parseLanduseXlsx.ts
 * Đọc file Excel chỉ tiêu sử dụng đất (vd `20250530-LLE-SDD.xlsx`).
 *
 * Schema linh hoạt — header có thể tiếng Việt hoặc tiếng Anh, có thể thiếu cột.
 * App scan header row đầu tiên có >= 3 ô non-empty, match theo từ khoá:
 *   - "mã" / "ký hiệu" / "code"            → code
 *   - "diện tích" / "area" / "DT"          → area (m²)
 *   - "mật độ" / "MĐXD" / "density"        → maxDensity (%)
 *   - "tầng" / "floor" / "TC"              → maxFloors
 *   - "FAR" / "hệ số" / "HSSD"             → far
 *   - "dân số" / "population" / "DS"       → population
 *
 * Chỉ đọc sheet đầu tiên. User có thể có nhiều sheet — Đợt sau mở rộng.
 */
import * as XLSX from 'xlsx';
import type { ParcelIndicator } from '../types';

interface ColumnMap {
  code: number;        // index cột (0-based) chứa mã ô
  area?: number;
  maxDensity?: number;
  maxFloors?: number;
  far?: number;
  population?: number;
}

/** Match header text với key chuẩn — flexible Vietnamese + English */
function matchHeader(header: string): keyof ColumnMap | null {
  const h = header.toLowerCase().replace(/[\s_\-./()]/g, '');
  // Order matters: "diện tích" trước "mật độ" để khớp đúng
  if (/(^ma$|kyhieu|code|^kh$)/.test(h)) return 'code';
  if (/(dientich|^dt$|area|s\(m)/.test(h)) return 'area';
  if (/(matdo|mdxd|density)/.test(h)) return 'maxDensity';
  if (/(tang|floor|^tc$|tcmax)/.test(h)) return 'maxFloors';
  if (/(far|heso|hssd|hesusud)/.test(h)) return 'far';
  if (/(danso|population|^ds$)/.test(h)) return 'population';
  return null;
}

/** Parse 1 cell number — chấp nhận chuỗi "1500", "1,500", "60%", "5 tầng" */
function parseNumberCell(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const s = String(v).replace(/[,%]/g, '').replace(/[^0-9.\-]/g, '');
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

/**
 * Đọc Excel buffer → mảng ParcelIndicator.
 * Trả về [] nếu không tìm thấy header phù hợp.
 */
export function parseLanduseXlsx(buffer: ArrayBuffer): {
  indicators: ParcelIndicator[];
  warnings: string[];
} {
  const warnings: string[] = [];
  const wb = XLSX.read(buffer, { type: 'array' });
  if (wb.SheetNames.length === 0) {
    return { indicators: [], warnings: ['File Excel không có sheet nào.'] };
  }

  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });

  // Tìm header row: row đầu tiên có >= 2 cell match keyword
  let headerRowIdx = -1;
  let colMap: ColumnMap | null = null;

  for (let r = 0; r < Math.min(rows.length, 10); r++) {
    const row = rows[r];
    if (!row || row.length === 0) continue;
    const candidate: Partial<ColumnMap> = {};
    for (let c = 0; c < row.length; c++) {
      const cell = row[c];
      if (typeof cell !== 'string') continue;
      const key = matchHeader(cell);
      if (key && candidate[key] === undefined) candidate[key] = c;
    }
    // Yêu cầu tối thiểu: có cột code + ít nhất 1 cột chỉ tiêu khác
    const otherCols = ['area', 'maxDensity', 'maxFloors', 'far', 'population']
      .filter(k => candidate[k as keyof ColumnMap] !== undefined).length;
    if (candidate.code !== undefined && otherCols >= 1) {
      headerRowIdx = r;
      colMap = candidate as ColumnMap;
      break;
    }
  }

  if (headerRowIdx < 0 || !colMap) {
    return {
      indicators: [],
      warnings: [
        'Không tìm thấy header phù hợp trong file Excel. ' +
        'Cần ít nhất 2 cột với tên: "Mã", "Diện tích", "Mật độ", "Tầng", "FAR", "Dân số".',
      ],
    };
  }

  // Parse data rows
  const indicators: ParcelIndicator[] = [];
  for (let r = headerRowIdx + 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row) continue;
    const code = row[colMap.code];
    if (!code || typeof code !== 'string' && typeof code !== 'number') continue;
    const codeStr = String(code).trim();
    if (!codeStr || codeStr === '0' || /^(tổng|total|sum)$/i.test(codeStr)) continue;

    indicators.push({
      center: { x: 0, y: 0 }, // Sẽ bind sau từ CAD circle
      code: codeStr,
      area:        colMap.area        !== undefined ? parseNumberCell(row[colMap.area])        : null,
      maxDensity:  colMap.maxDensity  !== undefined ? parseNumberCell(row[colMap.maxDensity])  : null,
      maxFloors:   colMap.maxFloors   !== undefined ? parseNumberCell(row[colMap.maxFloors])   : null,
      far:         colMap.far         !== undefined ? parseNumberCell(row[colMap.far])         : null,
      population:  colMap.population  !== undefined ? parseNumberCell(row[colMap.population])  : null,
    });
  }

  if (indicators.length === 0) {
    warnings.push('Không có dòng dữ liệu nào được parse — kiểm tra cột "Mã ô đất" có trống không.');
  }

  return { indicators, warnings };
}

/**
 * Merge Excel data với CAD indicators bằng code (mã ô đất).
 * Excel làm chuẩn — override các field bị null trong CAD bằng Excel.
 * Nếu CAD chưa có code (khớp lỏng) → dùng position của Excel làm key.
 */
export function mergeIndicators(
  cadIndicators: ParcelIndicator[],
  xlsxIndicators: ParcelIndicator[],
): ParcelIndicator[] {
  const out: ParcelIndicator[] = cadIndicators.map(i => ({ ...i }));
  const cadByCode = new Map(out.map(i => [i.code.toUpperCase(), i] as const));

  for (const x of xlsxIndicators) {
    const codeKey = x.code.toUpperCase();
    const cad = cadByCode.get(codeKey);
    if (cad) {
      // Excel override CAD nếu CAD null hoặc Excel có data
      if (x.area        !== null) cad.area        = x.area;
      if (x.maxDensity  !== null) cad.maxDensity  = x.maxDensity;
      if (x.maxFloors   !== null) cad.maxFloors   = x.maxFloors;
      if (x.far         !== null) cad.far         = x.far;
      if (x.population  !== null) cad.population  = x.population;
    } else {
      // CAD không có code này → thêm mới (chưa có toạ độ tâm)
      out.push({ ...x });
    }
  }
  return out;
}
