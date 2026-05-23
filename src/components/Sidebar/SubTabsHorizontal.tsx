/**
 * SubTabsHorizontal.tsx
 * Tab ngang trên đỉnh, content dưới — dùng cho nested tabs trong sub-tab mục 2:
 *  - "Điều kiện tự nhiên" → Khí hậu / Nắng / Gió
 *  - "View" → Điểm-tuyến-diện / View / Cây
 *  - "Địa hình" → Cao độ / Đường đồng mức / Phong thủy
 */

import { ReactNode } from 'react';

export interface HTabDef {
  id: string;
  label: string;
  icon?: ReactNode;
  disabled?: boolean;
}

interface Props {
  tabs: HTabDef[];
  activeId: string;
  onChange: (id: string) => void;
  children: ReactNode;
}

export function SubTabsHorizontal({ tabs, activeId, onChange, children }: Props) {
  return (
    <div className="flex flex-col gap-2">
      {/* ── Tab strip ── */}
      <div className="flex gap-0.5 border-b border-white/8">
        {tabs.map(t => {
          const active = t.id === activeId;
          return (
            <button
              key={t.id}
              onClick={() => !t.disabled && onChange(t.id)}
              disabled={t.disabled}
              title={t.label}
              className={`flex items-center gap-1 px-2.5 py-1 text-[10.5px] font-semibold transition rounded-t-md
                          border-b-2 -mb-px
                          ${active
                            ? 'border-green-400 text-green-200 bg-green-500/10'
                            : 'border-transparent text-slate-400 hover:text-slate-200'}
                          ${t.disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
            >
              {t.icon && <span className="shrink-0">{t.icon}</span>}
              <span className="truncate">{t.label}</span>
            </button>
          );
        })}
      </div>

      {/* ── Content ── */}
      <div>{children}</div>
    </div>
  );
}
