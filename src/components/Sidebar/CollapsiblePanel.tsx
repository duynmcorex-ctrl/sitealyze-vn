/**
 * CollapsiblePanel.tsx
 * Component nền tảng cho 6 mục chính của Sidebar (kiểu SketchUp Default Tray).
 *
 * - Header có color stripe trái 4px theo `color` prop
 * - Số mục ("0.", "1.", ...) trong vòng tròn
 * - Click header → collapse/expand
 * - Persist trạng thái mở/đóng vào localStorage qua persistPanels.ts
 * - Title dài → truncate + tooltip
 */

import { useState, useCallback, ReactNode } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { getPanelOpen, setPanelOpen } from '../../lib/util/persistPanels';

export type PanelColor = 'blue' | 'slate' | 'green' | 'amber' | 'red' | 'purple';

interface Props {
  id: string;
  number: string;           // "0", "1", ..., "5"
  title: string;
  color: PanelColor;
  defaultOpen?: boolean;
  children: ReactNode;
  /** Hiển thị badge nhỏ bên phải header (ví dụ count, status) */
  badge?: ReactNode;
}

// ── Color theme map (Tailwind classes) ───────────────────────────────────────
const COLOR_MAP: Record<PanelColor, { stripe: string; circle: string; ring: string; bg: string }> = {
  blue:   { stripe: 'bg-blue-500',   circle: 'bg-blue-500/25 text-blue-300 border-blue-400/50',     ring: 'ring-blue-400/40',   bg: 'hover:bg-blue-500/5' },
  slate:  { stripe: 'bg-slate-400',  circle: 'bg-slate-500/25 text-slate-300 border-slate-400/50',  ring: 'ring-slate-400/40',  bg: 'hover:bg-slate-500/5' },
  green:  { stripe: 'bg-green-500',  circle: 'bg-green-500/25 text-green-300 border-green-400/50',  ring: 'ring-green-400/40',  bg: 'hover:bg-green-500/5' },
  amber:  { stripe: 'bg-amber-500',  circle: 'bg-amber-500/25 text-amber-300 border-amber-400/50',  ring: 'ring-amber-400/40',  bg: 'hover:bg-amber-500/5' },
  red:    { stripe: 'bg-red-500',    circle: 'bg-red-500/25 text-red-300 border-red-400/50',        ring: 'ring-red-400/40',    bg: 'hover:bg-red-500/5' },
  purple: { stripe: 'bg-purple-500', circle: 'bg-purple-500/25 text-purple-300 border-purple-400/50', ring: 'ring-purple-400/40', bg: 'hover:bg-purple-500/5' },
};

export function CollapsiblePanel({ id, number, title, color, defaultOpen = false, children, badge }: Props) {
  const [open, setOpen] = useState<boolean>(() => getPanelOpen(id, defaultOpen));
  const theme = COLOR_MAP[color];

  const toggle = useCallback(() => {
    setOpen(prev => {
      const next = !prev;
      setPanelOpen(id, next);
      return next;
    });
  }, [id]);

  return (
    <div className="rounded-md overflow-hidden border border-white/5 bg-bg-panel/40 mb-1">
      {/* ── Header ── */}
      <button
        onClick={toggle}
        className={`w-full flex items-stretch text-left transition ${theme.bg}`}
        aria-expanded={open}
      >
        {/* Color stripe */}
        <div className={`w-1 shrink-0 ${theme.stripe}`} />

        {/* Number circle */}
        <div className="flex items-center px-2 py-2">
          <span
            className={`w-5 h-5 rounded-full flex items-center justify-center
                        border text-[10px] font-bold font-mono ${theme.circle}`}
          >
            {number}
          </span>
        </div>

        {/* Title */}
        <div className="flex-1 min-w-0 flex items-center py-2 pr-2">
          <span
            className="text-xs font-bold uppercase tracking-wider text-slate-200 truncate"
            title={title}
          >
            {title}
          </span>
          {badge && <span className="ml-auto mr-2 shrink-0">{badge}</span>}
        </div>

        {/* Chevron */}
        <div className="flex items-center pr-2.5 text-slate-400">
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </div>
      </button>

      {/* ── Content ── */}
      {open && (
        <div className="px-3 py-2.5">
          {children}
        </div>
      )}
    </div>
  );
}
