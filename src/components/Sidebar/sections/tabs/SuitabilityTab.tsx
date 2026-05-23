/**
 * SuitabilityTab.tsx — Sub-tab 5 "Quỹ đất xây dựng" (V1).
 *
 * V1 — cách tính cũ (4 yếu tố: dốc, dòng chảy, hướng, cao độ) + flood-aware
 * penalty (cải tiến mới): cell dưới mực nước × 0.3, gần mặt nước ×0.5..1.0.
 *
 * Có version V2 (GIS-MCA 9 tiêu chí) ở tab kế bên để so sánh.
 */

import { useEffect } from 'react';
import { useSiteStore } from '../../../../store/useSiteStore';
import { ModeCommentsBlock } from '../ModeCommentsBlock';

export function SuitabilityTab() {
  const setMode             = useSiteStore(s => s.setMode);
  const applyFloodPenalty   = useSiteStore(s => s.applyFloodPenalty);
  const setApplyFloodPenalty = useSiteStore(s => s.setApplyFloodPenalty);
  const showFlood3D         = useSiteStore(s => s.showFlood3D);
  const waterLevel3D        = useSiteStore(s => s.waterLevel3D);

  useEffect(() => { setMode('suitability'); }, [setMode]);

  return (
    <div className="space-y-2.5">
      <div className="text-[10.5px] text-slate-300 leading-relaxed">
        Phân lớp đất theo độ phù hợp xây dựng — kết hợp <b>độ dốc, thủy văn,
        đặc trưng địa hình</b>. 4 lớp:{' '}
        <span className="text-emerald-300 font-bold">Tốt</span> ·{' '}
        <span className="text-yellow-300 font-bold">Khá</span> ·{' '}
        <span className="text-orange-300 font-bold">Hạn chế</span> ·{' '}
        <span className="text-red-300 font-bold">Không phù hợp</span>.
      </div>

      {/* ── Flood-aware penalty (cải tiến mới) ── */}
      <div className="space-y-1.5 pt-1.5 border-t border-white/5">
        <label className="flex items-start gap-2 text-[10.5px] text-slate-300 cursor-pointer">
          <input
            type="checkbox"
            checked={applyFloodPenalty}
            onChange={(e) => setApplyFloodPenalty(e.target.checked)}
            className="mt-0.5 accent-accent-teal"
          />
          <span>
            <b>Áp flood-aware penalty</b> <span className="text-slate-500">(cải tiến)</span>
          </span>
        </label>
        <div className="text-[9.5px] text-slate-500 leading-snug pl-5">
          Trừ điểm vùng dễ ngập: cell dưới mực nước × 0.3; cell trong 30m từ mặt nước ×0.5–1.0.
          {showFlood3D
            ? <span className="text-accent-teal block">→ Đang dùng mực nước mô phỏng = {waterLevel3D.toFixed(1)}m (Mục 4).</span>
            : <span className="text-amber-300/80 block">→ Chưa bật Flood (Mục 4) — fallback percentile 5% Z.</span>
          }
        </div>
      </div>

      <ModeCommentsBlock mode="suitability" />
    </div>
  );
}
