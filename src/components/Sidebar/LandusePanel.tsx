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
  const landuse           = useSiteStore((s) => s.landuse);
  const setLanduse        = useSiteStore((s) => s.setLanduse);
  const typeOverrides     = useSiteStore((s) => s.typeOverrides);
  const setTypeOverride   = useSiteStore((s) => s.setTypeOverride);
  const clearTypeOverride = useSiteStore((s) => s.clearTypeOverride);
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

          {/* Chỉ tiêu summary — phân biệt nguồn DXF vs Excel + chi tiết */}
          {(() => {
            const withCode = landuse.indicators.filter(i => i.code).length;
            const withFloors = landuse.indicators.filter(i => i.maxFloors && i.maxFloors > 0).length;
            const withDensity = landuse.indicators.filter(i => i.maxDensity && i.maxDensity > 0).length;
            const withArea = landuse.indicators.filter(i => i.area && i.area > 0).length;
            const bound = landuse.parcels.filter(p => p.indicator?.code).length;

            if (landuse.indicators.length === 0) {
              return (
                <div className="text-[9.5px] text-amber-400/80 leading-snug">
                  ⚠ Chưa phát hiện vòng tròn chỉ tiêu trong DXF. Nếu file có chỉ tiêu, kiểm tra
                  vòng tròn CIRCLE + TEXT A/B/C/D/E/G xung quanh. Hoặc load Excel SDD.
                </div>
              );
            }
            return (
              <div className="space-y-0.5">
                <div className="text-[9.5px] text-accent-teal">
                  ✓ Đọc được <b>{landuse.indicators.length}</b> ô chỉ tiêu từ DXF —{' '}
                  <b className={bound > 0 ? 'text-green-300' : 'text-amber-400'}>
                    {bound}
                  </b>{' '}
                  ô đã gắn vào parcel
                </div>
                <div className="text-[9px] text-slate-500 font-mono pl-3">
                  Mã: {withCode} · Diện tích: {withArea} · MĐXD: {withDensity} · Tầng: {withFloors}
                </div>
                {bound === 0 && landuse.indicators.length > 0 && (
                  <div className="text-[9.5px] text-amber-400/80 leading-snug pt-1">
                    ⚠ Indicator parse được nhưng KHÔNG bind được parcel. Có thể:
                    (1) Parcel polygon không chứa TEXT với mã ô,
                    (2) Vòng tròn chỉ tiêu nằm rất xa parcel, hoặc
                    (3) Layer parcel bị filter noise — xem console log.
                  </div>
                )}
                {bound > 0 && (
                  <div className="text-[9px] text-slate-500 leading-snug pt-0.5">
                    → Sẵn sàng bật "Khối 3D công trình" ở Mục 3.
                  </div>
                )}
              </div>
            );
          })()}

          {/* ── Phân bố loại đất — BẢNG COMPACT, hiển thị ALL types ── */}
          <div>
            <div className="text-[9px] text-slate-500 italic mb-1 leading-snug">
              💡 Gõ MĐXD% + Tầng cho từng loại đất → áp cho ô CHƯA có chỉ tiêu DXF/Excel.
            </div>
            {/* Table header */}
            <div className="grid grid-cols-[14px_1fr_38px_28px_42px_38px_14px] gap-1 items-center
                            text-[8.5px] uppercase tracking-wide text-slate-500 font-bold
                            px-1 py-0.5 border-b border-white/10">
              <span></span>
              <span>Loại đất</span>
              <span className="text-right">%</span>
              <span className="text-right">Ô</span>
              <span className="text-center">MĐXD</span>
              <span className="text-center">Tầng</span>
              <span></span>
            </div>
            {/* Table rows — TẤT CẢ loại đất, không slice */}
            <div className="max-h-64 overflow-y-auto pr-0.5">
              {landuse.byType.map(b => {
                const ov = typeOverrides[b.type];
                const mdxd = ov?.maxDensity;
                const tang = ov?.maxFloors;
                const parcelsOfType = landuse.parcels.filter(p => p.inferredType === b.type);
                const noIndicator = parcelsOfType.filter(p => !p.indicator?.maxFloors).length;
                const total = parcelsOfType.length;
                const hasOverride = mdxd !== undefined || tang !== undefined;
                return (
                  <div
                    key={b.type}
                    className={`grid grid-cols-[14px_1fr_38px_28px_42px_38px_14px] gap-1 items-center
                                px-1 py-0.5 text-[10px] border-b border-white/4 last:border-0
                                ${hasOverride ? 'bg-amber-500/5' : ''} hover:bg-white/3 transition`}
                    title={`${LANDUSE_LABEL[b.type]} · ${total} ô · ${noIndicator} chưa có chỉ tiêu`}
                  >
                    <span
                      className="block w-3 h-3 rounded-sm border border-white/20"
                      style={{ background: LANDUSE_DISPLAY_COLOR[b.type] }}
                    />
                    <span className="truncate text-slate-300">{LANDUSE_LABEL[b.type]}</span>
                    <span className="text-right text-slate-500 tabular-nums">{b.pct.toFixed(1)}</span>
                    <span className="text-right text-slate-500 tabular-nums">{total}</span>
                    <input
                      type="number" min={0} max={100} step={1}
                      value={mdxd ?? ''}
                      onChange={(e) => {
                        const v = e.target.value === '' ? undefined : Number(e.target.value);
                        setTypeOverride(b.type, { maxDensity: v });
                      }}
                      placeholder="—"
                      className="w-full px-0.5 py-0 text-[10px] text-center bg-bg-dark border border-white/10 rounded
                                 text-slate-100 outline-none focus:border-amber-400/50"
                    />
                    <input
                      type="number" min={0} max={50} step={1}
                      value={tang ?? ''}
                      onChange={(e) => {
                        const v = e.target.value === '' ? undefined : Number(e.target.value);
                        setTypeOverride(b.type, { maxFloors: v });
                      }}
                      placeholder="—"
                      className="w-full px-0.5 py-0 text-[10px] text-center bg-bg-dark border border-white/10 rounded
                                 text-slate-100 outline-none focus:border-amber-400/50"
                    />
                    {hasOverride ? (
                      <button
                        onClick={() => clearTypeOverride(b.type)}
                        className="text-[10px] text-slate-500 hover:text-red-400 transition leading-none"
                        title="Xoá override"
                      >✕</button>
                    ) : <span/>}
                  </div>
                );
              })}
            </div>
            {/* Tổng summary */}
            <div className="grid grid-cols-[14px_1fr_38px_28px_42px_38px_14px] gap-1 items-center
                            px-1 py-1 text-[10px] font-bold border-t border-white/10
                            bg-white/3 text-slate-200">
              <span></span>
              <span>TỔNG ({landuse.byType.length} loại)</span>
              <span className="text-right tabular-nums">100</span>
              <span className="text-right tabular-nums">{landuse.parcels.length}</span>
              <span/><span/><span/>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
