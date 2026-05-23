/**
 * HydroTab.tsx — Sub-tab 6 "Thủy văn"
 * Bao gồm: mật độ mũi tên + mô phỏng ngập lụt 3D (FloodControl nội tuyến).
 */

import { useEffect } from 'react';
import { Waves } from 'lucide-react';
import { useSiteStore } from '../../../../store/useSiteStore';
import { ModeCommentsBlock } from '../ModeCommentsBlock';

export function HydroTab() {
  const setMode         = useSiteStore(s => s.setMode);
  const env             = useSiteStore(s => s.env);
  const setEnv          = useSiteStore(s => s.setEnv);
  const terrain         = useSiteStore(s => s.terrain);
  const showFlood3D     = useSiteStore(s => s.showFlood3D);
  const waterLevel      = useSiteStore(s => s.waterLevel3D);
  const toggleFlood3D   = useSiteStore(s => s.toggleFlood3D);
  const setWaterLevel3D = useSiteStore(s => s.setWaterLevel3D);

  useEffect(() => { setMode('hydrology'); }, [setMode]);

  // Khởi tạo mực nước = minZ khi lần đầu load terrain
  useEffect(() => {
    if (terrain && waterLevel === 0) {
      setWaterLevel3D(Math.round(terrain.heightmap.minZ));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [terrain]);

  const minZ = terrain?.heightmap.minZ ?? 0;
  const maxZ = terrain?.heightmap.maxZ ?? 100;
  const depthAboveMin = Math.max(0, waterLevel - minZ);
  const coverPct = Math.round(depthAboveMin / Math.max(1, maxZ - minZ) * 100);

  return (
    <div className="space-y-2.5">
      {/* Mật độ mũi tên */}
      <div className="grid grid-cols-[80px_1fr_50px] items-center gap-2">
        <label className="text-[10px] uppercase tracking-wider text-slate-500">Mũi tên</label>
        <input
          type="range" min={0.5} max={3} step={0.1} value={env.flowArrowDensity}
          onChange={(e) => setEnv({ flowArrowDensity: Number(e.target.value) })}
          className="w-full h-1 accent-green-400"
        />
        <span className="text-[10px] font-mono text-slate-300 text-right">{env.flowArrowDensity.toFixed(1)}×</span>
      </div>

      {/* Mô phỏng ngập lụt */}
      <div className="pt-1.5 border-t border-white/8">
        <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1.5 flex items-center gap-1">
          <Waves size={10} /> Mô phỏng ngập lụt 3D
        </div>

        {/* Toggle bật/tắt */}
        <button
          onClick={toggleFlood3D}
          className={`w-full flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-bold border transition mb-1.5
            ${showFlood3D
              ? 'bg-blue-500/25 border-blue-400/60 text-blue-300'
              : 'border-white/10 text-slate-400 hover:text-slate-200 hover:border-white/25'}`}
        >
          <Waves size={12} />
          {showFlood3D ? `Đang bật — mực ${waterLevel.toFixed(1)} m` : 'Bật mô phỏng ngập'}
        </button>

        {/* Slider mực nước — chỉ hiện khi bật */}
        {showFlood3D && terrain && (
          <div className="space-y-1.5 px-1">
            <div className="grid grid-cols-[70px_1fr_55px] items-center gap-2">
              <label className="text-[10px] uppercase tracking-wider text-slate-500">Mực nước</label>
              <input
                type="range" min={minZ} max={maxZ} step={0.5} value={waterLevel}
                onChange={e => setWaterLevel3D(Number(e.target.value))}
                className="w-full h-1.5 accent-blue-400 cursor-pointer"
              />
              <span className="text-[10px] font-mono text-blue-300 text-right">{waterLevel.toFixed(1)} m</span>
            </div>

            <div className="flex justify-between text-[9px] text-slate-600 font-mono">
              <span>{minZ.toFixed(0)} m (đáy)</span>
              <span>{maxZ.toFixed(0)} m (đỉnh)</span>
            </div>

            {/* Thông tin ngập */}
            <div className="flex gap-3 text-[9.5px]">
              <span className="text-slate-500">
                Sâu: <b className="text-blue-300">{depthAboveMin.toFixed(1)} m</b>
              </span>
              <span className={`font-bold ${coverPct > 50 ? 'text-red-400' : coverPct > 20 ? 'text-yellow-400' : 'text-green-400'}`}>
                ~{coverPct}% địa hình
              </span>
            </div>

            {/* Nhanh chọn mốc */}
            <div className="flex gap-1 flex-wrap pt-0.5">
              {[
                { label: 'Đáy', v: minZ },
                { label: '+5m', v: minZ + 5 },
                { label: '+10m', v: minZ + 10 },
                { label: '½', v: minZ + (maxZ - minZ) * 0.5 },
              ].map(({ label, v }) => (
                <button
                  key={label}
                  onClick={() => setWaterLevel3D(Math.min(maxZ, v))}
                  className={`px-1.5 py-0.5 rounded text-[9px] font-bold border transition
                    ${Math.abs(waterLevel - v) < 0.5
                      ? 'bg-blue-500/30 border-blue-400/60 text-blue-300'
                      : 'bg-white/5 border-white/10 text-slate-500 hover:text-slate-300'}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <ModeCommentsBlock mode="hydrology" />
    </div>
  );
}
