/**
 * RoadsTab.tsx — Sub-tab 8 "Giao thông"
 */

import { useEffect } from 'react';
import { useSiteStore } from '../../../../store/useSiteStore';
import { ModeCommentsBlock } from '../ModeCommentsBlock';

export function RoadsTab() {
  const setMode    = useSiteStore(s => s.setMode);
  const showRoads  = useSiteStore(s => s.showRoads);
  const toggleRoads = useSiteStore(s => s.toggleRoads);
  useEffect(() => { setMode('roads'); }, [setMode]);

  return (
    <div className="space-y-2.5">
      <label className="flex items-center gap-2 cursor-pointer text-[10.5px]">
        <input
          type="checkbox" checked={showRoads} onChange={toggleRoads}
          className="accent-green-400"
        />
        <span className="text-slate-300">Hiện giao thông hiện trạng trên 3D</span>
      </label>

      <div className="text-[10.5px] text-slate-400 leading-relaxed">
        Phân loại tự động (bề mặt, vai trò, chiều rộng) từ tên layer trong CAD. Tính tổng chiều dài 3D, độ dốc dọc trung bình/lớn nhất, và tỷ lệ chu vi tiếp cận đường (accessibility).
      </div>

      <ModeCommentsBlock mode="roads" />
    </div>
  );
}
