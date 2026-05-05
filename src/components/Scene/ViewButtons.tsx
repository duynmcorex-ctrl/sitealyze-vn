/**
 * ViewButtons — compact navigation widget, góc trên phải dưới compass.
 */
import { useSiteStore } from '../../store/useSiteStore';

type Preset = '3d' | 'top' | 'north' | 'south' | 'east' | 'west';

export function ViewButtons() {
  const terrain         = useSiteStore((s) => s.terrain);
  const setCameraPreset = useSiteStore((s) => s.setCameraPreset);
  const setEnv          = useSiteStore((s) => s.setEnv);

  if (!terrain) return null;

  const go = (id: Preset) => setCameraPreset(id);

  const resetNorth = () => {
    setEnv({ northRotation: 0 });
    setCameraPreset('top');
  };

  // Nút icon nhỏ chung
  const Btn = ({
    onClick, title, children, accent = false,
  }: {
    onClick: () => void; title: string;
    children: React.ReactNode; accent?: boolean;
  }) => (
    <button
      onClick={onClick}
      title={title}
      className={`flex items-center justify-center rounded text-[11px] font-bold leading-none transition select-none
        ${accent
          ? 'bg-accent-teal/20 border border-accent-teal/60 text-accent-teal hover:bg-accent-teal/35'
          : 'bg-white/6 border border-white/10 text-slate-300 hover:bg-white/12 hover:border-white/25 hover:text-white'
        }`}
      style={{ width: 28, height: 28 }}
    >
      {children}
    </button>
  );

  return (
    <div
      className="absolute z-30"
      style={{ top: 100, right: 336 + 8 }}
    >
      <div
        className="flex flex-col gap-1 p-1.5 rounded-xl
                   bg-bg-base/75 backdrop-blur-md border border-white/10 shadow-lg"
      >
        {/* ── Hàng 1: Reset Bắc + MB ── */}
        <div className="flex gap-1">
          {/* Reset Bắc */}
          <Btn onClick={resetNorth} title="Reset hướng Bắc + Mặt bằng" accent>
            {/* Compass icon + N */}
            <svg viewBox="0 0 16 16" width="14" height="14" fill="none">
              <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.2"/>
              <polygon points="8,2 9.2,7 8,6.2 6.8,7" fill="#22d3c5"/>
              <polygon points="8,14 9.2,9 8,9.8 6.8,9" fill="#64748b"/>
              <circle cx="8" cy="8" r="1.2" fill="currentColor"/>
            </svg>
          </Btn>

          {/* Mặt bằng (top) */}
          <Btn onClick={() => go('top')} title="Mặt bằng (Top)">
            {/* Square with dot */}
            <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.3">
              <rect x="2" y="2" width="12" height="12" rx="1.5"/>
              <circle cx="8" cy="8" r="1.5" fill="currentColor" stroke="none"/>
            </svg>
          </Btn>

          {/* 3D */}
          <Btn onClick={() => go('3d')} title="Phối cảnh 3D">
            {/* Cube icon */}
            <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.2">
              <path d="M8 2L14 5.5V10.5L8 14L2 10.5V5.5L8 2Z"/>
              <path d="M8 2V8M8 8L14 5.5M8 8L2 5.5"/>
            </svg>
          </Btn>
        </div>

        {/* ── Hàng 2–4: Cross (4 hướng) ── */}
        {/* Bắc */}
        <div className="flex justify-center">
          <Btn onClick={() => go('north')} title="Mặt đứng Bắc (nhìn từ phía Bắc vào)">
            <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
              <text x="8" y="11" textAnchor="middle" fontSize="8" fontWeight="900" fontFamily="Arial">B</text>
              <polygon points="8,1 10.5,5 5.5,5"/>
            </svg>
          </Btn>
        </div>

        {/* Tây + Đông */}
        <div className="flex gap-1 justify-center">
          <Btn onClick={() => go('west')} title="Mặt cắt Tây (nhìn từ phía Tây vào)">
            <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
              <text x="9" y="10.5" textAnchor="middle" fontSize="7" fontWeight="900" fontFamily="Arial">T</text>
              <polygon points="1,8 5,5.5 5,10.5"/>
            </svg>
          </Btn>

          {/* Centre dot */}
          <div className="flex items-center justify-center" style={{ width: 28, height: 28 }}>
            <div className="w-1.5 h-1.5 rounded-full bg-slate-600"/>
          </div>

          <Btn onClick={() => go('east')} title="Mặt cắt Đông (nhìn từ phía Đông vào)">
            <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
              <text x="7" y="10.5" textAnchor="middle" fontSize="7" fontWeight="900" fontFamily="Arial">Đ</text>
              <polygon points="15,8 11,5.5 11,10.5"/>
            </svg>
          </Btn>
        </div>

        {/* Nam */}
        <div className="flex justify-center">
          <Btn onClick={() => go('south')} title="Mặt đứng Nam (nhìn từ phía Nam vào)">
            <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
              <text x="8" y="9" textAnchor="middle" fontSize="8" fontWeight="900" fontFamily="Arial">N</text>
              <polygon points="8,15 10.5,11 5.5,11"/>
            </svg>
          </Btn>
        </div>
      </div>
    </div>
  );
}
