import { useSiteStore } from '../../store/useSiteStore';
import { getSlopeClasses } from '../../lib/analysis/slope';
import { SUITABILITY_CLASSES } from '../../lib/analysis/suitability';
import { buildElevationLegendItems } from '../../lib/analysis/elevationPalette';

export function Legend() {
  const mode    = useSiteStore((s) => s.mode);
  const terrain = useSiteStore((s) => s.terrain);
  const hide    = useSiteStore((s) => s.hideOverlay);
  const contourInterval = useSiteStore((s) => s.env.contourInterval);
  const slopeMode = useSiteStore((s) => s.slopeMode);
  const showAllPeaks = useSiteStore((s) => s.showAllPeakElevations);
  const toggleAllPeaks = useSiteStore((s) => s.toggleAllPeakElevations);
  if (!terrain || hide) return null;

  let content: React.ReactNode = null;
  let title = '';
  switch (mode) {
    case 'elevation':
    case 'contour':
      title = mode === 'elevation' ? 'Phân tích cao độ' : 'Đường đồng mức';
      content = (
        <ElevationSteps
          min={terrain.heightmap.minZ}
          max={terrain.heightmap.maxZ}
          interval={contourInterval}
        />
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
  }

  return (
    <div className="absolute bottom-4 left-4 panel rounded-lg p-3 min-w-[220px] max-w-xs">
      <div className="text-[11px] font-bold uppercase tracking-wider text-accent-teal mb-2">{title}</div>
      {content}
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

function ElevationSteps({
  min, max, interval,
}: { min: number; max: number; interval: number }) {
  const items = buildElevationLegendItems(min, max, interval);
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
    </div>
  );
}
