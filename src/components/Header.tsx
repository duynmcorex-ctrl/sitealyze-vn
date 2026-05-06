import { Mountain, Sun, Moon } from 'lucide-react';
import { useSiteStore } from '../store/useSiteStore';

export function Header() {
  const terrain     = useSiteStore((s) => s.terrain);
  const theme       = useSiteStore((s) => s.theme);
  const toggleTheme = useSiteStore((s) => s.toggleTheme);

  return (
    <header className="h-12 flex items-center px-4 border-b border-white/5 bg-bg-panel">
      <div className="flex items-center gap-2">
        <Mountain className="text-accent-teal" size={18} />
        <span className="font-bold tracking-wider text-slate-100">SiteAlyze VN</span>
        <span className="text-xs text-slate-500 ml-2">Phân tích hiện trạng quy hoạch</span>
      </div>

      {terrain && (
        <div className="ml-4 flex items-center gap-4 text-xs text-slate-400">
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

      {/* ── Nút chuyển light / dark mode ── */}
      <button
        onClick={toggleTheme}
        title={theme === 'dark' ? 'Chuyển sang chế độ sáng' : 'Chuyển sang chế độ tối'}
        className={`ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs
                    font-semibold border transition
                    ${theme === 'dark'
                      ? 'bg-bg-card border-white/10 text-slate-300 hover:border-accent-teal/40 hover:text-accent-teal'
                      : 'bg-accent-teal/10 border-accent-teal/40 text-accent-teal hover:bg-accent-teal/20'}`}
      >
        {theme === 'dark'
          ? <><Sun size={13} /> Sáng</>
          : <><Moon size={13} /> Tối</>
        }
      </button>
    </header>
  );
}
