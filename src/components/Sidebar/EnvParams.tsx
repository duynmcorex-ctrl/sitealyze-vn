import { Grid3x3, Layers, MapPin, Route, Trees, Wind, RotateCcw, Navigation } from 'lucide-react';
import { useRef, useState } from 'react';
import { useSiteStore } from '../../store/useSiteStore';
import type { SlopeClassMode } from '../../lib/analysis/slope';
import { PROVINCES } from '../../lib/coord/provinces';
import { SURFACE_LABEL, SURFACE_COLOR, ROLE_LABEL } from '../../lib/analysis/roadClassify';
import { getWindClimate, getRainfallClimate, climateZoneDescription } from '../../lib/analysis/climatology';
import { parseLocationFile } from '../../lib/coord/parseKml';
import { findProvince } from '../../lib/coord/provinces';
import type { RoadSurface } from '../../lib/types';

/** Quy đổi góc khí tượng (từ đó gió thổi tới) → tên hướng tiếng Việt */
function dirLabel(deg: number): string {
  const dirs = ['Bắc', 'ĐB', 'Đông', 'ĐN', 'Nam', 'TN', 'Tây', 'TB'];
  return dirs[Math.round(((deg % 360) + 360) % 360 / 45) % 8];
}

export function EnvParams() {
  const env                  = useSiteStore((s) => s.env);
  const setEnv               = useSiteStore((s) => s.setEnv);
  const mode                 = useSiteStore((s) => s.mode);
  const kmzRef               = useRef<HTMLInputElement>(null);
  const [kmzMsg, setKmzMsg]  = useState<string | null>(null);
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
  const setGeoExact          = useSiteStore((s) => s.setGeoExact);
  const overlayLayers        = useSiteStore((s) => s.overlayLayers);
  const hasRoads             = overlayLayers.some(l => l.isRoad);
  const hasTrees             = overlayLayers.some(l => l.isTree && (l.treePoints?.length ?? 0) > 0);
  const roadLayers           = overlayLayers.filter(l => l.isRoad && l.visible);

  // Địa hình phẳng: Z biến thiên < 1m → chỉ dùng cho cảnh báo baseMSL (không còn rebuild UI)
  const isFlat = terrain
    ? Math.abs(terrain.heightmap.maxZ - terrain.heightmap.minZ) < 1
    : false;

  /** Xử lý KMZ / KML upload để tự động đặt vị trí dự án */
  const handleKmzFile = async (file: File) => {
    setKmzMsg('Đang đọc file…');
    try {
      const loc = await parseLocationFile(file);
      if (!loc) {
        setKmzMsg('⚠ Không tìm thấy toạ độ trong file. Thử xuất KML từ Google Earth.');
        return;
      }
      // lat/lon → province
      const foundGeo = findProvince(loc.lat, loc.lon);
      if (foundGeo) {
        // Dùng toạ độ THẬT từ KML, không suy ra từ tâm bbox tỉnh (setGeoOverride) — tránh sai vị trí
        setGeoExact({ ...foundGeo, lat: loc.lat, lon: loc.lon });
        setKmzMsg(`✓ Phát hiện: ${foundGeo.province} (${loc.lat.toFixed(3)}°N, ${loc.lon.toFixed(3)}°E)`);
      } else {
        // Không có tỉnh → ít nhất gán vĩ độ
        setEnv({ latitude: Math.round(loc.lat * 10) / 10 });
        setKmzMsg(`✓ Toạ độ: ${loc.lat.toFixed(3)}°N, ${loc.lon.toFixed(3)}°E (chưa xác định tỉnh)`);
      }
    } catch (e) {
      setKmzMsg(`⚠ Lỗi: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  // Hiện style options khi đang ở mode contour HOẶC khi overlay bật
  const showContourStyle    = mode === 'contour' || showContourOverlay;
  // Hiện slider khoảng đều khi ở mode contour HOẶC khi overlay đang bật
  const showIntervalSlider  = mode === 'contour' || showContourOverlay;

  // Khí hậu theo tỉnh đã phát hiện
  const climateWind     = geo ? getWindClimate(geo.climateZone, env.month) : null;
  const climateRainfall = geo ? getRainfallClimate(geo.climateZone) : null;
  const climateDesc     = geo ? climateZoneDescription(geo.climateZone) : null;

  // Kiểm tra xem gió hiện tại có đang khớp với khí hậu không
  const windMatchesClimate = climateWind
    ? Math.abs(env.windDirection - climateWind.dominantDirDeg) < 2 &&
      Math.abs(env.windSpeed - climateWind.avgSpeedMs) < 0.15
    : true;

  return (
    <div className="space-y-3">

      {/* ── Upload KMZ / KML để tự định vị dự án ── */}
      <div className="space-y-1.5">
        <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold flex items-center gap-1">
          <Navigation size={10} /> Định vị từ Google Earth (KMZ/KML)
        </div>
        <button
          onClick={() => kmzRef.current?.click()}
          className="w-full flex items-center justify-center gap-2 py-2 rounded-md text-xs
                     font-bold uppercase bg-bg-card hover:bg-white/10 border border-white/10
                     text-slate-400 hover:text-slate-200 transition"
        >
          📍 Tải file KMZ / KML
        </button>
        <input
          ref={kmzRef} type="file" accept=".kmz,.kml,.KMZ,.KML" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleKmzFile(f); e.target.value = ''; }}
        />
        {kmzMsg && (
          <div className={`text-[10px] leading-snug px-1 ${kmzMsg.startsWith('✓') ? 'text-accent-teal' : 'text-amber-400'}`}>
            {kmzMsg}
          </div>
        )}
        <div className="text-[9px] text-slate-600 leading-tight">
          Export từ Google Earth Pro: File → Save Place As… → KMZ/KML
        </div>
      </div>

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
            <div className="space-y-1 px-1">
              <div className="text-[10px] text-amber-400/80 leading-tight">
                ⚠ Chưa xác định được tỉnh từ toạ độ file CAD.
                Chọn tỉnh bên dưới để app dùng đúng vĩ độ + khí hậu địa phương.
              </div>
              {terrain && (
                <div className="text-[9px] text-slate-500 leading-tight font-mono">
                  Tâm CAD: ({((terrain.bounds.minX + terrain.bounds.maxX) / 2).toFixed(0)},
                  {' '}{((terrain.bounds.minY + terrain.bounds.maxY) / 2).toFixed(0)})
                  <br />
                  → Mở console (F12) xem [VN2000] log để debug
                </div>
              )}
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

      {/* ── Card vi khí hậu địa phương ── */}
      {geo && climateWind && climateRainfall && (
        <div className="rounded-md bg-bg-card border border-white/8 overflow-hidden">
          {/* Header */}
          <div className="px-2.5 py-1.5 border-b border-white/5 flex items-center gap-1.5">
            <Wind size={11} className="text-sky-400 shrink-0" />
            <span className="text-[10px] font-semibold uppercase tracking-wider text-sky-400 flex-1">
              Vi khí hậu · {geo.province.replace('Tỉnh ', '').replace('TP. ', '').replace('Thủ đô ', '')}
            </span>
            {/* Nút reset gió về khí hậu địa phương nếu user đã chỉnh tay */}
            {!windMatchesClimate && (
              <button
                onClick={() => setEnv({ windDirection: climateWind.dominantDirDeg, windSpeed: climateWind.avgSpeedMs })}
                title={`Reset về gió khí hậu: ${climateWind.dominantDirDeg}° / ${climateWind.avgSpeedMs} m/s`}
                className="flex items-center gap-1 text-[9px] text-amber-400/80 hover:text-amber-300 transition shrink-0"
              >
                <RotateCcw size={9} /> Reset gió
              </button>
            )}
          </div>
          {/* Climate data rows */}
          <div className="px-2.5 py-1.5 space-y-1.5 text-[10px]">
            {/* Vùng khí hậu */}
            <div className="flex gap-1 text-slate-400">
              <span className="text-slate-500 shrink-0 w-[76px]">Vùng KH:</span>
              <span className="text-slate-300">{geo.climateLabel}</span>
            </div>
            <div className="flex gap-1 text-slate-400">
              <span className="text-slate-500 shrink-0 w-[76px]">Đặc trưng:</span>
              <span className="text-slate-400 leading-tight">{climateDesc}</span>
            </div>

            {/* Gió tháng hiện tại */}
            <div className="pt-1 border-t border-white/5">
              <div className="flex items-center gap-1">
                {windMatchesClimate
                  ? <span className="px-1 py-0.5 rounded text-[8px] bg-sky-500/20 text-sky-300 font-bold">AUTO ✓</span>
                  : <span className="px-1 py-0.5 rounded text-[8px] bg-amber-500/20 text-amber-300 font-bold">THỦ CÔNG</span>
                }
                <span className="text-slate-300 font-semibold">
                  Gió T{env.month}: {climateWind.label}
                </span>
              </div>
              <div className="flex gap-3 mt-1 pl-0.5">
                <span className="text-slate-400">
                  Hướng: <span className="text-slate-200 font-mono">{climateWind.dominantDirDeg}°</span>
                  <span className="text-slate-600"> ({dirLabel(climateWind.dominantDirDeg)})</span>
                </span>
                <span className="text-slate-400">
                  Tốc độ: <span className="text-slate-200 font-mono">{climateWind.avgSpeedMs} m/s</span>
                </span>
              </div>
            </div>

            {/* Mưa */}
            <div className="pt-1 border-t border-white/5">
              <div className="text-slate-300 font-semibold">Mưa hàng năm</div>
              <div className="flex gap-3 mt-0.5">
                <span className="text-slate-400">TB: <span className="text-slate-200 font-mono">{climateRainfall.annualMm} mm/năm</span></span>
                <span className="text-slate-400">Đỉnh: <span className="text-slate-200">T{climateRainfall.peakMonth}</span></span>
              </div>
              <div className="text-slate-500 mt-0.5 leading-tight">{climateRainfall.label}</div>
              {/* Chỉ báo tháng hiện tại có phải mùa khô không */}
              {climateRainfall.dryMonths.includes(env.month) && (
                <div className="mt-1 px-1.5 py-0.5 rounded bg-yellow-500/15 text-yellow-400 text-[9px]">
                  ☀️ Tháng {env.month} là mùa khô — hạn chế cây trồng, ưu tiên thoát nước tự nhiên
                </div>
              )}
            </div>
          </div>
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
        <div className="pt-1 space-y-1.5">
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

          {/* Thông tin chi tiết từng layer đường */}
          {showRoads && roadLayers.length > 0 && (
            <div className="rounded-md bg-bg-card border border-white/5 overflow-hidden">
              {/* Header */}
              <div className="px-2 py-1 border-b border-white/5 text-[9px] uppercase tracking-wider text-slate-500 flex gap-2">
                <span className="flex-1">Layer</span>
                <span className="w-16 text-right">Mặt đường</span>
                <span className="w-10 text-right">Rộng</span>
              </div>
              {/* Rows */}
              {roadLayers.map(layer => {
                const meta = layer.roadMeta;
                const surface: RoadSurface = meta?.surface ?? 'unknown';
                const entranceCount = meta?.entrancePoints.length ?? 0;
                return (
                  <div key={layer.id} className="px-2 py-1.5 border-b border-white/5 last:border-0">
                    {/* Tên layer + vai trò */}
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span
                        className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
                        style={{ background: SURFACE_COLOR[surface] }}
                      />
                      <span className="text-[10px] text-slate-200 truncate flex-1" title={layer.name}>
                        {layer.name}
                      </span>
                      {meta?.role && meta.role !== 'unknown' && (
                        <span className="text-[9px] text-slate-500 flex-shrink-0">
                          {ROLE_LABEL[meta.role]}
                        </span>
                      )}
                    </div>
                    {/* Surface + width + entrances */}
                    <div className="flex items-center gap-2 pl-4">
                      <span className="text-[10px] text-slate-400 flex-1">
                        {SURFACE_LABEL[surface]}
                      </span>
                      {meta?.estimatedWidthM != null ? (
                        <span className="text-[10px] font-mono text-accent-teal flex-shrink-0">
                          {meta.estimatedWidthM}m
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-600 flex-shrink-0">—</span>
                      )}
                    </div>
                    {/* Lối vào */}
                    {entranceCount > 0 && (
                      <div className="pl-4 mt-0.5 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-orange-400 flex-shrink-0" />
                        <span className="text-[9px] text-orange-300">
                          {entranceCount} lối vào chính
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Cây hiện trạng ── */}
      {terrain && hasTrees && (
        <div className="pt-1 space-y-2">
          <button
            onClick={() => setEnv({ showTrees: !env.showTrees })}
            className={`w-full flex items-center justify-center gap-2 py-2 rounded-md
                        text-xs font-bold uppercase tracking-wider border transition
                        ${env.showTrees
                          ? 'bg-green-500/15 border-green-500/50 text-green-300'
                          : 'bg-bg-card border-white/10 text-slate-400 hover:border-green-500/30 hover:text-slate-200'}`}
          >
            <Trees size={13} />
            {env.showTrees ? 'Ẩn cây hiện trạng' : 'Hiện cây hiện trạng'}
          </button>
          {env.showTrees && (
            <Slider
              label="Chiều cao cây"
              value={env.treeHeight}
              min={2} max={30} step={1} suffix="m"
              onChange={(v) => setEnv({ treeHeight: v })}
            />
          )}
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

      {/* ── Cao độ gốc (baseMSL) — luôn hiện khi có terrain ── */}
      {terrain && (
        <div className="pt-1 border-t border-white/5 space-y-2">
          {isFlat && (
            <div className="px-2 py-1.5 rounded bg-amber-500/10 border border-amber-500/30">
              <div className="text-[10px] text-amber-300 font-semibold mb-0.5">
                ⚠ Địa hình phẳng (Z ≈ 0)
              </div>
              <div className="text-[9px] text-amber-200/70 leading-tight">
                File CAD chưa có cao độ thực. Nhập cao độ gốc để Legend và báo cáo
                hiển thị đúng mực biển trung bình.
              </div>
            </div>
          )}
          <Slider
            label="Cao độ gốc (MSL)"
            value={env.baseMSL}
            min={-10} max={2000} step={1} suffix="m"
            onChange={(v) => setEnv({ baseMSL: v })}
          />
          {env.baseMSL !== 0 && (
            <div className="text-[9px] text-slate-500 leading-tight pl-0.5">
              Legend hiển thị: {(terrain.heightmap.minZ + env.baseMSL).toFixed(1)} – {(terrain.heightmap.maxZ + env.baseMSL).toFixed(1)} m MSL
            </div>
          )}
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
