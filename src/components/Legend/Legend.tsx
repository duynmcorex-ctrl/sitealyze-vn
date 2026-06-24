import { useSiteStore } from '../../store/useSiteStore';
import { Waves } from 'lucide-react';
import { getSlopeClasses } from '../../lib/analysis/slope';
import { SUITABILITY_CLASSES } from '../../lib/analysis/suitability';
import { ELEV_PALETTE_HEX, ELEV_PALETTE_SMALL_HEX, SMALL_RANGE_THRESHOLD_M } from '../../lib/analysis/elevationPalette';
import { RoadsLegend } from '../Scene/RoadsRender';
import { LANDUSE_DISPLAY_COLOR, LANDUSE_LABEL } from '../../lib/dxf/parseLanduse';
import { WINDY_STOPS } from '../Scene/WindParticlesV2';
import { WindRose } from '../Sidebar/WindRose';

/** Legend mode='wind' — compass hướng (tái dùng WindRose) + thang màu tốc độ kiểu Windy.com */
function WindLegend() {
  const env = useSiteStore((s) => s.env);
  const maxKt = WINDY_STOPS[WINDY_STOPS.length - 1][0];
  return (
    <div className="space-y-2">
      <div className="flex justify-center">
        <WindRose dirDeg={env.windDirection} speedMs={env.windSpeed} size={110} />
      </div>
      <div className="text-center text-[11px] text-slate-300 font-mono">
        {env.windDirection}° · {env.windSpeed.toFixed(1)} m/s
      </div>
      <div>
        <div className="text-[9px] uppercase tracking-wider text-slate-500 mb-1">Tốc độ (màu streak)</div>
        <div
          className="h-2.5 rounded-sm w-full"
          style={{
            background: `linear-gradient(to right, ${WINDY_STOPS.map(
              ([kt, [r, g, b]]) => `rgb(${r},${g},${b}) ${(kt / maxKt) * 100}%`,
            ).join(', ')})`,
          }}
        />
        <div className="flex justify-between text-[9px] text-slate-500 font-mono mt-0.5">
          <span>0 kt</span>
          <span>~{Math.round(maxKt / 2)} kt</span>
          <span>{maxKt} kt</span>
        </div>
      </div>
      <div className="text-[9.5px] text-slate-500 leading-snug">
        Streak: đuôi mờ → đầu sáng = chiều gió. Địa hình ảnh hưởng tốc độ cục bộ
        (xuôi dốc nhanh hơn, ngược dốc chậm hơn).
      </div>
    </div>
  );
}

/** Gradient bar + step labels cho rainbow/topographic mode — giống topographic-map.com */
function RainbowElevationBar({ min, max }: { min: number; max: number }) {
  const range = max - min;
  // Tạo 12 bước đều nhau (từ cao xuống thấp)
  const steps = 12;
  const stepSize = range / steps;
  const labels: number[] = [];
  for (let i = steps; i >= 0; i--) {
    labels.push(Math.round(min + i * stepSize));
  }
  // Màu gradient: high(đỏ) → mid(vàng) → low(xanh) — giống topo
  const gradientColors = 'linear-gradient(to bottom, #aa1111, #e05500, #f5b800, #aacc44, #2a8a6e, #1a4fcc)';

  return (
    <div className="flex gap-2 items-stretch">
      {/* Gradient bar */}
      <div
        className="w-5 rounded-sm flex-shrink-0"
        style={{ background: gradientColors, minHeight: 180 }}
      />
      {/* Labels */}
      <div className="flex flex-col justify-between text-[9.5px] font-mono text-slate-300 py-0.5">
        {labels.map((v) => (
          <span key={v} className="leading-none">{v} m</span>
        ))}
      </div>
    </div>
  );
}

