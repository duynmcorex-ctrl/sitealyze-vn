/**
 * ViewTab.tsx — Sub-tab 2 "View" của Mục 2.
 * 3 nested tabs: Điểm-tuyến-diện / View / Cây.
 */

import { useEffect, useState } from 'react';
import { Triangle, Eye, Trees } from 'lucide-react';
import { useSiteStore } from '../../../../store/useSiteStore';
import { SubTabsHorizontal } from '../../SubTabsHorizontal';
import { ViewpointTool } from '../../ViewpointTool';
import { AutoViewpoints } from '../../AutoViewpoints';
import { TreesDiagnostic } from '../../TreesDiagnostic';
import { ModeCommentsBlock } from '../ModeCommentsBlock';

type Inner = 'features' | 'view' | 'trees';

export function ViewTab() {
  const [inner, setInner] = useState<Inner>('features');
  const env     = useSiteStore(s => s.env);
  const setEnv  = useSiteStore(s => s.setEnv);
  const setMode = useSiteStore(s => s.setMode);
  const features = useSiteStore(s => s.analysis.features);
  const showAllPeaks = useSiteStore(s => s.showAllPeakElevations);
  const toggleAllPeaks = useSiteStore(s => s.toggleAllPeakElevations);
  const showRidgeLines = useSiteStore(s => s.showRidgeLines);
  const toggleRidgeLines = useSiteStore(s => s.toggleRidgeLines);
  const computeForMode = useSiteStore(s => s.computeForMode);

  useEffect(() => {
    if (inner === 'features') { setMode('features'); computeForMode('features'); }
    if (inner === 'view')     setMode('viewshed');
  }, [inner, setMode, computeForMode]);

  return (
    <SubTabsHorizontal
      tabs={[
        { id: 'features', label: 'Điểm-tuyến-diện', icon: <Triangle size={11}/> },
        { id: 'view',     label: 'View',            icon: <Eye size={11}/> },
        { id: 'trees',    label: 'Cây',             icon: <Trees size={11}/> },
      ]}
      activeId={inner}
      onChange={(id) => setInner(id as Inner)}
    >
      {inner === 'features' && (
        <div className="space-y-2.5">
          {features ? (
            <div className="grid grid-cols-2 gap-1.5 text-[10.5px]">
              <div className="px-2 py-1.5 rounded bg-orange-500/10 border border-orange-400/30">
                <div className="text-orange-300 font-bold">Đỉnh (peaks)</div>
                <div className="text-slate-400 text-[10px] mt-0.5">
                  Điểm cao cục bộ — hiển thị marker trên 3D
                </div>
              </div>
              <div className="px-2 py-1.5 rounded bg-blue-500/10 border border-blue-400/30">
                <div className="text-blue-300 font-bold">Thung lũng (pits)</div>
                <div className="text-slate-400 text-[10px] mt-0.5">
                  Điểm trũng cục bộ — đáy thung lũng
                </div>
              </div>
              <div className="px-2 py-1.5 rounded bg-amber-500/10 border border-amber-400/30">
                <div className="text-amber-300 font-bold">Sống núi (ridges)</div>
                <div className="text-slate-400 text-[10px] mt-0.5">
                  Đường nối các đỉnh — gọi tuyến
                </div>
              </div>
              <div className="px-2 py-1.5 rounded bg-cyan-500/10 border border-cyan-400/30">
                <div className="text-cyan-300 font-bold">Đáy thung (valleys)</div>
                <div className="text-slate-400 text-[10px] mt-0.5">
                  Đường nối các điểm trũng — diện
                </div>
              </div>
            </div>
          ) : (
            <div className="text-[10px] text-slate-500 italic">Đang phân tích đặc trưng địa hình…</div>
          )}

          <div className="space-y-1.5">
            <label className="flex items-center gap-2 cursor-pointer text-[10.5px]">
              <input
                type="checkbox" checked={showAllPeaks} onChange={() => toggleAllPeaks()}
                className="accent-green-400"
              />
              <span className="text-slate-300">Hiện tất cả cao độ đỉnh trên 3D</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer text-[10.5px]">
              <input
                type="checkbox" checked={showRidgeLines} onChange={() => toggleRidgeLines()}
                className="accent-amber-400"
              />
              <span className="text-slate-300">
                Hiện đường sống núi <span className="text-amber-400">━━</span>
                <span className="text-slate-600 text-[9.5px] ml-1">(nối các đỉnh bằng MST)</span>
              </span>
            </label>
          </div>

          <ModeCommentsBlock mode="features" />
        </div>
      )}

      {inner === 'view' && (
        <div className="space-y-2.5">
          <ViewpointTool />

          {/* Auto-detect đỉnh / thung lũng / mặt nước → đặt điểm view 1-click */}
          <div className="pt-2 border-t border-white/5">
            <AutoViewpoints />
          </div>

          <ModeCommentsBlock mode="viewshed" />
        </div>
      )}

      {inner === 'trees' && (
        <div className="space-y-2.5">
          <label className="flex items-center gap-2 cursor-pointer text-[10.5px]">
            <input
              type="checkbox" checked={env.showTrees} onChange={() => setEnv({ showTrees: !env.showTrees })}
              className="accent-green-400"
            />
            <span className="text-slate-300">Hiện cây xanh hiện trạng (3D)</span>
          </label>

          <div className="grid grid-cols-[60px_1fr_50px] items-center gap-2">
            <label className="text-[10px] uppercase tracking-wider text-slate-500">Chiều cao</label>
            <input
              type="range" min={2} max={30} step={1} value={env.treeHeight}
              onChange={(e) => setEnv({ treeHeight: Number(e.target.value) })}
              className="w-full h-1 accent-green-400"
            />
            <span className="text-[10px] font-mono text-slate-300 text-right">{env.treeHeight}m</span>
          </div>

          {/* Diagnostic + manual layer tagging */}
          <div className="pt-2 border-t border-white/5">
            <TreesDiagnostic />
          </div>
        </div>
      )}
    </SubTabsHorizontal>
  );
}
