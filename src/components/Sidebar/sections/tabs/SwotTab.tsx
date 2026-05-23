/**
 * SwotTab.tsx — Sub-tab 9 "Tổng hợp hiện trạng" (SWOT)
 *
 * Layout dọc: 4 mục S/W/O/T xếp xuống dòng, mỗi mục full-width
 * → đọc dễ hơn so với 4 ô grid 2×2 chật chội.
 */

import { useState } from 'react';
import { PlaceholderCard } from './PlaceholderCard';

type SwotKey = 'strengths' | 'weaknesses' | 'opportunities' | 'threats';

const SWOT_CONFIG: Record<SwotKey, {
  letter: string;     // S / W / O / T
  title: string;      // Strengths / ...
  titleVI: string;    // Điểm mạnh / ...
  color: string;
  bg: string;
  ring: string;
  placeholder: string;
}> = {
  strengths: {
    letter: 'S', title: 'Strengths', titleVI: 'Điểm mạnh',
    color: 'text-emerald-300', bg: 'bg-emerald-500/10', ring: 'border-emerald-400/40',
    placeholder: 'Vị trí chiến lược, hạ tầng có sẵn, view đẹp, địa hình thuận lợi, gần điểm thu hút khách…',
  },
  weaknesses: {
    letter: 'W', title: 'Weaknesses', titleVI: 'Điểm yếu',
    color: 'text-amber-300', bg: 'bg-amber-500/10', ring: 'border-amber-400/40',
    placeholder: 'Độ dốc cao, thiếu nước, giao thông xa, đất yếu, sạt lở mùa mưa…',
  },
  opportunities: {
    letter: 'O', title: 'Opportunities', titleVI: 'Cơ hội',
    color: 'text-sky-300', bg: 'bg-sky-500/10', ring: 'border-sky-400/40',
    placeholder: 'Chính sách hỗ trợ, tuyến cao tốc sắp hoàn thành, du lịch phát triển, dự án lớn lân cận…',
  },
  threats: {
    letter: 'T', title: 'Threats', titleVI: 'Thách thức',
    color: 'text-red-300', bg: 'bg-red-500/10', ring: 'border-red-400/40',
    placeholder: 'Nguy cơ sạt lở, dân cư xen kẽ, áp lực môi trường, biến đổi khí hậu, tiếng ồn từ giao thông…',
  },
};

export function SwotTab() {
  const [text, setText] = useState<Record<SwotKey, string>>({
    strengths: '', weaknesses: '', opportunities: '', threats: '',
  });

  return (
    <div className="space-y-2">
      {(Object.keys(SWOT_CONFIG) as SwotKey[]).map(key => {
        const cfg = SWOT_CONFIG[key];
        return (
          <div key={key} className={`rounded-md border ${cfg.ring} ${cfg.bg} p-2`}>
            <div className="flex items-center gap-2 mb-1.5">
              <span className={`flex items-center justify-center w-6 h-6 rounded-full
                                font-black text-[13px] border ${cfg.color} ${cfg.ring}
                                bg-bg-dark/40`}>
                {cfg.letter}
              </span>
              <div className="flex flex-col leading-tight">
                <span className={`text-[11px] font-bold ${cfg.color} uppercase tracking-wider`}>
                  {cfg.titleVI}
                </span>
                <span className="text-[9px] text-slate-500 font-mono">{cfg.title}</span>
              </div>
            </div>
            <textarea
              value={text[key]}
              onChange={(e) => setText(prev => ({ ...prev, [key]: e.target.value }))}
              placeholder={cfg.placeholder}
              rows={3}
              className="w-full text-[10.5px] bg-bg-dark/60 border border-white/8 rounded p-2
                         text-slate-100 placeholder:text-slate-600 outline-none resize-y
                         leading-relaxed focus:border-white/20 transition"
            />
          </div>
        );
      })}

      <PlaceholderCard
        title="Tự động sinh SWOT từ phân tích"
        description="Tổng hợp các tab đánh giá (cao độ, độ dốc, thủy văn, giao thông, sử dụng đất) thành SWOT tự động — không cần nhập thủ công."
      />
    </div>
  );
}
