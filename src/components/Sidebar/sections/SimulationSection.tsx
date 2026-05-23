/**
 * SimulationSection.tsx — Mục 4 "Mô phỏng"
 */

import { Car, Wind, Sun } from 'lucide-react';
import { useSiteStore } from '../../../store/useSiteStore';
import { PlaceholderCard } from './tabs/PlaceholderCard';

export function SimulationSection() {
  const projects        = useSiteStore(s => s.projects);
  const activeProjectId = useSiteStore(s => s.activeProjectId);
  const active = projects.find(p => p.id === activeProjectId);
  const pop = active?.population;

  return (
    <div className="flex flex-col gap-3">

      {/* ── Mô phỏng giao thông (placeholder) ── */}
      <PlaceholderCard
        icon={<Car size={13} />}
        title={`Mô phỏng giao thông ${pop ? `(${pop.toLocaleString('vi-VN')} người)` : '(theo dân số)'}`}
        description={
          pop
            ? `Với dân số ${pop.toLocaleString('vi-VN')} người, mô phỏng phát sinh chuyến đi theo các loại phương tiện (ô tô lớn, 4-7 chỗ, xe máy, xe đạp) — xác định nút giao tắc nghẽn, độ thông suốt luồng GT.`
            : 'Cần điền dân số trong Mục 1 "Thông tin chung". Khi có dân số, mô phỏng phát sinh chuyến đi theo phương tiện, dự đoán điểm tắc, luồng GT trên mạng đường hiện trạng.'
        }
      />

      {/* ── Demo sẵn có: gió + nắng ── */}
      <div className="rounded-md border border-white/10 bg-white/3 px-3 py-2.5">
        <div className="text-[10.5px] font-bold text-slate-300 mb-1.5">Mô phỏng đang có</div>
        <div className="flex flex-col gap-1.5 text-[10px] text-slate-400">
          <div className="flex items-center gap-1.5">
            <Wind size={11} className="text-cyan-400" />
            <span>Particle gió theo hướng + tốc độ (mode "Gió" trong Mục 2.1)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Sun size={11} className="text-yellow-400" />
            <span>Bóng đổ + ánh sáng mặt trời theo tháng/giờ/vĩ độ (mode "Nắng")</span>
          </div>
        </div>
      </div>
    </div>
  );
}
