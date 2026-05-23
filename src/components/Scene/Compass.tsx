/**
 * Compass — La bàn góc trên-trái màn hình 3D.
 * Xoay theo azimuth camera thực tế (cập nhật mỗi frame từ AzimuthSync).
 */
import { useSiteStore } from '../../store/useSiteStore';

export function Compass() {
  const azimuth = useSiteStore((s) => s.cameraAzimuth); // rad, từ AzimuthSync
  // Compass kim Bắc: khi azimuth = 0 (camera nhìn từ phía -Z → địa hình), Bắc ở trên
  // Xoay compass ngược chiều azimuth để kim luôn chỉ Bắc thực
  const deg = (azimuth * 180) / Math.PI;

  return (
    <div
      className="absolute top-12 left-3 z-30 w-14 h-14 rounded-full
                 bg-bg-base/80 backdrop-blur-md border border-white/10
                 shadow-lg flex items-center justify-center pointer-events-none"
    >
      <div className="relative w-10 h-10" style={{ transform: `rotate(${-deg}deg)` }}>
        {/* Kim Bắc (teal) */}
        <svg viewBox="0 0 40 40" className="w-10 h-10" fill="none">
          <polygon points="20,4 23,20 20,17 17,20" fill="#22d3c5" />
          <polygon points="20,36 23,20 20,23 17,20" fill="#475569" />
          <circle cx="20" cy="20" r="2" fill="#22d3c5" />
        </svg>
        {/* Chữ B */}
        <span
          className="absolute font-black text-[8px] text-accent-teal leading-none"
          style={{ top: -1, left: '50%', transform: 'translateX(-50%)' }}
        >B</span>
      </div>
    </div>
  );
}
