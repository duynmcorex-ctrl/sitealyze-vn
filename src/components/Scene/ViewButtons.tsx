/**
 * ViewButtons — Navigation widget, góc trên-trái màn hình 3D.
 * Bố cục: 1 hàng ngang gồm các nút góc nhìn:
 *   [MB] [3D] | [B] [T] [Đ] [N]
 * Đặt ngay bên phải Compass (left ≈ 70px, top ≈ 12px)
 */
import { useSiteStore } from '../../store/useSiteStore';

type Preset = '3d' | 'top' | 'north' | 'south' | 'east' | 'west';

export function ViewButtons() {
  const terrain         = useSiteStore((s) => s.terrain);
  const setCameraPreset = useSiteStore((s) => s.setCameraPreset);

  if (!terrain) return null;

  const go = (id: Preset) => setCameraPreset(id);

  const Btn = ({
    onClick, title, children, accent = false,
  }: {
    onClick: () => void; title: string;
    children: React.ReactNode; accent?: boolean;
  }) => (
    <button
      onClick={onClick}
      title={title}
      className={`flex items-center justify-center rounded text-[10px] font-bold leading-none transition select-none
        ${accent
          ? 'bg-accent-teal/20 border border-accent-teal/60 text-accent-teal hover:bg-accent-teal/35'
          : 'bg-white/6 border border-white/10 text-slate-300 hover:bg-white/14 hover:border-white/30 hover:text-white'
        }`}
      style={{ width: 30, height: 30 }}
    >
      {children}
    </button>
  );

  return (
    <div
      className="absolute z-30 flex items-center gap-1
                 bg-bg-base/80 backdrop-blur-md border border-white/10
                 rounded-xl px-2 py-1.5 shadow-lg"
      style={{ top: 12, left: 68 }}
    >
      {/* Mặt bằng */}
      <Btn onClick={() => go('top')} title="Mặt bằng — nhìn từ trên xuống">
        <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.4">
          <rect x="2" y="2" width="12" height="12" rx="1.5"/>
          <circle cx="8" cy="8" r="1.5" fill="currentColor" stroke="none"/>
        </svg>
      </Btn>

      {/* 3D phối cảnh */}
      <Btn onClick={() => go('3d')} title="Phối cảnh 3D">
        <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.2">
          <path d="M8 2L14 5.5V10.5L8 14L2 10.5V5.5L8 2Z"/>
          <path d="M8 2V8M8 8L14 5.5M8 8L2 5.5"/>
        </svg>
      </Btn>

      {/* Divider */}
      <div className="w-px h-5 bg-white/12 mx-0.5" />

      {/* Bắc */}
      <Btn onClick={() => go('north')} title="Nhìn từ hướng Bắc vào">
        <span className="text-[9px] font-black">B</span>
      </Btn>

      {/* Tây */}
      <Btn onClick={() => go('west')} title="Nhìn từ hướng Tây vào">
        <span className="text-[9px] font-black">T</span>
      </Btn>

      {/* Đông */}
      <Btn onClick={() => go('east')} title="Nhìn từ hướng Đông vào">
        <span className="text-[9px] font-black">Đ</span>
      </Btn>

      {/* Nam */}
      <Btn onClick={() => go('south')} title="Nhìn từ hướng Nam vào">
        <span className="text-[9px] font-black">N</span>
      </Btn>
    </div>
  );
}
