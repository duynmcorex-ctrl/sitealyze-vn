import { useSiteStore } from '../../store/useSiteStore';
import { getSlopeClasses } from '../../lib/analysis/slope';
import { SUITABILITY_CLASSES } from '../../lib/analysis/suitability';
import { ELEV_PALETTE_HEX } from '../../lib/analysis/elevationPalette';
import { RoadsLegend } from '../Scene/RoadsRender';
import { LANDUSE_DISPLAY_COLOR, LANDUSE_LABEL } from '../../lib/dxf/parseLanduse';

export function Legend() {
  const mode    = useSiteStore((s) => s.mode);
  const terrain = useSiteStore((s) => s.terrain);
  const hide    = useSiteStore((s) => s.hideOverlay);
  const baseMSL = useSiteStore((s) => s.env.baseMSL);
  const slopeMode = useSiteStore((s) => s.slopeMode);
  const showAllPeaks = useSiteStore((s) => s.showAllPeakElevations);
  const toggleAllPeaks = useSiteStore((s) => s.toggleAllPeakElevations);
  const report = useSiteStore((s) => s.report);
  const toggleReportPanel = useSiteStore((s) => s.toggleReportPanel);
  if (!terrain || hide) return null;

  // Section nhận xét tương ứng với mode đang chọn (đã build trong setMode)
  const section = report?.sections.find((s) => s.id === mode);

  let content: React.ReactNode = null;
  let title = '';
  switch (mode) {
    case 'elevation':
      title = 'Phân tích cao độ';
      content = (
        <ElevationSteps
          min={terrain.heightmap.minZ + baseMSL}
          max={terrain.heightmap.maxZ + baseMSL}
        />
      );
      break;
    case 'contour':
      title = 'Đường đồng mức';
      content = (
        <div className="space-y-1.5 text-xs text-slate-200">
          <div className="flex items-center gap-2">
            <span className="w-5 h-3 rounded-sm flex-shrink-0" style={{ background: '#d4cfc1' }} />
            <span>Nền địa hình</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-5 h-0.5 rounded flex-shrink-0" style={{ background: '#22d3c5' }} />
            <span>Đường đồng mức</span>
          </div>
          <div className="text-[10px] text-slate-500 pt-0.5">
            Dải cao độ: {(terrain.heightmap.minZ + baseMSL).toFixed(1)} – {(terrain.heightmap.maxZ + baseMSL).toFixed(1)} m
            {baseMSL !== 0 && <span className="text-accent-teal"> (+{baseMSL}m)</span>}
          </div>
        </div>
      );
      break;
    case 'slope':
      title = `Phân tích độ dốc (${slopeMode === 'percent' ? '%' : '°'})`;
      content = (
        <Swatches items={getSlopeClasses(slopeMode).map((c) => ({ color: c.color, label: c.label }))} />
      );
      break;
    case 'features':
      title = 'Điểm đặc trưng';
      content = (
        <div className="space-y-2">
          <div className="space-y-1.5 text-xs text-slate-200">
            <div className="flex items-center gap-2">
              {/* Pin icon nhỏ */}
              <svg viewBox="0 0 32 44" width="14" height="20">
                <path d="M16 1C8.27 1 2 7.27 2 15c0 5.5 3.2 10.3 7.8 14.2L16 43l6.2-13.8C26.8 25.3 30 20.5 30 15 30 7.27 23.73 1 16 1z"
                  fill="#f59e0b" stroke="white" strokeWidth="2"/>
                <circle cx="16" cy="14" r="6.5" fill="white" opacity="0.9"/>
              </svg>
              <span>Đỉnh #1 (cao nhất)</span>
            </div>
            <div className="flex items-center gap-2">
              <svg viewBox="0 0 32 44" width="14" height="20">
                <path d="M16 1C8.27 1 2 7.27 2 15c0 5.5 3.2 10.3 7.8 14.2L16 43l6.2-13.8C26.8 25.3 30 20.5 30 15 30 7.27 23.73 1 16 1z"
                  fill="#ef4444" stroke="white" strokeWidth="2"/>
                <circle cx="16" cy="14" r="6.5" fill="white" opacity="0.9"/>
              </svg>
              <span>Đỉnh núi — click để xem cao độ</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3.5 h-3.5 rounded-sm flex-shrink-0" style={{background:'#3b82f6'}}/>
              <span>Đáy thung lũng</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3.5 h-3.5 rounded-sm flex-shrink-0" style={{background:'#fb923c'}}/>
              <span>Sống núi (vùng lồi)</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3.5 h-3.5 rounded-sm flex-shrink-0" style={{background:'#1e40af'}}/>
              <span>Đường tụ thủy (vùng lõm)</span>
            </div>
          </div>
          <button
            onClick={toggleAllPeaks}
            className={`w-full mt-1 py-1.5 rounded text-[11px] font-semibold border transition
              ${showAllPeaks
                ? 'bg-amber-500/20 border-amber-400/60 text-amber-300'
                : 'bg-white/5 border-white/10 text-slate-400 hover:border-white/20 hover:text-slate-200'}`}
          >
            {showAllPeaks ? '▲ Ẩn tất cả cao độ' : '▲ Hiện tất cả cao độ'}
          </button>
        </div>
      );
      break;
    case 'suitability':
      title = 'Đánh giá đất xây dựng';
      content = (
        <Swatches items={SUITABILITY_CLASSES.map((c) => ({ color: c.color, label: c.label }))} />
      );
      break;
    case 'hydrology':
      title = 'Phân tích thủy văn';
      content = (
        <div className="space-y-1.5 text-xs text-slate-200">
          {/* Gradient tích tụ nước — thấp → cao */}
          <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Mức tích tụ nước</div>
          <div className="flex items-center gap-2">
            <div className="w-24 h-3 rounded-sm flex-shrink-0" style={{
              background: 'linear-gradient(to right, #d8eeff, #2563eb)',
            }} />
            <span className="text-[10px] text-slate-400">Thấp → Cao</span>
          </div>
          <div className="flex justify-between text-[10px] text-slate-500 w-24 pl-0">
            <span>Mặt sườn</span>
            <span>Suối</span>
          </div>
          {/* Arrows */}
          <div className="flex items-center gap-2 pt-1">
            <svg width="22" height="10" viewBox="0 0 22 10">
              <line x1="1" y1="5" x2="15" y2="5" stroke="#38bdf8" strokeWidth="2.5"/>
              <polygon points="15,1 22,5 15,9" fill="#38bdf8"/>
            </svg>
            <span>Hướng dòng chảy</span>
          </div>
        </div>
      );
      break;
    case 'sun':
      title = 'Phân tích bóng đổ';
      content = <div className="text-xs text-slate-400">Dùng tham số tháng + giờ + vĩ độ.</div>;
      break;
    case 'wind':
      title = 'Mô phỏng gió';
      content = <div className="text-xs text-slate-400">Dùng tham số hướng + tốc độ gió.</div>;
      break;
    case 'viewshed':
      title = 'Phân tích tầm nhìn';
      content = (
        <Swatches items={[
          { color: '#65d984', label: 'Vùng nhìn thấy' },
          { color: '#1f2937', label: 'Vùng bị che khuất' },
        ]} />
      );
      break;
    case 'roads':
      title = 'Giao thông hiện trạng';
      content = <RoadsLegend />;
      break;
    case 'landuse':
      title = 'Quy hoạch sử dụng đất';
      content = <LanduseLegend />;
      break;
  }

  return (
    <div className="absolute bottom-4 left-4 panel rounded-lg p-3 min-w-[240px] max-w-sm max-h-[70vh] overflow-y-auto">
      <div className="text-[11px] font-bold uppercase tracking-wider text-accent-teal mb-2">{title}</div>
      {content}

      {/* ── Inline comments: notes + recommendations từ report section ── */}
      {section && (section.notes.length > 0 || (section.recommendations?.length ?? 0) > 0) && (
        <div className="mt-3 pt-2.5 border-t border-white/10 space-y-2">
          {/* Summary (nếu có) */}
          {section.summary && (
            <div className="text-[10px] text-slate-300 leading-snug italic">
              {section.icon && <span className="mr-1">{section.icon}</span>}
              {section.summary}
            </div>
          )}

          {/* Metrics đã có sẵn ở section.metrics — hiện 2-3 cái nổi bật */}
          {section.metrics.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {section.metrics.slice(0, 4).map((m, i) => (
                <span
                  key={i}
                  className={`px-1.5 py-0.5 rounded text-[9px] font-mono border ${
                    m.emphasis === 'good' ? 'bg-emerald-500/10 border-emerald-400/40 text-emerald-300' :
                    m.emphasis === 'warn' ? 'bg-amber-500/10 border-amber-400/40 text-amber-300' :
                    m.emphasis === 'bad'  ? 'bg-red-500/10 border-red-400/40 text-red-300' :
                                            'bg-bg-card border-white/10 text-slate-300'
                  }`}
                  title={m.label}
                >
                  <span className="text-slate-500 font-normal">{m.label}: </span>
                  {m.value}
                </span>
              ))}
            </div>
          )}

          {/* Notes (bullet) */}
          {section.notes.length > 0 && (
            <ul className="space-y-1 text-[10px] text-slate-300 leading-snug list-disc pl-3.5">
              {section.notes.slice(0, 5).map((note, i) => (
                <li key={i}>{note}</li>
              ))}
            </ul>
          )}

          {/* Recommendations (highlight box) */}
          {(section.recommendations?.length ?? 0) > 0 && (
            <div className="px-2 py-1.5 rounded bg-accent-teal/10 border border-accent-teal/30">
              <div className="text-[9px] uppercase tracking-wider text-accent-teal font-bold mb-1">
                💡 Khuyến nghị
              </div>
              <ul className="space-y-0.5 text-[10px] text-slate-200 leading-snug list-disc pl-3">
                {section.recommendations!.slice(0, 3).map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Link mở full report */}
          <button
            onClick={toggleReportPanel}
            className="w-full text-[9px] uppercase tracking-wider text-slate-500 hover:text-accent-teal transition py-0.5"
          >
            Xem báo cáo đầy đủ →
          </button>
        </div>
      )}
    </div>
  );
}

function Swatches({ items }: { items: { color: string; label: string }[] }) {
  return (
    <div className="space-y-1.5">
      {items.map((it) => (
        <div key={it.label} className="flex items-center gap-2 text-xs text-slate-200">
          <span className="w-4 h-4 rounded" style={{ background: it.color }} />
          <span>{it.label}</span>
        </div>
      ))}
    </div>
  );
}

function ElevationSteps({ min, max }: { min: number; max: number }) {
  const range = max - min;
  const steps = ELEV_PALETTE_HEX.length; // 10
  // Build 10 items from high → low (palette index 9 = highest = last)
  const items = ELEV_PALETTE_HEX.map((color, idx) => {
    const zLow  = min + (idx / steps) * range;
    const zHigh = min + ((idx + 1) / steps) * range;
    return { color, label: `${zLow.toFixed(1)} – ${zHigh.toFixed(1)} m` };
  });
  return (
    <div className="space-y-0.5 max-h-64 overflow-y-auto pr-1">
      {[...items].reverse().map((it) => (
        <div key={it.label} className="flex items-center gap-2 text-[11px] text-slate-200 font-mono">
          <span
            className="w-5 h-3.5 rounded-sm flex-shrink-0"
            style={{ background: it.color }}
          />
          <span>{it.label}</span>
        </div>
      ))}
      <div className="text-[9px] text-slate-500 pt-0.5 leading-tight">
        Màu tương đối với địa hình (10 bước đều)
      </div>
    </div>
  );
}

function LanduseLegend() {
  const landuse = useSiteStore((s) => s.landuse);
  if (!landuse || landuse.parcels.length === 0) {
    return (
      <div className="text-xs text-slate-400 italic">
        Tải file CAD QH ở mục "Quy hoạch sử dụng đất" để hiển thị bản đồ.
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <div className="text-[11px] text-slate-300">
        {landuse.parcels.length} ô đất · {(landuse.totalAreaSqm / 10000).toFixed(2)} ha
      </div>
      <div className="space-y-1 max-h-72 overflow-y-auto pr-1">
        {landuse.byType.map((b) => (
          <div key={b.type} className="flex items-center gap-2 text-[11px] text-slate-200">
            <span
              className="w-4 h-4 rounded-sm flex-shrink-0 border border-white/15"
              style={{ background: LANDUSE_DISPLAY_COLOR[b.type] }}
            />
            <span className="flex-1 min-w-0 truncate" title={LANDUSE_LABEL[b.type]}>
              {LANDUSE_LABEL[b.type]}
            </span>
            <span className="text-slate-500 tabular-nums text-[10px]">
              {b.pct.toFixed(1)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
