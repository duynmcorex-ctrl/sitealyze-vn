/**
 * FloodControl3D.tsx
 * Floating panel điều khiển mô phỏng ngập lụt trên 3D canvas.
 * Hiển thị button bật/tắt + slider mực nước, đặt góc dưới-trái màn hình.
 */
import { useEffect } from 'react';
import { Waves } from 'lucide-react';
import { useSiteStore } from '../../store/useSiteStore';

export function FloodControl3D() {
  const terrain         = useSiteStore(s => s.terrain);
  const showFlood3D     = useSiteStore(s => s.showFlood3D);
  const waterLevel      = useSiteStore(s => s.waterLevel3D);
  const toggleFlood3D   = useSiteStore(s => s.toggleFlood3D);
  const setWaterLevel3D = useSiteStore(s => s.setWaterLevel3D);

  // Khởi tạo mực nước = minZ của terrain khi lần đầu load
  useEffect(() => {
    if (terrain && waterLevel === 0) {
      setWaterLevel3D(Math.round(terrain.heightmap.minZ));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [terrain]);

  if (!terrain) return null;

  const { minZ, maxZ } = terrain.heightmap;
  const depthAboveMin = Math.max(0, waterLevel - minZ);
  const coverPct = Math.round(depthAboveMin / Math.max(1, maxZ - minZ) * 100);

  return (
    <div className="absolute bottom-20 left-4 z-30 flex flex-col gap-2 select-none">

      {/* ── Nút bật/tắt ── */}
      <button
        onClick={toggleFlood3D}
        className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold border transition
                    backdrop-blur-md shadow-lg
          ${showFlood3D
            ? 'bg-blue-500/25 border-blue-400/60 text-blue-300 shadow-blue-900/20'
            : 'bg-bg-base/75 border-white/10 text-slate-400 hover:text-slate-200 hover:border-white/25'}`}
      >
        <Waves size={13} />
        Mô phỏng ngập lụt
      </button>

      {/* ── Panel slider — chỉ hiện khi đang bật ── */}
      {showFlood3D && (
        <div className="px-3 py-2.5 rounded-lg bg-bg-base/88 backdrop-blur-md border border-blue-400/35 shadow-lg"
             style={{ minWidth: 210 }}>

          {/* Tiêu đề + mực nước hiện tại */}
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] text-slate-400 font-semibold">Mực nước ngập</span>
            <span className="text-blue-300 font-bold font-mono text-[11px]">{waterLevel.toFixed(1)} m</span>
          </div>

          {/* Slider */}
          <input
            type="range"
            min={minZ}
            max={maxZ}
            step={0.5}
            value={waterLevel}
            onChange={e => setWaterLevel3D(Number(e.target.value))}
            className="w-full h-1.5 accent-blue-400 cursor-pointer"
          />

          {/* Range labels */}
          <div className="flex justify-between text-[9px] text-slate-600 font-mono mt-0.5">
            <span>{minZ.toFixed(0)} m</span>
            <span>{maxZ.toFixed(0)} m</span>
          </div>

          {/* Thông tin ngập */}
          <div className="mt-2 pt-2 border-t border-white/8 flex flex-col gap-1 text-[9.5px]">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: 'rgba(26,111,255,0.52)' }} />
              <span className="text-slate-400">
                Sâu trên nền: <b className="text-blue-300">{depthAboveMin.toFixed(1)} m</b>
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-slate-500">Phủ khoảng:</span>
              <span className={`font-bold ${coverPct > 50 ? 'text-red-400' : coverPct > 20 ? 'text-yellow-400' : 'text-green-400'}`}>
                ~{coverPct}% địa hình
              </span>
            </div>
          </div>

          {/* Nhanh chọn cao độ đặc biệt */}
          <div className="mt-2 flex gap-1 flex-wrap">
            {[
              { label: 'Đáy', v: minZ },
              { label: '+5m', v: minZ + 5 },
              { label: '+10m', v: minZ + 10 },
              { label: '½ Max', v: minZ + (maxZ - minZ) * 0.5 },
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
  );
}
