import { Grid3x3, Layers, MapPin, Route } from 'lucide-react';
import { useSiteStore } from '../../store/useSiteStore';
import type { SlopeClassMode } from '../../lib/analysis/slope';
import { PROVINCES } from '../../lib/coord/provinces';

export function EnvParams() {
  const env                  = useSiteStore((s) => s.env);
  const setEnv               = useSiteStore((s) => s.setEnv);
  const mode                 = useSiteStore((s) => s.mode);
  const showGrid             = useSiteStore((s) => s.showGrid);
  const toggleGrid           = useSiteStore((s) => s.toggleGrid);
  const slopeMode            = useSiteStore((s) => s.slopeMode);
  const setSlopeMode         = useSiteStore((s) => s.setSlopeMode);
  const showContourOverlay   = useSiteStore((s) => s.showContourOverlay);
  const toggleContourOverlay = useSiteStore((s) => s.toggleContourOverlay);
  const terrain              = useSiteStore((s) => s.terrain);
  const geo                  = useSiteStore((s) => s.geo);
  const showRoads            = useSiteStore((s) => s.showRoads);
  const toggleRoads          = useSiteStore((s) => s.toggleRoads);
  const setGeoOverride       = useSiteStore((s) => s.setGeoOverride);
  const overlayLayers        = useSiteStore((s) => s.overlayLayers);
  const hasRoads             = overlayLayers.some(l => l.isRoad);

  // Hiện style options khi đang ở mode contour HOẶC khi overlay bật
  const showContourStyle    = mode === 'contour' || showContourOverlay;
  // Hiện slider khoảng đều khi ở mode contour HOẶC khi overlay đang bật
  const showIntervalSlider  = mode === 'contour' || showContourOverlay;

  return (
    <div className="space-y-3">
      <Slider label="Tháng"      value={env.month}         min={1}    max={12}  step={1}
        onChange={(v) => setEnv({ month: v })} />
      <Slider label="Giờ"        value={env.hour}          min={0}    max={23}  step={1}   suffix="h"
        onChange={(v) => setEnv({ hour: v })} />
      <Slider label="Hướng Bắc"  value={env.northRotation} min={-180} max={180} step={1}   suffix="°"
        onChange={(v) => setEnv({ northRotation: v })} />
      <Slider label="Hướng gió"  value={env.windDirection} min={0}    max={359} step={1}   suffix="°"
        onChange={(v) => setEnv({ windDirection: v })} />
      <Slider label="Vĩ độ"      value={env.latitude}      min={8}    max={24}  step={0.1} suffix="°N"
        onChange={(v) => setEnv({ latitude: v })} />

      {/* ── Vị trí địa lý: tự phát hiện hoặc chọn thủ công ── */}
      {terrain && (
        <div className="space-y-1.5">
          {geo ? (
            <div className="flex items-start gap-2 px-2 py-1.5 rounded-md bg-accent-teal/10 border border-accent-teal/30">
              <MapPin size={12} className="text-accent-teal mt-0.5 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="text-[11px] font-semibold text-accent-teal truncate">{geo.province}</div>
                <div className="text-[10px] text-slate-400 leading-tight">
                  Vùng KH: {geo.climateLabel} &nbsp;·&nbsp;
                  {geo.lat.toFixed(2)}°N, {geo.lon.toFixed(2)}°E
                </div>
                {geo.composedOf && (
                  <div className="text-[10px] text-slate-500 italic leading-tight">
                    {geo.composedOf}
                  </div>
                )}
              </div>
              <button
                onClick={() => setGeoOverride(null)}
                title="Xoá lựa chọn để tự phát hiện lại"
                className="text-[10px] text-slate-500 hover:text-slate-300 transition shrink-0"
              >
                ✕
              </button>
            </div>
          ) : (
            <div className="text-[10px] text-amber-400/80 px-1 leading-tight">
              ⚠ Không nhận dạng được toạ độ VN-2000 (file CAD đã re-center về 0,0).
              Chọn tỉnh bên dưới để app dùng đúng vĩ độ + khí hậu địa phương.
            </div>
          )}
          <select
            value={geo?.province ?? ''}
            onChange={(e) => setGeoOverride(e.target.value || null)}
            className="w-full px-2 py-1.5 rounded-md bg-bg-card border border-white/10
                       text-[11px] text-slate-200 outline-none hover:border-accent-teal/40
                       focus:border-accent-teal transition"
          >
            <option value="">— Chọn tỉnh thủ công (34 ĐVHC sau sáp nhập) —</option>
            {PROVINCES.map(p => (
              <option key={p.name} value={p.name}>
                {p.name}{p.composedOf ? ` (${p.composedOf})` : ''}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* ── Toggle đường đồng mức overlay — luôn hiện khi có terrain ── */}
      {terrain && (
        <div className="pt-1 border-t border-white/5">
          <button
            onClick={toggleContourOverlay}
            className={`w-full flex items-center justify-center gap-2 py-2 rounded-md
                        text-xs font-bold uppercase tracking-wider border transition
                        ${showContourOverlay
                          ? 'bg-accent-teal/20 border-accent-teal text-accent-teal'
                          : 'bg-bg-card border-white/10 text-slate-400 hover:border-accent-teal/40 hover:text-slate-200'}`}
          >
            <Layers size={13} />
            {showContourOverlay ? 'Ẩn đường đồng mức' : 'Hiện đường đồng mức'}
          </button>
        </div>
      )}

      {/* ── Toggle giao thông hiện trạng ── */}
      {terrain && hasRoads && (
        <div className="pt-1">
          <button
            onClick={toggleRoads}
            className={`w-full flex items-center justify-center gap-2 py-2 rounded-md
                        text-xs font-bold uppercase tracking-wider border transition
                        ${showRoads
                          ? 'bg-yellow-400/15 border-yellow-400/50 text-yellow-300'
                          : 'bg-bg-card border-white/10 text-slate-400 hover:border-yellow-400/30 hover:text-slate-200'}`}
          >
            <Route size={13} />
            {showRoads ? 'Ẩn giao thông' : 'Hiện giao thông'}
          </button>
        </div>
      )}

      {/* ── Nguồn đường đồng mức: CAD gốc vs tự tính ── */}
      {showContourStyle && terrain && (
        <div className="space-y-1.5 pt-1 border-t border-white/5">
          <div className="text-[10px] uppercase tracking-wider text-slate-500">
            Nguồn đường đồng mức
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setEnv({ useOriginalContours: true })}
              className={`flex-1 py-1.5 rounded text-[11px] font-semibold transition border
                ${env.useOriginalContours
                  ? 'bg-accent-teal/20 border-accent-teal text-accent-teal'
                  : 'bg-bg-card border-white/10 text-slate-400 hover:border-white/20'}`}
              title="Dùng đường đồng mức nguyên bản từ file CAD (trung thực)"
            >
              Từ CAD gốc
            </button>
            <button
              onClick={() => setEnv({ useOriginalContours: false })}
              className={`flex-1 py-1.5 rounded text-[11px] font-semibold transition border
                ${!env.useOriginalContours
                  ? 'bg-accent-teal/20 border-accent-teal text-accent-teal'
                  : 'bg-bg-card border-white/10 text-slate-400 hover:border-white/20'}`}
              title="Tự tính từ địa hình theo khoảng đồng mức tuỳ chỉnh"
            >
              Tự tính
            </button>
          </div>
          {env.useOriginalContours && (
            <div className="text-[10px] text-slate-500 leading-tight">
              {terrain.contours.length} đường đồng mức nguyên bản từ DXF
            </div>
          )}
        </div>
      )}

      {/* ── Khoảng đồng mức (chỉ khi tự tính) ── */}
      {showIntervalSlider && !env.useOriginalContours && (
        <Slider label="Khoảng đồng mức" value={env.contourInterval} min={1} max={20} step={1} suffix="m"
          onChange={(v) => setEnv({ contourInterval: v })} />
      )}
      {mode === 'hydrology' && (
        <Slider label="Mật độ mũi tên" value={env.flowArrowDensity} min={0.5} max={4} step={0.5} suffix="x"
          onChange={(v) => setEnv({ flowArrowDensity: v })} />
      )}

      {/* ── Đơn vị độ dốc ── */}
      {mode === 'slope' && (
        <div className="space-y-1.5 pt-1 border-t border-white/5">
          <div className="text-[10px] uppercase tracking-wider text-slate-500">
            Đơn vị phân loại
          </div>
          <div className="flex gap-2">
            {(['degree', 'percent'] as SlopeClassMode[]).map((m) => (
              <button
                key={m}
                onClick={() => setSlopeMode(m)}
                className={`flex-1 py-1.5 rounded text-[11px] font-semibold transition border
                  ${slopeMode === m
                    ? 'bg-accent-teal/20 border-accent-teal text-accent-teal'
                    : 'bg-bg-card border-white/10 text-slate-400 hover:border-white/20'}`}
              >
                {m === 'degree' ? 'Góc (°) — 6 lớp' : 'Phần trăm (%) — QH VN'}
              </button>
            ))}
          </div>
          {slopeMode === 'percent' && (
            <div className="text-[10px] text-slate-500 leading-tight">
              0–10% / 10–20% / 20–30% / &gt;30%<br />
              Chuẩn GIS quy hoạch Việt Nam
            </div>
          )}
        </div>
      )}

      {/* ── Tùy chọn màu đường đồng mức ── */}
      {showContourStyle && (
        <div className="space-y-2 pt-1 border-t border-white/5">
          <div className="text-[10px] uppercase tracking-wider text-slate-500">
            Màu đường đồng mức
          </div>

          {/* Radio: elevation / single */}
          <div className="flex gap-2">
            {(['elevation', 'single'] as const).map((m) => (
              <button
                key={m}
                onClick={() => setEnv({ contourColorMode: m })}
                className={`flex-1 py-1.5 rounded text-[11px] font-semibold transition border
                  ${env.contourColorMode === m
                    ? 'bg-accent-teal/20 border-accent-teal text-accent-teal'
                    : 'bg-bg-card border-white/10 text-slate-400 hover:border-white/20'}`}
              >
                {m === 'elevation' ? 'Theo cao độ' : 'Đơn màu'}
              </button>
            ))}
          </div>

          {/* Color picker — chỉ hiện khi chọn đơn màu */}
          {env.contourColorMode === 'single' && (
            <div className="flex items-center gap-3">
              <label className="text-[11px] text-slate-400 flex-1">Chọn màu</label>
              <div className="flex items-center gap-2">
                {/* Preset nhanh */}
                {['#ffffff', '#000000', '#ffff00', '#ff4444', '#44aaff'].map((hex) => (
                  <button
                    key={hex}
                    onClick={() => setEnv({ contourSingleColor: hex })}
                    title={hex}
                    className="w-5 h-5 rounded-sm border-2 transition"
                    style={{
                      background: hex,
                      borderColor: env.contourSingleColor === hex ? '#2dd4bf' : 'transparent',
                    }}
                  />
                ))}
                {/* Color picker tự do */}
                <label className="cursor-pointer" title="Màu tùy chỉnh">
                  <span
                    className="block w-5 h-5 rounded-sm border border-white/30"
                    style={{ background: env.contourSingleColor }}
                  />
                  <input
                    type="color"
                    value={env.contourSingleColor}
                    onChange={(e) => setEnv({ contourSingleColor: e.target.value })}
                    className="w-0 h-0 opacity-0 absolute"
                  />
                </label>
              </div>
            </div>
          )}

          {/* Opacity slider */}
          <Slider
            label="Độ mờ đường"
            value={Math.round(env.contourOpacity * 100)}
            min={10} max={100} step={5} suffix="%"
            onChange={(v) => setEnv({ contourOpacity: v / 100 })}
          />
        </div>
      )}

      {/* ── Grid toggle ── */}
      <div className="pt-1 border-t border-white/5">
        <button
          onClick={toggleGrid}
          className={`w-full flex items-center justify-center gap-2 py-2 rounded-md
                      text-xs font-bold uppercase tracking-wider border transition
                      ${showGrid
                        ? 'bg-white/5 border-white/20 text-slate-300'
                        : 'bg-bg-card border-white/5 text-slate-500'}`}
        >
          <Grid3x3 size={13} />
          {showGrid ? 'Ẩn lưới nền' : 'Hiện lưới nền'}
        </button>
      </div>
    </div>
  );
}

function Slider({
  label, value, min, max, step, suffix = '', onChange,
}: {
  label: string; value: number; min: number; max: number; step: number; suffix?: string;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="flex justify-between text-[11px] uppercase tracking-wider text-slate-400">
        <span>{label}</span>
        <span className="text-accent-teal font-mono">{value}{suffix}</span>
      </div>
      <input
        type="range" className="slider mt-1"
        value={value} min={min} max={max} step={step}
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
    </div>
  );
}
