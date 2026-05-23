/**
 * ModeCommentsBlock.tsx
 * Block hiển thị nhận xét (summary + metrics + notes + recommendations) cho 1 mode.
 *
 * Trước đây nội dung này nằm ở Legend.tsx (góc trái màn hình 3D).
 * Theo yêu cầu redesign: chuyển vào panel content trong Sidebar mục 2.
 *
 * Dùng trong từng tab của EvaluationSection: <ModeCommentsBlock mode="elevation"/>
 */

import { useSiteStore } from '../../../store/useSiteStore';
import type { AnalysisMode } from '../../../lib/types';

interface Props {
  mode: AnalysisMode;
  /** Số notes tối đa hiển thị (mặc định 8 — nhiều hơn Legend vì có không gian) */
  maxNotes?: number;
  /** Số recommendations tối đa hiển thị (mặc định 5) */
  maxRecommendations?: number;
}

export function ModeCommentsBlock({ mode, maxNotes = 8, maxRecommendations = 5 }: Props) {
  const report = useSiteStore(s => s.report);
  const reportLoading = useSiteStore(s => s.reportLoading);
  const generateReport = useSiteStore(s => s.generateReport);
  const toggleReportPanel = useSiteStore(s => s.toggleReportPanel);

  const section = report?.sections.find(s => s.id === mode);

  // Chưa có báo cáo → CTA "Sinh báo cáo"
  if (!report) {
    return (
      <div className="mt-3 pt-2.5 border-t border-white/8 flex flex-col items-start gap-1.5">
        <div className="text-[10px] text-slate-500">Chưa có nhận xét phân tích cho mục này.</div>
        <button
          onClick={() => generateReport(false)}
          disabled={reportLoading}
          className="text-[10px] px-2 py-1 rounded bg-accent-teal/15 border border-accent-teal/40
                     text-accent-teal hover:bg-accent-teal/25 transition disabled:opacity-50"
        >
          {reportLoading ? 'Đang phân tích…' : 'Sinh báo cáo'}
        </button>
      </div>
    );
  }

  // Có báo cáo nhưng section trống
  if (!section || (section.notes.length === 0 && (section.recommendations?.length ?? 0) === 0 && !section.summary)) {
    return (
      <div className="mt-3 pt-2.5 border-t border-white/8 text-[10px] text-slate-500 italic">
        Chưa đủ dữ liệu để nhận xét cho mục này.
      </div>
    );
  }

  return (
    <div className="mt-3 pt-2.5 border-t border-white/8 space-y-2">
      {/* Summary */}
      {section.summary && (
        <div className="text-[11px] text-slate-200 leading-snug">
          {section.icon && <span className="mr-1">{section.icon}</span>}
          {section.summary}
        </div>
      )}

      {/* Metrics */}
      {section.metrics.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {section.metrics.map((m, i) => (
            <span
              key={i}
              className={`px-1.5 py-0.5 rounded text-[9.5px] font-mono border ${
                m.emphasis === 'good' ? 'bg-emerald-500/10 border-emerald-400/40 text-emerald-300' :
                m.emphasis === 'warn' ? 'bg-amber-500/10 border-amber-400/40 text-amber-300' :
                m.emphasis === 'bad'  ? 'bg-red-500/10 border-red-400/40 text-red-300' :
                                        'bg-bg-card border-white/10 text-slate-300'
              }`}
              title={m.label}
            >
              <span className="text-slate-500 font-normal">{m.label}: </span>
              {m.value}
            </span>
          ))}
        </div>
      )}

      {/* Notes */}
      {section.notes.length > 0 && (
        <ul className="space-y-1 text-[10.5px] text-slate-300 leading-relaxed list-disc pl-4">
          {section.notes.slice(0, maxNotes).map((note, i) => (
            <li key={i}>{note}</li>
          ))}
        </ul>
      )}

      {/* Recommendations */}
      {(section.recommendations?.length ?? 0) > 0 && (
        <div className="px-2 py-1.5 rounded bg-accent-teal/10 border border-accent-teal/30">
          <div className="text-[9.5px] uppercase tracking-wider text-accent-teal font-bold mb-1">
            💡 Khuyến nghị
          </div>
          <ul className="space-y-0.5 text-[10.5px] text-slate-200 leading-relaxed list-disc pl-3.5">
            {section.recommendations!.slice(0, maxRecommendations).map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Link mở full report */}
      <button
        onClick={toggleReportPanel}
        className="w-full text-[9.5px] uppercase tracking-wider text-slate-500 hover:text-accent-teal transition py-0.5 text-left"
      >
        Xem báo cáo đầy đủ →
      </button>
    </div>
  );
}
