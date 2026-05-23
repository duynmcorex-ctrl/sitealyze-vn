/**
 * SubTabsVertical.tsx
 * 9 tab dọc bên trái + content bên phải — dùng cho mục 2 "Đánh giá hiện trạng".
 *
 * Mỗi tab chỉ hiển thị icon — hover/focus hiện tooltip với tên đầy đủ.
 * Tooltip = native HTML title (hiện sau 0.5s delay).
 */

import { ReactNode, useState } from 'react';

export interface VTabDef {
  id: string;
  label: string;
  icon?: ReactNode;
  /** Hiển thị badge nhỏ trên icon (vd: count) */
  badge?: ReactNode;
  /** Disable tab — mờ + cursor not-allowed */
  disabled?: boolean;
}

interface Props {
  tabs: VTabDef[];
  activeId: string;
  onChange: (id: string) => void;
  children: ReactNode;          // content của tab đang active
}

/** Custom tooltip floating bên phải nút khi hover (vì native title chậm) */
function TabButton({
  tab, active, onClick,
}: {
  tab: VTabDef; active: boolean; onClick: () => void;
}) {
  const [hover, setHover] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => !tab.disabled && onClick()}
        disabled={tab.disabled}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        onFocus={() => setHover(true)}
        onBlur={() => setHover(false)}
        aria-label={tab.label}
        title={tab.label}
        className={`relative flex items-center justify-center w-9 h-9 rounded-md transition border
                    ${active
                      ? 'bg-green-500/25 border-green-400/60 text-green-200'
                      : 'border-transparent text-slate-400 hover:text-slate-100 hover:bg-white/8'}
                    ${tab.disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
      >
        {tab.icon}
        {tab.badge && (
          <span className="absolute -top-0.5 -right-0.5">{tab.badge}</span>
        )}
      </button>

      {/* Tooltip floating bên TRÁI — tránh bị che bởi content bên phải */}
      {hover && (
        <div
          className="absolute right-full mr-2 top-1/2 -translate-y-1/2 z-50
                     px-2 py-1 rounded-md bg-bg-dark border border-white/15
                     text-[10.5px] text-slate-100 font-semibold whitespace-nowrap
                     shadow-lg pointer-events-none"
        >
          {tab.label}
          {/* Mũi tên trỏ sang phải (về phía icon) */}
          <span className="absolute left-full top-1/2 -translate-y-1/2 w-0 h-0
                           border-t-[4px] border-t-transparent
                           border-b-[4px] border-b-transparent
                           border-l-[5px] border-l-white/15" />
        </div>
      )}
    </div>
  );
}

export function SubTabsVertical({ tabs, activeId, onChange, children }: Props) {
  const activeTab = tabs.find(t => t.id === activeId);

  return (
    <div className="flex gap-1.5 min-h-[300px]">
      {/* ── Tab list (dọc bên trái) — chỉ icon ── */}
      <div className="flex flex-col gap-1 shrink-0">
        {tabs.map(t => (
          <TabButton
            key={t.id}
            tab={t}
            active={t.id === activeId}
            onClick={() => onChange(t.id)}
          />
        ))}
      </div>

      {/* ── Content (bên phải) ── */}
      <div className="flex-1 min-w-0 rounded-md bg-white/3 border border-white/5 overflow-hidden">
        {/* Tiêu đề tab đang active */}
        {activeTab && (
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 border-b border-white/8 bg-white/2">
            <span className="text-green-400 shrink-0" style={{ fontSize: 12 }}>{activeTab.icon}</span>
            <span className="text-[10.5px] font-bold text-slate-200 uppercase tracking-wider">
              {activeTab.label}
            </span>
          </div>
        )}
        <div className="p-2.5">
          {children}
        </div>
      </div>
    </div>
  );
}
