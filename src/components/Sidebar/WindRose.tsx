/**
 * WindRose.tsx — Visualization hoa gió 16 hướng cho địa phương.
 *
 * Input: hướng gió thống trị (deg, meteorological) + tốc độ (m/s) + optional
 * data 12 tháng. Vẽ SVG hoa gió + mũi tên hướng.
 *
 * Convention khí tượng: 0° = Bắc, 90° = Đông, 180° = Nam, 270° = Tây.
 * Gió thổi TỪ hướng đó — mũi tên trỏ TỪ ngoài vào tâm.
 */

import { useMemo, useRef, useState } from 'react';
import { Upload, X, Pencil, RotateCcw, Save } from 'lucide-react';
import { useSiteStore } from '../../store/useSiteStore';
import { getWindClimate } from '../../lib/analysis/climatology';

interface WindRoseProps {
  /** Hướng gió thống trị (deg, 0=Bắc, theo chiều kim đồng hồ) */
  dirDeg: number;
  /** Tốc độ gió (m/s) — để vẽ độ dài mũi tên + tô đậm hướng */
  speedMs: number;
  /** Kích thước SVG (px). Default 140. */
  size?: number;
  /** Data 12 tháng để vẽ overlay nhỏ */
  monthly?: { dir: number; spd: number }[];
}

/** Vẽ 1 cánh hoa gió (1 hướng) */
function petalPath(cx: number, cy: number, r0: number, r1: number, angleDeg: number, width: number): string {
  // Mũi tên hình tam giác từ (cx, cy + r0) đến (cx, cy + r1), rotate quanh tâm
  const a = (angleDeg - 90) * Math.PI / 180; // -90 vì 0° hướng lên (Bắc)
  const tip = { x: cx + r1 * Math.cos(a), y: cy + r1 * Math.sin(a) };
  const baseL = {
    x: cx + r0 * Math.cos(a - width),
    y: cy + r0 * Math.sin(a - width),
  };
  const baseR = {
    x: cx + r0 * Math.cos(a + width),
    y: cy + r0 * Math.sin(a + width),
  };
  return `M ${baseL.x} ${baseL.y} L ${tip.x} ${tip.y} L ${baseR.x} ${baseR.y} Z`;
}

export function WindRose({ dirDeg, speedMs, size = 140, monthly }: WindRoseProps) {
  const cx = size / 2;
  const cy = size / 2;
  const rMax = size * 0.42;
  const rMin = size * 0.10;

  // 8 hướng chính (N, NE, E, SE, S, SW, W, NW)
  const DIRECTIONS = useMemo(() => [
    { label: 'B', deg:   0 }, // North
    { label: 'ĐB', deg:  45 }, // NE
    { label: 'Đ', deg:  90 }, // East
    { label: 'ĐN', deg: 135 }, // SE
    { label: 'N', deg: 180 }, // South
    { label: 'TN', deg: 225 }, // SW
    { label: 'T', deg: 270 }, // West
    { label: 'TB', deg: 315 }, // NW
  ], []);

  // Tính cường độ gió theo từng hướng (8 bins) từ monthly data nếu có
  const binIntensity = useMemo(() => {
    const bins = new Array(8).fill(0);
    const data = monthly && monthly.length > 0
      ? monthly
      : [{ dir: dirDeg, spd: speedMs }];
    let maxSpd = 0.5;
    for (const m of data) {
      // Bin index = round(dir/45) mod 8
      const idx = Math.round(m.dir / 45) % 8;
      bins[idx] = Math.max(bins[idx], m.spd);
      if (m.spd > maxSpd) maxSpd = m.spd;
    }
    return bins.map(v => v / maxSpd);
  }, [dirDeg, speedMs, monthly]);

  // Tốc độ gió tại hướng dominant — màu đỏ đậm theo cường độ
  const speedColor = speedMs < 1.5 ? '#86efac' :
                     speedMs < 3   ? '#fbbf24' :
                     speedMs < 5   ? '#fb923c' : '#dc2626';

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {/* Vòng tròn ngoài + trong */}
      <circle cx={cx} cy={cy} r={rMax} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={1} />
      <circle cx={cx} cy={cy} r={rMax * 0.66} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth={1} strokeDasharray="2,3" />
      <circle cx={cx} cy={cy} r={rMax * 0.33} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth={1} strokeDasharray="2,3" />
      <circle cx={cx} cy={cy} r={rMin} fill="rgba(15,23,42,0.7)" stroke="rgba(255,255,255,0.15)" strokeWidth={1} />

      {/* Trục N-S-E-W */}
      <line x1={cx} y1={cy - rMax} x2={cx} y2={cy + rMax} stroke="rgba(255,255,255,0.06)" strokeWidth={1} />
      <line x1={cx - rMax} y1={cy} x2={cx + rMax} y2={cy} stroke="rgba(255,255,255,0.06)" strokeWidth={1} />

      {/* Cánh hoa gió 8 hướng — độ dài theo cường độ */}
      {DIRECTIONS.map((d, i) => {
        const intensity = binIntensity[i];
        if (intensity < 0.02) return null;
        const r1 = rMin + (rMax - rMin) * intensity;
        const isDominant = Math.abs(((d.deg - dirDeg + 540) % 360) - 180) > 157; // ±22.5° từ dominant
        const color = isDominant ? speedColor : 'rgba(34, 211, 197, 0.55)';
        return (
          <path
            key={d.label}
            d={petalPath(cx, cy, rMin, r1, d.deg, 0.25)}
            fill={color}
            stroke={isDominant ? speedColor : 'rgba(34, 211, 197, 0.8)'}
            strokeWidth={0.5}
            opacity={isDominant ? 1 : 0.7}
          />
        );
      })}

      {/* Labels 4 hướng chính */}
      <text x={cx} y={cy - rMax - 4}        textAnchor="middle" fontSize="9" fill="#94a3b8" fontWeight="bold">N</text>
      <text x={cx + rMax + 8} y={cy + 3}    textAnchor="middle" fontSize="9" fill="#94a3b8" fontWeight="bold">E</text>
      <text x={cx} y={cy + rMax + 10}       textAnchor="middle" fontSize="9" fill="#94a3b8" fontWeight="bold">S</text>
      <text x={cx - rMax - 8} y={cy + 3}    textAnchor="middle" fontSize="9" fill="#94a3b8" fontWeight="bold">W</text>

      {/* Hiển thị số giữa hoa gió */}
      <text x={cx} y={cy - 2} textAnchor="middle" fontSize="10" fontWeight="bold" fill={speedColor}>
        {speedMs.toFixed(1)}
      </text>
      <text x={cx} y={cy + 8} textAnchor="middle" fontSize="7" fill="#64748b">
        m/s
      </text>
    </svg>
  );
}

