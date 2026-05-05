import { useSiteStore } from '../../store/useSiteStore';

export function Compass() {
  const rot = useSiteStore((s) => s.env.northRotation);
  return (
    <div className="absolute top-4 right-[336px] w-20 h-20 panel rounded-full flex items-center justify-center pointer-events-none">
      <div className="relative w-full h-full" style={{ transform: `rotate(${-rot}deg)` }}>
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-[10px] font-bold text-slate-300 absolute top-1">B</div>
          <div className="text-[10px] font-bold text-slate-500 absolute bottom-1">N</div>
          <div className="text-[10px] font-bold text-slate-500 absolute left-1">T</div>
          <div className="text-[10px] font-bold text-slate-500 absolute right-1">Đ</div>
          <svg viewBox="0 0 40 40" className="w-12 h-12">
            <polygon points="20,6 23,20 20,18 17,20" fill="#22d3c5" />
            <polygon points="20,34 23,20 20,22 17,20" fill="#64748b" />
            <circle cx="20" cy="20" r="1.5" fill="#22d3c5" />
          </svg>
        </div>
      </div>
    </div>
  );
}
