/**
 * NaturalCondTab.tsx — Sub-tab 1 "Điều kiện tự nhiên" của Mục 2.
 * Có 3 nested tab: Khí hậu / Nắng / Gió.
 *
 * - Khí hậu: render ClimatePanel (đã có)
 * - Nắng: month/hour slider + setMode('sun')
 * - Gió: wind direction/speed + placeholder upload hoa gió
 */

import { useEffect, useState } from 'react';
import { Cloud, Sun, Wind, EyeOff, Eye, Sparkles } from 'lucide-react';
import { useSiteStore } from '../../../../store/useSiteStore';
import { SubTabsHorizontal } from '../../SubTabsHorizontal';
import { ClimatePanel } from '../../ClimatePanel';
import { WindClimatePanel } from '../../WindRose';
import { ModeCommentsBlock } from '../ModeCommentsBlock';

type Inner = 'climate' | 'sun' | 'wind';

export function NaturalCondTab() {
  const [inner, setInner] = useState<Inner>('climate');
  const env     = useSiteStore(s => s.env);
  const setEnv  = useSiteStore(s => s.setEnv);
  const setMode = useSiteStore(s => s.setMode);
  const mode    = useSiteStore(s => s.mode);
  const computeForMode = useSiteStore(s => s.computeForMode);
  const sunExposure = useSiteStore(s => s.analysis.sunExposure);
  const sunHideBall = useSiteStore(s => s.sunHideBall);
  const toggleSunHideBall = useSiteStore(s => s.toggleSunHideBall);
  const sunLightIntensity = useSiteStore(s => s.sunLightIntensity);
  const setSunLightIntensity = useSiteStore(s => s.setSunLightIntensity);
  const sunDarkIntensity = useSiteStore(s => s.sunDarkIntensity);
  const setSunDarkIntensity = useSiteStore(s => s.setSunDarkIntensity);

  // Auto-set 3D mode theo tab con
  useEffect(() => {
    if (inner === 'sun')  setMode('sun');
    if (inner === 'wind') setMode('wind');
  }, [inner, setMode]);

  return (
    <SubTabsHorizontal
      tabs={[
        { id: 'climate', label: 'Khí hậu', icon: <Cloud size={11}/> },
        { id: 'sun',     label: 'Nắng',    icon: <Sun size={11}/> },
        { id: 'wind',    label: 'Gió',     icon: <Wind size={11}/> },
      ]}
      activeId={inner}
      onChange={(id) => setInner(id as Inner)}
    >
      {inner === 'climate' && (
        <div className="space-y-2.5">
          <ClimatePanel />
          <ModeCommentsBlock mode="sun" />
        </div>
      )}

      {inner === 'sun' && (
        <div className="space-y-2.5">
          <Slider label="Tháng" value={env.month} min={1} max={12} step={1}
            onChange={(v) => setEnv({ month: v })} />
          <Slider label="Giờ" value={env.hour} min={0} max={23} step={1} suffix="h"
            onChange={(v) => setEnv({ hour: v })} />
          <Slider label="Vĩ độ" value={env.latitude} min={8} max={24} step={0.1} suffix="°N"
            onChange={(v) => setEnv({ latitude: v })} />
          <div className="text-[10px] text-slate-500 italic leading-relaxed">
            Bóng đổ và vị trí mặt trời tự động cập nhật theo tham số trên 3D scene.
          </div>

          {/* Ẩn mặt trời + độ sáng/tối (kiểu SketchUp Shadows) */}
          <div className="pt-2 border-t border-white/5 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[9.5px] uppercase tracking-wider text-slate-500 font-bold">
                Hiển thị
              </span>
              <button
                onClick={toggleSunHideBall}
                className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold border transition
                  ${sunHideBall ? 'border-amber-400/40 text-amber-300 bg-amber-500/10' : 'border-white/10 text-slate-400 hover:text-slate-200'}`}
                title="Ẩn quả cầu/quầng sáng/tia nắng — chỉ giữ bóng đổ thực để dễ quan sát tương quan sáng/tối"
              >
                {sunHideBall ? <EyeOff size={11} /> : <Eye size={11} />}
                {sunHideBall ? 'Đã ẩn mặt trời' : 'Ẩn mặt trời'}
              </button>
            </div>
            <Slider label="Light" value={Math.round(sunLightIntensity * 100)} min={0} max={300} step={5} suffix="%"
              onChange={(v) => setSunLightIntensity(v / 100)} />
            <Slider label="Dark" value={Math.round(sunDarkIntensity * 100)} min={0} max={100} step={5} suffix="%"
              onChange={(v) => setSunDarkIntensity(v / 100)} />
            <div className="text-[9px] text-slate-500 italic leading-snug">
              Light = độ sáng vùng có nắng · Dark = độ sáng vùng bóng đổ (kéo về 0% để bóng tối hẳn,
              dễ thấy tương quan sáng/tối nhất).
            </div>
          </div>

          {/* Phân vùng nắng theo giờ trong ngày */}
          <div className="pt-2 border-t border-white/5 space-y-1.5">
            <button
              onClick={() => { setMode('sunExposure'); computeForMode('sunExposure'); }}
              className={`w-full flex items-center justify-center gap-1.5 py-1.5 rounded-md text-[10.5px]
                font-bold uppercase tracking-wider border transition
                ${mode === 'sunExposure'
                  ? 'bg-orange-500/20 border-orange-400/60 text-orange-300'
                  : 'border-orange-400/30 text-orange-300/80 hover:bg-orange-500/10'}`}
            >
              <Sparkles size={12} /> Phân tích nắng theo giờ (tháng {env.month})
            </button>
            {mode === 'sunExposure' && sunExposure && (
              <div className="px-2 py-1.5 rounded bg-orange-500/5 border-l-2 border-orange-400/40 text-[10px] text-slate-300 leading-relaxed space-y-1">
                <div>
                  🔶 <b className="text-orange-300">{sunExposure.classArea.high.toFixed(0)}%</b> diện tích nắng nhiều
                  (≥70% ngày, trung bình ngày dài {sunExposure.maxPossibleHours}h)
                </div>
                <div>
                  🟡 <b className="text-amber-300">{sunExposure.classArea.medium.toFixed(0)}%</b> nắng vừa (30-70%)
                </div>
                <div>
                  🔵 <b className="text-slate-300">{sunExposure.classArea.low.toFixed(0)}%</b> ít/không nắng (&lt;30%)
                  — phù hợp công trình cần che nắng/kho/kỹ thuật
                </div>
                <div className="text-slate-500 pt-0.5">
                  Trung bình toàn khu: {sunExposure.meanHours.toFixed(1)}h nắng/ngày.
                  Đã tính bóng đổ địa hình (sườn khuất nắng tự động nhận diện ít nắng hơn).
                </div>
              </div>
            )}
          </div>

          <ModeCommentsBlock mode="sun" />
        </div>
      )}

      {inner === 'wind' && (
        <div className="space-y-2.5">
          {/* Hoa gió visualization + monthly breakdown + auto-apply theo địa phương */}
          <WindClimatePanel />

          {/* Sliders để override thủ công */}
          <div className="pt-2 border-t border-white/5 space-y-1.5">
            <div className="text-[9.5px] uppercase tracking-wider text-slate-500 font-bold">
              Override thủ công
            </div>
            <Slider label="Hướng" value={env.windDirection} min={0} max={359} step={1} suffix="°"
              onChange={(v) => setEnv({ windDirection: v })} />
            <Slider label="Tốc độ" value={env.windSpeed} min={0} max={20} step={0.1} suffix=" m/s"
              onChange={(v) => setEnv({ windSpeed: v })} />
          </div>

          {/* Kiểu hiển thị gió 3D */}
          <div className="pt-2 border-t border-white/5 space-y-1.5">
            <div className="text-[9.5px] uppercase tracking-wider text-slate-500 font-bold mb-1">
              Kiểu hiển thị 3D
            </div>
            <div className="flex gap-1">
              {(['v1', 'v2'] as const).map((ver) => (
                <button
                  key={ver}
                  onClick={() => setEnv({ windVisualization: ver })}
                  className={`flex-1 py-1.5 rounded text-[10px] font-medium border transition ${
                    env.windVisualization === ver
                      ? 'bg-sky-500/20 border-sky-400/60 text-sky-300'
                      : 'bg-white/3 border-white/10 text-slate-400 hover:border-white/20'
                  }`}
                >
                  {ver === 'v1' ? 'V1 · Hạt đơn sắc' : 'V2 · Windy streak'}
                </button>
              ))}
            </div>

            {env.windVisualization === 'v2' && (
              <div className="px-2 py-1.5 rounded bg-sky-500/8 border border-sky-400/20 text-[9.5px] text-slate-400 leading-snug space-y-0.5">
                <div className="text-sky-300 font-semibold mb-0.5">V2 — Phong cách Windy.com</div>
                <div>• Màu theo tốc độ: <span className="text-[#627187]">■</span> xanh →
                  <span className="text-[#53A353]"> ■</span> lá →
                  <span className="text-[#A13A4E]"> ■</span> đỏ →
                  <span className="text-[#754A93]"> ■</span> tím
                </div>
                <div>• Streak: đuôi mờ — đầu sáng (velocity trail)</div>
                <div>• Địa hình ảnh hưởng tốc độ: xuôi dốc nhanh hơn</div>
                <div>• Hạt fade in/out theo vòng đời, không tụ cụm</div>
              </div>
            )}
          </div>

          <ModeCommentsBlock mode="wind" />
        </div>
      )}
    </SubTabsHorizontal>
  );
}

// ── Slider helper (đơn giản) ────────────────────────────────────────────────
function Slider({ label, value, min, max, step, suffix, onChange }: {
  label: string; value: number; min: number; max: number; step?: number;
  suffix?: string; onChange: (v: number) => void;
}) {
  return (
    <div className="grid grid-cols-[60px_1fr_50px] items-center gap-2">
      <label className="text-[10px] uppercase tracking-wider text-slate-500">{label}</label>
      <input
        type="range" min={min} max={max} step={step ?? 1} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-1 accent-green-400"
      />
      <span className="text-[10px] font-mono text-slate-300 text-right">
        {value}{suffix ?? ''}
      </span>
    </div>
  );
}
