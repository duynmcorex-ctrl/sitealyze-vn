import { Eye, EyeOff } from 'lucide-react';
import { useSiteStore } from '../../store/useSiteStore';

export function ViewpointTool() {
  const setMode = useSiteStore((s) => s.setMode);
  const mode = useSiteStore((s) => s.mode);
  const vp = useSiteStore((s) => s.viewpoint);
  const hideOverlay = useSiteStore((s) => s.hideOverlay);
  const toggle = useSiteStore((s) => s.toggleHideOverlay);
  return (
    <div className="space-y-2">
      <button
        onClick={() => setMode('viewshed')}
        className={`w-full py-2 rounded-md text-xs font-bold uppercase tracking-wider
                   ${mode === 'viewshed' ? 'bg-accent-teal text-bg-base' : 'bg-bg-card hover:bg-white/10 text-slate-300'}`}
      >
        Thêm điểm nhìn (View)
      </button>
      {mode === 'viewshed' && !vp && (
        <div className="text-[11px] text-slate-400">Click lên mặt địa hình để đặt điểm quan sát.</div>
      )}
      {vp && (
        <div className="text-[11px] text-slate-400">
          Đặt tại ({vp.x.toFixed(1)}, {vp.z.toFixed(1)}) — cao {vp.height}m
        </div>
      )}
      <button
        onClick={toggle}
        className="w-full py-2 rounded-md text-xs font-bold uppercase tracking-wider
                   bg-bg-card hover:bg-white/10 text-slate-300 flex items-center justify-center gap-2"
      >
        {hideOverlay ? <EyeOff size={14} /> : <Eye size={14} />}
        {hideOverlay ? 'Hiện thông số' : 'Ẩn thông số'}
      </button>
    </div>
  );
}
