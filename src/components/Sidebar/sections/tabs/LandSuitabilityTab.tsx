/**
 * LandSuitabilityTab.tsx — Sub-tab "Quỹ đất XD"
 *
 * Tab gộp 2 phương pháp đánh giá quỹ đất, user toggle giữa:
 *   - V1 (Cũ)     — 4 yếu tố vật lý: dốc, dòng chảy, hướng, cao độ.
 *                   + Flood-aware penalty (cải tiến).
 *   - V2 (GIS-MCA)— 9 tiêu chí theo NCKH ĐH Kiến trúc HN 2026.
 *                   Grid 20×20m, weighted sum + hard constraint.
 *
 * UI giống pattern SlopeTab: 2 nút toggle ở đầu tab, panel content thay đổi
 * theo nút đang chọn.
 */

import { useState } from 'react';
import { SuitabilityTab } from './SuitabilityTab';
import { MCATab }         from './MCATab';

type Version = 'v1' | 'v2';

export function LandSuitabilityTab() {
  const [version, setVersion] = useState<Version>('v1');

  return (
    <div className="space-y-2.5">
      {/* ── Toggle phương pháp (giống pattern SlopeTab) ── */}
      <div>
        <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">
          Phương pháp đánh giá
        </div>
        <div className="flex gap-1">
          <button
            onClick={() => setVersion('v1')}
            className={`flex-1 px-2 py-1 rounded text-[10px] font-bold border transition ${
              version === 'v1'
                ? 'bg-green-500/25 border-green-400/60 text-green-200'
                : 'border-white/10 text-slate-400 hover:text-slate-200'
            }`}
          >
            V1 · 4 yếu tố
          </button>
          <button
            onClick={() => setVersion('v2')}
            className={`flex-1 px-2 py-1 rounded text-[10px] font-bold border transition ${
              version === 'v2'
                ? 'bg-green-500/25 border-green-400/60 text-green-200'
                : 'border-white/10 text-slate-400 hover:text-slate-200'
            }`}
          >
            V2 · GIS-MCA 9 tiêu chí
          </button>
        </div>
      </div>

      {/* ── Panel theo version ── */}
      {version === 'v1' && <SuitabilityTab />}
      {version === 'v2' && <MCATab />}
    </div>
  );
}
