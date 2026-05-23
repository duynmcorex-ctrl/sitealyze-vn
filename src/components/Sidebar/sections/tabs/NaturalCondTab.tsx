/**
 * NaturalCondTab.tsx — Sub-tab 1 "Điều kiện tự nhiên" của Mục 2.
 * Có 3 nested tab: Khí hậu / Nắng / Gió.
 *
 * - Khí hậu: render ClimatePanel (đã có)
 * - Nắng: month/hour slider + setMode('sun')
 * - Gió: wind direction/speed + placeholder upload hoa gió
 */

import { useEffect, useState } from 'react';
import { Cloud, Sun, Wind } from 'lucide-react';
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
