/**
 * SlopeTab.tsx — Sub-tab 4 "Độ dốc"
 */

import { useEffect } from 'react';
import { useSiteStore } from '../../../../store/useSiteStore';
import { ModeCommentsBlock } from '../ModeCommentsBlock';

export function SlopeTab() {
  const setMode    = useSiteStore(s => s.setMode);
  const slopeMode  = useSiteStore(s => s.slopeMode);
  const setSlopeMode = useSiteStore(s => s.setSlopeMode);

  useEffect(() => { setMode('slope'); }, [setMode]);

  return (
    <div className="space-y-2.5">
      <div>
        <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Đơn vị độ dốc</div>
        <div className="flex gap-1">
          <button
            onClick={() => setSlopeMode('degree')}
            className={`flex-1 px-2 py-1 rounded text-[10px] font-bold border transition ${
              slopeMode === 'degree'
                ? 'bg-green-500/25 border-green-400/60 text-green-200'
                : 'border-white/10 text-slate-400 hover:text-slate-200'
            }`}
          >
            Độ (°) · 6 lớp
          </button>
          <button
            onClick={() => setSlopeMode('percent')}
            className={`flex-1 px-2 py-1 rounded text-[10px] font-bold border transition ${
              slopeMode === 'percent'
                ? 'bg-green-500/25 border-green-400/60 text-green-200'
                : 'border-white/10 text-slate-400 hover:text-slate-200'
            }`}
          >
            % · QH VN
          </button>
        </div>
      </div>

      <ModeCommentsBlock mode="slope" />
    </div>
  );
}
