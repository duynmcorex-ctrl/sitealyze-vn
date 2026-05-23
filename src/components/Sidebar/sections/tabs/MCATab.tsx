/**
 * MCATab.tsx — Sub-tab "Quỹ đất XD V2 (GIS-MCA)"
 *
 * Đánh giá theo nghiên cứu KTS Hà Nội 2026:
 *   9 tiêu chí (X1-X9), mỗi điểm 1-10, weighted sum + hard constraint →
 *   3 lớp Y=0/1/2 (Không/Ít/Thuận lợi). Grid 20×20m.
 *
 * UI:
 *   - Toggle mode
 *   - Tổng quan 3 lớp Y với % + diện tích
 *   - Slider 9 trọng số (sửa được)
 *   - Input X6 default
 *   - Checkbox hard constraint
 *   - Bar chart "Feature Importance" (mean score 9 tiêu chí)
 */
import { useEffect } from 'react';
import { useSiteStore } from '../../../../store/useSiteStore';
import { MCA_CLASSES, MCA_CRITERIA_LABELS, DEFAULT_MCA_WEIGHTS } from '../../../../lib/analysis/mca';
import { ModeCommentsBlock } from '../ModeCommentsBlock';
import { RotateCcw } from 'lucide-react';

export function MCATab() {
  const setMode               = useSiteStore(s => s.setMode);
  const computeForMode        = useSiteStore(s => s.computeForMode);
  const mca                   = useSiteStore(s => s.mca);
  const mcaWeights            = useSiteStore(s => s.mcaWeights);
  const setMcaWeight          = useSiteStore(s => s.setMcaWeight);
  const resetMcaWeights       = useSiteStore(s => s.resetMcaWeights);
  const mcaX6Default          = useSiteStore(s => s.mcaX6Default);
  const setMcaX6Default       = useSiteStore(s => s.setMcaX6Default);
  const mcaHardConstraints    = useSiteStore(s => s.mcaHardConstraints);
  const toggleMcaHardConstraints = useSiteStore(s => s.toggleMcaHardConstraints);
  const landuse               = useSiteStore(s => s.landuse);
  const overlayLayers         = useSiteStore(s => s.overlayLayers);
  const terrain               = useSiteStore(s => s.terrain);

  // Set mode + auto-compute lần đầu
  useEffect(() => {
    setMode('mca');
    if (terrain && !mca) computeForMode('mca');
  }, [setMode, computeForMode, terrain, mca]);

  const weightsSum = Object.values(mcaWeights).reduce((s, v) => s + v, 0);
  const hasRoads = overlayLayers.some(l => l.isRoad && l.visible);
  const hasLanduse = landuse && landuse.parcels.length > 0;

  return (
    <div className="space-y-3">
      {/* ── Giới thiệu phương pháp ── */}
      <div className="text-[10.5px] text-slate-300 leading-relaxed">
        Đánh giá theo nghiên cứu <i>"Ứng dụng GIS & AI trong đồ án QHCT"</i> —
        ĐH Kiến trúc HN, 2026. 9 tiêu chí (X1-X9) × thang điểm 1-10 + hard constraint,
        Grid 20×20m → 3 lớp Y (Không / Ít / Thuận lợi).
      </div>

      {/* ── Cảnh báo input thiếu ── */}
      {(!hasLanduse || !hasRoads) && (
        <div className="text-[9.5px] px-2 py-1.5 rounded bg-amber-500/10 border border-amber-500/30
                        text-amber-300/90 leading-snug space-y-0.5">
          {!hasLanduse && <div>⚠ Chưa có landuse — X4/X5/X7 dùng giá trị default.</div>}
          {!hasRoads   && <div>⚠ Chưa có overlay đường — X8/X9 sẽ trả điểm thấp.</div>}
        </div>
      )}

      {/* ── 3 LỚP Y SUMMARY ── */}
      {mca && (
        <div className="space-y-1.5 pt-1 border-t border-white/5">
          <div className="text-[9.5px] uppercase tracking-wider text-slate-500 font-bold">
            Phân lớp đầu ra Y (Grid {mca.gridSize}×{mca.gridSize}m, {mca.cells.length} ô)
          </div>
          {MCA_CLASSES.map((cls, idx) => {
            const k = `y${idx}` as 'y0' | 'y1' | 'y2';
            const pct = mca.classDist[k];
            const ha  = mca.classArea[k] / 10000;
            return (
              <div key={idx} className="flex items-center gap-2 text-[10.5px]">
                <span
                  className="block w-3 h-3 rounded-sm border border-white/20 shrink-0"
                  style={{ background: cls.color }}
                />
                <span className="flex-1 text-slate-300">
                  <b>Y={idx}</b> · {cls.label}
                </span>
                <span className="font-mono text-slate-400 tabular-nums">
                  {pct.toFixed(1)}%
                </span>
                <span className="font-mono text-slate-500 tabular-nums text-[10px] w-16 text-right">
                  {ha.toFixed(2)} ha
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* ── TRỌNG SỐ 9 TIÊU CHÍ ── */}
      <div className="space-y-1.5 pt-2 border-t border-white/5">
        <div className="flex items-center justify-between">
          <div className="text-[9.5px] uppercase tracking-wider text-slate-500 font-bold">
            Trọng số (Σ = {(weightsSum * 100).toFixed(0)}%)
          </div>
          <button
            onClick={resetMcaWeights}
            title="Đặt lại trọng số theo Bảng 15 PDF"
            className="text-[9px] text-slate-500 hover:text-accent-teal flex items-center gap-1"
          >
            <RotateCcw size={10} /> Reset
          </button>
        </div>
        <div className="space-y-1">
          {MCA_CRITERIA_LABELS.map(({ key, label }) => {
            const v = mcaWeights[key];
            const def = DEFAULT_MCA_WEIGHTS[key];
            const changed = Math.abs(v - def) > 0.005;
            return (
              <div key={key} className="grid grid-cols-[24px_1fr_28px] gap-1.5 items-center text-[10px]">
                <span
                  className={`font-mono ${changed ? 'text-amber-300' : 'text-slate-500'}`}
                  title={label}
                >
                  {key.toUpperCase()}
                </span>
                <input
                  type="range"
                  min={0} max={40} step={1}
                  value={Math.round(v * 100)}
                  onChange={(e) => setMcaWeight(key, Number(e.target.value) / 100)}
                  className="h-1.5 accent-accent-teal"
                  title={`${label} — ${(v * 100).toFixed(0)}%`}
                />
                <span className="text-right tabular-nums text-slate-400 text-[9.5px]">
                  {(v * 100).toFixed(0)}%
                </span>
              </div>
            );
          })}
        </div>
        <div className="text-[9px] text-slate-500 italic">
          Trỏ chuột lên ký hiệu X1..X9 để xem tên đầy đủ.
        </div>
      </div>

      {/* ── X6 + HARD CONSTRAINTS ── */}
      <div className="space-y-2 pt-2 border-t border-white/5">
        <div className="flex items-center justify-between gap-2">
          <label className="text-[10.5px] text-slate-300">
            X6 (Phù hợp QH cấp trên) mặc định:
          </label>
          <input
            type="number" min={1} max={10} step={1}
            value={mcaX6Default}
            onChange={(e) => setMcaX6Default(Number(e.target.value))}
            className="w-12 px-1.5 py-0.5 text-[11px] text-center bg-bg-dark border border-white/10 rounded
                       text-slate-100 outline-none focus:border-accent-teal/50"
          />
        </div>
        <label className="flex items-center gap-2 text-[10.5px] text-slate-300 cursor-pointer">
          <input
            type="checkbox"
            checked={mcaHardConstraints}
            onChange={toggleMcaHardConstraints}
            className="accent-accent-teal"
          />
          <span>Áp dụng <b>Hard constraints</b></span>
        </label>
        <div className="text-[9.5px] text-slate-500 leading-snug pl-5">
          X3 &lt; 4 (sát mặt nước &lt;300m) HOẶC X2 &lt; 5 (ngập &gt;5%) → ép Y=0
        </div>
      </div>

      {/* ── FEATURE IMPORTANCE ── */}
      {mca && (
        <div className="space-y-1.5 pt-2 border-t border-white/5">
          <div className="text-[9.5px] uppercase tracking-wider text-slate-500 font-bold">
            Điểm trung bình mỗi tiêu chí (1-10)
          </div>
          <div className="space-y-0.5">
            {MCA_CRITERIA_LABELS.map(({ key, label }) => {
              const v = mca.meanScores[key];
              const pct = (v / 10) * 100;
              const barColor = v >= 7 ? '#22c55e' : v >= 4 ? '#fb923c' : '#dc2626';
              return (
                <div key={key} className="grid grid-cols-[28px_1fr_28px] gap-1.5 items-center text-[10px]">
                  <span className="font-mono text-slate-500">{key.toUpperCase()}</span>
                  <div className="relative h-3 bg-white/5 rounded overflow-hidden">
                    <div
                      className="absolute inset-y-0 left-0 rounded transition-all"
                      style={{ width: `${pct}%`, background: barColor, opacity: 0.85 }}
                    />
                    <div className="absolute inset-0 flex items-center px-1.5 text-[9px] text-white/80 truncate">
                      {label}
                    </div>
                  </div>
                  <span className="text-right tabular-nums text-slate-300 font-mono">
                    {v.toFixed(1)}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="text-[9px] text-slate-500 italic leading-snug pt-1">
            💡 Tiêu chí có điểm trung bình thấp → đang "kéo xuống" tổng điểm.
            Cải thiện yếu tố đó nếu muốn nâng quỹ đất thuận lợi.
          </div>
        </div>
      )}

      <ModeCommentsBlock mode="mca" />
    </div>
  );
}
