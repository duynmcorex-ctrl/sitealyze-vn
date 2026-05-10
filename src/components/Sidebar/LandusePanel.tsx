/**
 * LandusePanel.tsx
 * Sidebar panel cho mode 'landuse' (Quy hoạch sử dụng đất).
 * Cho phép user load:
 *   1. File DXF QH (bản đồ quy hoạch chi tiết với màu hatch + circle marker)
 *   2. File Excel chỉ tiêu (mã ô + diện tích + mật độ + tầng + FAR + dân số)
 *
 * Hiển thị:
 *   - Tổng số ô đất phát hiện được
 *   - Phân bố diện tích theo loại đất (top 5 + others)
 *   - Cảnh báo nếu thiếu indicator hoặc parcels không bind được
 */
import { Upload, FileSpreadsheet, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { useSiteStore } from '../../store/useSiteStore';
import { parseLanduseDxf, LANDUSE_DISPLAY_COLOR, LANDUSE_LABEL } from '../../lib/dxf/parseLanduse';
import { parseLanduseXlsx, mergeIndicators } from '../../lib/dxf/parseLanduseXlsx';

export function LandusePanel() {
  const landuse = useSiteStore((s) => s.landuse);
  const setLanduse = useSiteStore((s) => s.setLanduse);
  const dxfRef = useRef<HTMLInputElement>(null);
  const xlsxRef = useRef<HTMLInputElement>(null);
  const [dxfFileName, setDxfFileName] = useState<string | null>(null);
  const [xlsxFileName, setXlsxFileName] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);

  const handleDxf = async (file: File) => {
    setDxfFileName(file.name);
    setWarnings([]);
    try {
      const text = await file.text();
      const data = parseLanduseDxf(text);
      if (data.parcels.length === 0) {
        setWarnings(['Không phát hiện được ô đất nào (closed polyline có màu) trong file DXF.']);
      }
      setLanduse(data);
    } catch (e) {
      setWarnings([`Lỗi đọc DXF: ${e instanceof Error ? e.message : String(e)}`]);
    }
  };

  const handleXlsx = async (file: File) => {
    setXlsxFileName(file.name);
    if (!landuse) {
      setWarnings(['Vui lòng tải file CAD QH trước để có khung bản đồ, sau đó load Excel để gắn chỉ tiêu.']);
      return;
    }
    try {
      const buffer = await file.arrayBuffer();
      const { indicators: xlsxInd, warnings: w } = parseLanduseXlsx(buffer);
      const merged = mergeIndicators(landuse.indicators, xlsxInd);

      // Re-bind merged indicators vào parcels (point-in-polygon nếu có toạ độ;
      // ngược lại match theo code nếu CAD parcel đã có indicator code)
      const updatedParcels = landuse.parcels.map(p => ({ ...p }));
      // Map code → indicator để dễ tra
      const indByCode = new Map<string, typeof merged[0]>();
      for (const i of merged) {
        if (i.code) indByCode.set(i.code.toUpperCase(), i);
      }
      for (const p of updatedParcels) {
        if (p.indicator?.code) {
          const m = indByCode.get(p.indicator.code.toUpperCase());
          if (m) p.indicator = m;
        }
      }

      setLanduse({
        ...landuse,
        parcels: updatedParcels,
        indicators: merged,
      });
      setWarnings(w);
    } catch (e) {
      setWarnings([`Lỗi đọc Excel: ${e instanceof Error ? e.message : String(e)}`]);
    }
  };

  const clear = () => {
    setLanduse(null);
    setDxfFileName(null);
    setXlsxFileName(null);
    setWarnings([]);
  };

  return (
    <div className="space-y-3">
      <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">
        Bước 1 — Tải file CAD QH
      </div>
      <button
        onClick={() => dxfRef.current?.click()}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-md text-xs
                   font-bold uppercase bg-accent-teal/10 hover:bg-accent-teal/20
                   border border-accent-teal/40 text-accent-teal transition"
      >
        <Upload size={14} /> File DXF Quy hoạch
      </button>
      <input
        ref={dxfRef} type="file" accept=".dxf,.DXF" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleDxf(f); e.target.value = ''; }}
      />
      {dxfFileName && (
        <div className="text-[10px] text-slate-500 truncate">📐 {dxfFileName}</div>
      )}

      <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mt-3">
        Bước 2 — Tải Excel chỉ tiêu (tùy chọn)
      </div>
      <button
        onClick={() => xlsxRef.current?.click()}
        disabled={!landuse}
        className="w-full flex items-center justify-center gap-2 py-2 rounded-md text-xs
                   font-bold uppercase bg-bg-card hover:bg-white/10 border border-white/10
                   text-slate-400 hover:text-slate-200 transition disabled:opacity-40"
      >
        <FileSpreadsheet size={13} /> File Excel SDD
      </button>
      <input
        ref={xlsxRef} type="file" accept=".xlsx,.XLSX,.xls,.XLS" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleXlsx(f); e.target.value = ''; }}
      />
      {xlsxFileName && (
        <div className="text-[10px] text-slate-500 truncate">📊 {xlsxFileName}</div>
      )}

      {/* Warnings */}
      {warnings.length > 0 && (
        <div className="space-y-1 px-2 py-1.5 rounded bg-amber-500/10 border border-amber-500/30">
          {warnings.map((w, i) => (
            <div key={i} className="text-[10px] text-amber-300/90 leading-tight">⚠ {w}</div>
          ))}
        </div>
      )}

      {/* Stats */}
      {landuse && landuse.parcels.length > 0 && (
        <div className="space-y-2 pt-2 border-t border-white/5">
          <div className="flex items-center justify-between">
            <div className="text-xs text-slate-300 font-bold">
              {landuse.parcels.length} ô đất · {(landuse.totalAreaSqm / 10000).toFixed(2)} ha
            </div>
            <button
              onClick={clear}
              title="Xoá dữ liệu QH"
              className="text-slate-500 hover:text-red-400 transition"
            >
              <X size={14} />
            </button>
          </div>

          <div className="text-[9px] text-slate-500">
            {landuse.indicators.length > 0 ? (
              <>✓ {landuse.indicators.length} ô có chỉ tiêu</>
            ) : (
              <>⚠ Chưa có chỉ tiêu (load Excel để bổ sung)</>
            )}
          </div>

          {/* Phân bố loại đất */}
          <div className="space-y-1">
            {landuse.byType.slice(0, 6).map(b => (
              <div key={b.type} className="flex items-center gap-1.5 text-[10px]">
                <span
                  className="block w-3 h-3 rounded-sm border border-white/20 flex-shrink-0"
                  style={{ background: LANDUSE_DISPLAY_COLOR[b.type] }}
                />
                <span className="flex-1 min-w-0 truncate text-slate-300" title={LANDUSE_LABEL[b.type]}>
                  {LANDUSE_LABEL[b.type]}
                </span>
                <span className="text-slate-500 tabular-nums">
                  {b.pct.toFixed(1)}%
                </span>
              </div>
            ))}
            {landuse.byType.length > 6 && (
              <div className="text-[9px] text-slate-600 italic pl-4">
                + {landuse.byType.length - 6} loại khác
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
