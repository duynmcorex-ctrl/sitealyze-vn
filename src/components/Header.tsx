import { Mountain } from 'lucide-react';
import { useSiteStore } from '../store/useSiteStore';

export function Header() {
  const terrain = useSiteStore((s) => s.terrain);
  return (
    <header className="h-12 flex items-center px-4 border-b border-white/5 bg-bg-panel">
      <div className="flex items-center gap-2">
        <Mountain className="text-accent-teal" size={18} />
        <span className="font-bold tracking-wider">SiteAlyze VN</span>
        <span className="text-xs text-slate-500 ml-2">Phân tích hiện trạng quy hoạch</span>
      </div>
      {terrain && (
        <div className="ml-auto flex items-center gap-4 text-xs text-slate-400">
          <span>
            <span className="text-slate-500">Cao độ:</span>{' '}
            <span className="text-slate-200">
              {terrain.heightmap.minZ.toFixed(1)}m → {terrain.heightmap.maxZ.toFixed(1)}m
            </span>
          </span>
          <span>
            <span className="text-slate-500">Lưới:</span>{' '}
            <span className="text-slate-200">
              {terrain.heightmap.width}×{terrain.heightmap.height}
            </span>
          </span>
          <span>
            <span className="text-slate-500">Đường đồng mức:</span>{' '}
            <span className="text-slate-200">{terrain.contours.length}</span>
          </span>
        </div>
      )}
    </header>
  );
}
