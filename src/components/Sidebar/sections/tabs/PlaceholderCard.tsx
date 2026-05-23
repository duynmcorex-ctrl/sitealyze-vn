/**
 * PlaceholderCard.tsx
 * Hiển thị card "Sắp ra mắt" cho các tính năng chưa làm.
 */
import { Sparkles } from 'lucide-react';
import { ReactNode } from 'react';

interface Props {
  title: string;
  description?: string;
  icon?: ReactNode;
}

export function PlaceholderCard({ title, description, icon }: Props) {
  return (
    <div className="rounded-md border border-dashed border-white/15 bg-white/3 px-3 py-2.5 flex items-start gap-2">
      <span className="text-purple-400/70 shrink-0 mt-0.5">{icon ?? <Sparkles size={13} />}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-bold text-slate-300">{title}</span>
          <span className="text-[9px] font-bold text-purple-300 px-1.5 py-0.5 rounded-full
                           bg-purple-500/15 border border-purple-400/30">
            Sắp ra mắt
          </span>
        </div>
        {description && (
          <div className="text-[10px] text-slate-500 mt-1 leading-relaxed">{description}</div>
        )}
      </div>
    </div>
  );
}