export function Legend() {
  const mode    = useSiteStore((s) => s.mode);
  const terrain = useSiteStore((s) => s.terrain);
  const hide    = useSiteStore((s) => s.hideOverlay);
  const showFlood3D   = useSiteStore((s) => s.showFlood3D);
  const waterLevel3D  = useSiteStore((s) => s.waterLevel3D);
  const toggleFlood3D = useSiteStore((s) => s.toggleFlood3D);
  // baseMSL đã bỏ khỏi UI — luôn hiển thị cao độ TUYỆT ĐỐI từ file
  const baseMSL = 0;
  const slopeMode = useSiteStore((s) => s.slopeMode);
  const showAllPeaks = useSiteStore((s) => s.showAllPeakElevations);
  const toggleAllPeaks = useSiteStore((s) => s.toggleAllPeakElevations);
  const elevColorMode = useSiteStore((s) => s.elevColorMode);
  const analysis = useSiteStore((s) => s.analysis);
  if (!terrain || hide) return null;

  // Neo theo dải cao độ GỐC (originalMinZ/Max) — khớp với TerrainMesh.tsx, để legend
  // không đổi số khi user bật/tắt clip boundary (tránh lệch màu giữa các góc nhìn).
  const zMin = terrain.heightmap.originalMinZ ?? terrain.heightmap.minZ;
  const zMax = terrain.heightmap.originalMaxZ ?? terrain.heightmap.maxZ;

  let content: React.ReactNode = null;
  let title = '';
  switch (mode) {
    case 'elevation':
      title = 'Phân tích cao độ';
      content = elevColorMode === 'rainbow'
        ? <RainbowElevationBar min={zMin + baseMSL} max={zMax + baseMSL} />
        : <ElevationSteps min={zMin + baseMSL} max={zMax + baseMSL} />;
      break;
    case 'contour':
      title = 'Đường đồng mức';
      content = (
        <div className="space-y-1.5 text-xs text-slate-200">
          {/* Nền dùng cùng bảng màu cao độ → chỉ chú thích đường đồng mức */}
          <div className="flex items-center gap-2">
            <span className="w-5 h-0.5 rounded flex-shrink-0" style={{ background: '#22d3c5' }} />
            <span>Đường đồng mức</span>
          </div>
          <div className="text-[10px] text-slate-500 pt-0.5">
            Dải cao độ: {zMin.toFixed(1)} – {zMax.toFixed(1)} m
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
    case 'sunExposure': {
      const se = analysis.sunExposure;
      title = 'Phân vùng nắng theo giờ';
      content = se ? (
        <div className="space-y-1.5">
          <Swatches items={[
            { color: '#f97316', label: `Nắng nhiều (≥70% ngày) · ${se.classArea.high.toFixed(0)}%` },
            { color: '#fbbf24', label: `Nắng vừa (30-70% ngày) · ${se.classArea.medium.toFixed(0)}%` },
            { color: '#3b4a6b', label: `Ít/không nắng (<30% ngày) · ${se.classArea.low.toFixed(0)}%` },
          ]} />
          <div className="text-[10px] text-slate-500 pt-1 leading-snug">
            Trung bình {se.meanHours.toFixed(1)}h nắng/{se.maxPossibleHours}h ngày
            (sample {se.sampledHours.join('h, ')}h). Đã tính bóng đổ địa hình.
          </div>
        </div>
      ) : (
        <div className="text-xs text-slate-400">Đang tính… (lần đầu có thể mất vài giây)</div>
      );
      break;
    }
    case 'wind':
      title = 'Mô phỏng gió';
      content = <WindLegend />;
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

      {/* ── Flood indicator — hiện khi showFlood3D đang bật ── */}
      {showFlood3D && terrain && (
        <div className="mt-2 pt-2 border-t border-blue-400/20 flex items-center gap-2">
          <Waves size={11} className="text-blue-400 shrink-0" />
          <div className="flex-1 text-[10px]">
            <span className="text-blue-300 font-bold">{waterLevel3D.toFixed(1)} m</span>
            <span className="text-slate-500 ml-1">
              (+{Math.max(0, waterLevel3D - terrain.heightmap.minZ).toFixed(1)} m trên đáy)
            </span>
          </div>
          <button
            onClick={toggleFlood3D}
            className="text-[9px] text-blue-400/60 hover:text-blue-300 transition"
            title="Tắt mô phỏng ngập"
          >✕</button>
        </div>
      )}

      {/* Nhận xét chi tiết đã chuyển vào Sidebar Mục 2 — Đánh giá hiện trạng */}
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

  // Địa hình phẳng: không có thông tin cao độ
  if (range < 0.1) {
    return (
      <div className="space-y-1.5">
        <div className="flex items-center gap-2 text-[11px] text-slate-200">
          <span className="w-5 h-3.5 rounded-sm flex-shrink-0" style={{ background: '#9ca3af' }} />
          <span>Đồng phẳng Z ≈ {min.toFixed(1)} m</span>
        </div>
        <div className="text-[9px] text-amber-400/80 leading-tight px-0.5">
          ⚠ File CAD chưa có cao độ (Z=0). Nhập "Cao độ gốc (MSL)" ở mục Tham số để hiển thị đúng,
          hoặc đảm bảo DXF có nhãn TEXT cao độ trên đường đồng mức.
        </div>
      </div>
    );
  }

  // Địa hình có dải cao độ nhỏ (<10m): dùng palette đất tự nhiên, thêm note
  const palette = range < SMALL_RANGE_THRESHOLD_M ? ELEV_PALETTE_SMALL_HEX : ELEV_PALETTE_HEX;

  // Build 10 items matching mesh vertex colors
  const items = palette.map((color, idx) => {
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
        Màu tương đối trong phạm vi địa hình
        {range < SMALL_RANGE_THRESHOLD_M && (
          <span className="block text-amber-400/70 mt-0.5">
            ⚡ Dải cao độ nhỏ ({range.toFixed(1)} m) — dùng tông xanh–nâu
          </span>
        )}
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
