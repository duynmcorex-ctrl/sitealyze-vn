import { Mountain, Sun, Moon, Map } from 'lucide-react';
import { useSiteStore } from '../store/useSiteStore';

export function Header() {
  const terrain       = useSiteStore((s) => s.terrain);
  const theme         = useSiteStore((s) => s.theme);
  const toggleTheme   = useSiteStore((s) => s.toggleTheme);
  const showBasemap   = useSiteStore((s) => s.showBasemap);
  const toggleBasemap = useSiteStore((s) => s.toggleBasemap);
  const geo           = useSiteStore((s) => s.geo);

  return (
    <header className="h-12 flex items-center px-4 border-b border-white/5 bg-bg-panel">
      <div className="flex items-center gap-2">
        <Mountain className="text-accent-teal" size={18} />
        <span className="font-bold tracking-wider text-slate-100">SiteAlyze VN</span>
        <span
          className="text-[10px] font-bold font-mono px-1.5 py-0.5 rounded bg-accent-teal/15 text-accent-teal border border-accent-teal/30"
          title="Phiên bản hiện tại — xem CHANGELOG_VN.md để biết các phiên bản khác"
        >
          v{__APP_VERSION__}
        </span>
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

      {/* ── Nút bản đồ 2D ── */}
      {terrain && (
        <button
          onClick={toggleBasemap}
          title={geo ? 'Xem bản đồ vệ tinh + POI xung quanh khu đất' : 'Chọn tỉnh bên phải để neo bản đồ đúng vị trí'}
          className={`ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs
                      font-semibold border transition
                      ${showBasemap
                        ? 'bg-accent-teal/20 border-accent-teal text-accent-teal'
                        : 'bg-bg-card border-white/10 text-slate-300 hover:border-accent-teal/40 hover:text-accent-teal'}`}
        >
          <Map size={13} />
          {showBasemap ? 'Ẩn bản đồ' : 'Bản đồ vệ tinh'}
        </button>
      )}

      {/* ── Nút chuyển light / dark mode ── */}
      <button
        onClick={toggleTheme}
        title={theme === 'dark' ? 'Chuyển sang chế độ sáng' : 'Chuyển sang chế độ tối'}
        className={`${terrain ? 'ml-2' : 'ml-auto'} flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs
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