// ── Wind data display panel ────────────────────────────────────────────────

/** Tự build monthly data từ geo + climatology nếu chưa có, hoặc dùng custom override */
export function WindClimatePanel() {
  const env  = useSiteStore(s => s.env);
  const geo  = useSiteStore(s => s.geo);
  const setEnv = useSiteStore(s => s.setEnv);
  const customWindData  = useSiteStore(s => s.customWindData);
  const setCustomWindMonth = useSiteStore(s => s.setCustomWindMonth);
  const clearCustomWindMonth = useSiteStore(s => s.clearCustomWindMonth);
  const resetCustomWind = useSiteStore(s => s.resetCustomWind);
  const windRoseRefImage = useSiteStore(s => s.windRoseRefImage);
  const setWindRoseRefImage = useSiteStore(s => s.setWindRoseRefImage);
  const imgRef = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState(false);

  // Build monthly data: custom override (nếu có) WIN > climatology > undefined
  const monthly = useMemo(() => {
    return Array.from({ length: 12 }, (_, i) => {
      const c = customWindData[i];
      if (c) return { dir: c[0], spd: c[1], source: 'custom' as const };
      if (geo) {
        const w = getWindClimate(geo.climateZone, i + 1);
        return { dir: w.dominantDirDeg, spd: w.avgSpeedMs, source: 'climate' as const };
      }
      return null;
    });
  }, [geo, customWindData]);

  const hasAnyData = monthly.some(m => m !== null);
  const monthlyDataForRose = useMemo(() =>
    monthly.filter((m): m is NonNullable<typeof m> => m !== null)
  , [monthly]);

  // Label tháng hiện tại
  const monthLabel = useMemo(() => {
    const m = monthly[env.month - 1];
    if (!m) return null;
    if (m.source === 'custom') return `T${env.month}: Tùy chỉnh (${m.dir}°, ${m.spd.toFixed(1)} m/s)`;
    if (geo) return `T${env.month}: ${getWindClimate(geo.climateZone, env.month).label}`;
    return null;
  }, [monthly, env.month, geo]);

  // Auto-apply gió tháng hiện tại vào env (cho 3D scene)
  const applyAuto = () => {
    const m = monthly[env.month - 1];
    if (!m) return;
    setEnv({
      windDirection: m.dir,
      windSpeed: Math.round(m.spd * 10) / 10,
    });
  };

  // Upload ảnh tham chiếu (PNG/JPG → dataURL)
  const handleImageUpload = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') setWindRoseRefImage(reader.result);
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="space-y-2.5">
      {/* Wind rose + info */}
      <div className="flex items-start gap-3">
        <WindRose
          dirDeg={env.windDirection}
          speedMs={env.windSpeed}
          monthly={monthlyDataForRose}
          size={130}
        />
        <div className="flex-1 space-y-1 text-[10.5px]">
          <div className="text-slate-500 uppercase tracking-wider text-[9.5px] font-bold">
            Gió tham chiếu
          </div>
          {geo ? (
            <>
              <div className="text-slate-300">
                <b>{geo.province}</b>
                <span className="text-slate-500 ml-1">({geo.climateZone})</span>
              </div>
              {monthLabel && (
                <div className="text-slate-400 leading-tight text-[10px]">{monthLabel}</div>
              )}
              <div className="text-[10px] font-mono text-slate-400 mt-1">
                {env.windDirection}° · {env.windSpeed.toFixed(1)} m/s
              </div>
              <button
                onClick={applyAuto}
                className="mt-1 px-2 py-0.5 text-[9.5px] rounded border border-accent-teal/40
                           bg-accent-teal/10 text-accent-teal hover:bg-accent-teal/20 transition"
                title={`Áp giá trị tháng ${env.month} vào mô phỏng 3D`}
              >
                ⟲ Auto theo T{env.month}
              </button>
            </>
          ) : (
            <div className="text-amber-300/80 text-[10px] leading-tight">
              Chưa phát hiện tỉnh — load file CAD có toạ độ VN2000, chọn tỉnh thủ công
              trong tab Khí hậu, HOẶC nhập trực tiếp 12 tháng bên dưới.
            </div>
          )}
        </div>
      </div>

      {/* Ảnh tham chiếu hoa gió */}
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <div className="text-[9.5px] uppercase tracking-wider text-slate-500 font-bold">
            Ảnh hoa gió tham chiếu
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => imgRef.current?.click()}
              className="text-[9px] text-slate-400 hover:text-accent-teal flex items-center gap-1"
            >
              <Upload size={10} /> Upload
            </button>
            {windRoseRefImage && (
              <button
                onClick={() => setWindRoseRefImage(null)}
                className="text-[9px] text-slate-400 hover:text-red-400 flex items-center gap-1"
              >
                <X size={10} /> Xoá
              </button>
            )}
          </div>
        </div>
        <input
          ref={imgRef} type="file" accept="image/*" className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleImageUpload(f);
            e.target.value = '';
          }}
        />
        {windRoseRefImage ? (
          <div className="relative rounded border border-white/10 overflow-hidden bg-bg-dark">
            <img src={windRoseRefImage} alt="hoa gió" className="w-full h-auto max-h-40 object-contain" />
          </div>
        ) : (
          <div className="text-[9.5px] text-slate-500 italic px-2 py-1.5 rounded border border-dashed border-white/10">
            Upload ảnh hoa gió (PNG/JPG) — hiển thị bên cạnh để so sánh & nhập tay 12 tháng.
          </div>
        )}
      </div>

      {/* Monthly breakdown — strip 12 tháng */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <div className="text-[9.5px] uppercase tracking-wider text-slate-500 font-bold">
            Gió 12 tháng {hasAnyData ? '— bấm để chọn' : ''}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setEditing(v => !v)}
              className={`text-[9px] flex items-center gap-1 transition ${
                editing ? 'text-amber-300' : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Mở/đóng bảng nhập tay 12 tháng"
            >
              {editing ? <Save size={10} /> : <Pencil size={10} />}
              {editing ? 'Xong' : 'Nhập tay'}
            </button>
            {customWindData.some(c => c !== null) && (
              <button
                onClick={resetCustomWind}
                className="text-[9px] text-slate-500 hover:text-red-400 flex items-center gap-1"
                title="Xoá tất cả override, quay về climatology"
              >
                <RotateCcw size={10} /> Reset
              </button>
            )}
          </div>
        </div>

        {/* Strip 12 ô */}
        <div className="grid grid-cols-12 gap-0.5">
          {monthly.map((m, i) => {
            const month = i + 1;
            const isCur = env.month === month;
            const isCustom = customWindData[i] !== null;
            const color = !m ? '#475569' :
                          m.spd < 1.5 ? '#86efac' :
                          m.spd < 3   ? '#fbbf24' :
                          m.spd < 5   ? '#fb923c' : '#dc2626';
            return (
              <button
                key={i}
                onClick={() => setEnv({ month })}
                className={`relative h-10 rounded border transition ${
                  isCur
                    ? 'border-green-400 bg-green-400/10'
                    : isCustom
                      ? 'border-amber-400/50 bg-amber-500/5'
                      : 'border-white/10 hover:border-white/30'
                }`}
                title={m
                  ? `T${month} · ${m.spd.toFixed(1)} m/s · ${m.dir}° (${m.source === 'custom' ? 'tùy chỉnh' : 'climatology'})`
                  : `T${month} · chưa có data — nhập tay`}
              >
                <div className="text-[8px] text-slate-400 leading-none pt-0.5">
                  {month}{isCustom ? '*' : ''}
                </div>
                <div className="absolute left-1/2 bottom-1 -translate-x-1/2">
                  {m ? (
                    <svg width={12} height={12} viewBox="0 0 12 12"
                         style={{ transform: `rotate(${m.dir}deg)` }}>
                      <path d="M6,1 L9,9 L6,7 L3,9 Z" fill={color} />
                    </svg>
                  ) : (
                    <span className="text-[10px] text-slate-700">—</span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-2 mt-1 text-[9px] text-slate-500 flex-wrap">
          <span className="inline-block w-2 h-2 rounded-full" style={{ background: '#86efac' }}></span>
          <span>&lt;1.5</span>
          <span className="inline-block w-2 h-2 rounded-full" style={{ background: '#fbbf24' }}></span>
          <span>1.5–3</span>
          <span className="inline-block w-2 h-2 rounded-full" style={{ background: '#fb923c' }}></span>
          <span>3–5</span>
          <span className="inline-block w-2 h-2 rounded-full" style={{ background: '#dc2626' }}></span>
          <span>&gt;5 m/s</span>
          <span className="text-amber-400">* = override</span>
        </div>

        {/* Bảng nhập tay 12 tháng */}
        {editing && (
          <div className="mt-2 pt-2 border-t border-white/5">
            <div className="text-[9px] text-slate-500 italic mb-1.5">
              💡 Nhập <b>Hướng</b> (0–359°, 0=Bắc) + <b>Tốc độ</b> (m/s) theo hoa gió tham chiếu.
              Để trống = dùng climatology mặc định.
            </div>
            <div className="grid grid-cols-[24px_60px_60px_18px] gap-1 items-center text-[10px]">
              <span className="text-[9px] uppercase text-slate-500">T</span>
              <span className="text-[9px] uppercase text-slate-500">Hướng°</span>
              <span className="text-[9px] uppercase text-slate-500">m/s</span>
              <span/>
            </div>
            {Array.from({ length: 12 }, (_, i) => {
              const c = customWindData[i];
              const climate = geo ? getWindClimate(geo.climateZone, i + 1) : null;
              const placeholderDir = climate?.dominantDirDeg.toString() ?? '';
              const placeholderSpd = climate?.avgSpeedMs.toFixed(1) ?? '';
              return (
                <div key={i} className="grid grid-cols-[24px_60px_60px_18px] gap-1 items-center text-[10px] py-0.5">
                  <span className={`text-[10px] font-mono ${c ? 'text-amber-300 font-bold' : 'text-slate-400'}`}>
                    {i + 1}
                  </span>
                  <input
                    type="number" min={0} max={359} step={1}
                    value={c?.[0] ?? ''}
                    placeholder={placeholderDir}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === '') { clearCustomWindMonth(i + 1); return; }
                      const dir = Number(v);
                      const spd = c?.[1] ?? climate?.avgSpeedMs ?? 2;
                      if (Number.isFinite(dir)) setCustomWindMonth(i + 1, dir, spd);
                    }}
                    className="w-full px-1 py-0.5 text-[10px] bg-bg-dark border border-white/10 rounded
                               text-slate-200 outline-none focus:border-amber-400/50"
                  />
                  <input
                    type="number" min={0} max={50} step={0.1}
                    value={c?.[1] ?? ''}
                    placeholder={placeholderSpd}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === '') { clearCustomWindMonth(i + 1); return; }
                      const spd = Number(v);
                      const dir = c?.[0] ?? climate?.dominantDirDeg ?? 0;
                      if (Number.isFinite(spd)) setCustomWindMonth(i + 1, dir, spd);
                    }}
                    className="w-full px-1 py-0.5 text-[10px] bg-bg-dark border border-white/10 rounded
                               text-slate-200 outline-none focus:border-amber-400/50"
                  />
                  {c && (
                    <button
                      onClick={() => clearCustomWindMonth(i + 1)}
                      className="text-[10px] text-slate-500 hover:text-red-400 leading-none"
                      title="Xoá override tháng này"
                    >✕</button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
