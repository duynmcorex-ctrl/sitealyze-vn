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

/**
 * removeDiacritics — Strip dấu tiếng Việt để khớp regex bằng ASCII.
 * Bao gồm: tổ hợp combining marks (NFD) + chuyển "đ"/"Đ" → "d"/"D".
 * "đ" (U+0111) là ký tự độc lập, không phải "d" + dấu — phải replace riêng.
 */
function removeDiacritics(s: string): string {
  return s.normalize('NFD')
          // eslint-disable-next-line no-misleading-character-class
          .replace(/[̀-ͯ]/g, '')
          .replace(/đ/g, 'd').replace(/Đ/g, 'D');
}

/** Match header text với key chuẩn — flexible Vietnamese + English (sau khi strip dấu) */
function matchHeader(header: string): keyof ColumnMap | null {
  const h = removeDiacritics(header).toLowerCase().replace(/[\s_\-./()]/g, '');
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

  // Duyệt TẤT CẢ sheets — nhiều file có sheet "Bảng SDD" hay "Chỉ tiêu" thay vì sheet đầu
  let bestResult: { rows: unknown[][]; headerRowIdx: number; colMap: ColumnMap; sheetName: string } | null = null;

  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName];
    const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });

    // Scan deeper: up to 30 rows (nhiều file có title merged + sub-header rows)
    // Cũng try multi-row header: gộp 2 row liền nhau làm header (xử lý merged cell)
    for (let r = 0; r < Math.min(rows.length, 30); r++) {
      const row = rows[r];
      if (!row || row.length === 0) continue;

      // Single row check
      const candidate1: Partial<ColumnMap> = {};
      for (let c = 0; c < row.length; c++) {
        const cell = row[c];
        if (typeof cell !== 'string') continue;
        const key = matchHeader(cell);
        if (key && candidate1[key] === undefined) candidate1[key] = c;
      }

      // Multi-row check: gộp row + (row+1) — nhiều file VN có 2-row header
      // (vd row r = "Tầng cao", row r+1 = "tối đa (tầng)")
      const candidate2: Partial<ColumnMap> = { ...candidate1 };
      const nextRow = rows[r + 1] ?? [];
      const maxLen = Math.max(row.length, nextRow.length);
      for (let c = 0; c < maxLen; c++) {
        const combined = `${row[c] ?? ''} ${nextRow[c] ?? ''}`.trim();
        if (combined.length < 2) continue;
        const key = matchHeader(combined);
        if (key && candidate2[key] === undefined) candidate2[key] = c;
      }

      // Chọn candidate tốt hơn (nhiều cột match hơn)
      const count = (c: Partial<ColumnMap>) =>
        ['code', 'area', 'maxDensity', 'maxFloors', 'far', 'population']
          .filter(k => c[k as keyof ColumnMap] !== undefined).length;
      const c1 = count(candidate1);
      const c2 = count(candidate2);
      const best = c2 > c1 ? candidate2 : candidate1;
      const bestCount = Math.max(c1, c2);

      // Yêu cầu: có cột code + ít nhất 1 cột chỉ tiêu (giảm threshold để dễ match)
      if (best.code !== undefined && bestCount >= 2) {
        bestResult = {
          rows,
          headerRowIdx: r,
          colMap: best as ColumnMap,
          sheetName,
        };
        break;
      }
    }
    if (bestResult) break;
  }

  // Unpack for backward-compat with code below
  const rows = bestResult?.rows ?? XLSX.utils.sheet_to_json<unknown[]>(
    wb.Sheets[wb.SheetNames[0]], { header: 1, defval: null }
  );
  const headerRowIdx = bestResult?.headerRowIdx ?? -1;
  const colMap = bestResult?.colMap ?? null;

  if (headerRowIdx < 0 || !colMap) {
    // Liệt kê các header thực tế đọc được TỪ TẤT CẢ sheets để giúp user debug
    const foundHeaders: string[] = [];
    for (const sheetName of wb.SheetNames) {
      const sheet = wb.Sheets[sheetName];
      const sheetRows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });
      for (let r = 0; r < Math.min(sheetRows.length, 30); r++) {
        const row = sheetRows[r];
        if (!row) continue;
        for (const cell of row) {
          if (typeof cell === 'string' && cell.trim().length > 1 && cell.trim().length < 50) {
            foundHeaders.push(cell.trim());
          }
        }
      }
    }
    const uniqueHeaders = Array.from(new Set(foundHeaders)).slice(0, 20);
    return {
      indicators: [],
      warnings: [
        'Không tìm thấy header phù hợp trong file Excel. ' +
        'Cần TỐI THIỂU 2 cột với tên: "Mã/Ký hiệu" + 1 trong các cột {"Diện tích", "MĐXD/Mật độ", "Tầng cao", "FAR", "Dân số"}. ' +
        `Đã quét ${wb.SheetNames.length} sheet × 30 row đầu. ` +
        (uniqueHeaders.length > 0 ? `Header tìm thấy: ${uniqueHeaders.join(' | ')}` : 'Không có cell text nào.') +
        ' — Gợi ý: file của bạn có thể chứa chỉ tiêu trong DXF (vòng tròn A/B/C/D/E/G), thử upload chỉ DXF (không cần Excel).',
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
