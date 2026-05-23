import { useState, useCallback } from 'react';
import { ClipboardCopy, Download, RefreshCw, X, ChevronDown, ChevronRight, FileText } from 'lucide-react';
import { useSiteStore } from '../../store/useSiteStore';
import type { ReportSection, ReportMetric } from '../../lib/types';
import { reportToMarkdown } from '../../lib/report/markdown';

// ── Panel chính ──────────────────────────────────────────────────────────────

export function ReportPanel() {
  const showPanel    = useSiteStore((s) => s.showReportPanel);
  const report       = useSiteStore((s) => s.report);
  const loading      = useSiteStore((s) => s.reportLoading);
  const generateRpt  = useSiteStore((s) => s.generateReport);
  const togglePanel  = useSiteStore((s) => s.toggleReportPanel);

  const [openSections, setOpenSections] = useState<Set<string>>(new Set(['elevation']));
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied'>('idle');

  const toggleSection = useCallback((id: string) => {
    setOpenSections((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const handleCopyAll = useCallback(async () => {
    if (!report) return;
    const md = reportToMarkdown(report);
    await navigator.clipboard.writeText(md);
    setCopyStatus('copied');
    setTimeout(() => setCopyStatus('idle'), 2000);
  }, [report]);

  const handleDownload = useCallback(() => {
    if (!report) return;
    const md = reportToMarkdown(report);
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `SiteAlyze_Report_${new Date().toISOString().slice(0, 10)}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }, [report]);

  if (!showPanel) return null;

  return (
    <div
      className="fixed bottom-4 z-50 flex flex-col"
      style={{ right: 'calc(var(--sidebar-w, 336px) + 1rem)', width: 460, maxHeight: '78vh' }}
    >
      <div className="flex flex-col rounded-xl border border-white/10 bg-bg-base/95 backdrop-blur-md shadow-2xl overflow-hidden">
        {/* ── Header ── */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-white/10 bg-bg-card/60 flex-shrink-0">
          <FileText size={15} className="text-accent-teal" />
          <span className="text-sm font-bold text-slate-100 flex-1">Báo cáo phân tích địa hình</span>

          <button
            onClick={() => generateRpt()}
            disabled={loading}
            title="Sinh lại báo cáo"
            className="p-1.5 rounded hover:bg-white/10 text-slate-400 hover:text-accent-teal transition disabled:opacity-40"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={handleCopyAll}
            disabled={!report}
            title="Sao chép Markdown"
            className="p-1.5 rounded hover:bg-white/10 text-slate-400 hover:text-accent-teal transition disabled:opacity-40"
          >
            <ClipboardCopy size={14} />
          </button>
          <button
            onClick={handleDownload}
            disabled={!report}
            title="Tải file .md"
            className="p-1.5 rounded hover:bg-white/10 text-slate-400 hover:text-accent-teal transition disabled:opacity-40"
          >
            <Download size={14} />
          </button>
          <button
            onClick={togglePanel}
            title="Đóng"
            className="p-1.5 rounded hover:bg-white/10 text-slate-400 hover:text-white transition"
          >
            <X size={14} />
          </button>
        </div>

        {/* ── Copy status toast ── */}
        {copyStatus === 'copied' && (
          <div className="px-4 py-1.5 bg-accent-teal/20 text-accent-teal text-xs text-center font-semibold flex-shrink-0">
            ✓ Đã sao chép vào clipboard
          </div>
        )}

        {/* ── Body ── */}
        <div className="overflow-y-auto flex-1 px-2 py-2 space-y-1">
          {loading && (
            <div className="flex items-center gap-3 justify-center py-10 text-slate-400 text-sm">
              <div className="w-4 h-4 border-2 border-accent-teal border-t-transparent rounded-full animate-spin" />
              Đang phân tích và sinh báo cáo…
            </div>
          )}

          {!loading && !report && (
            <div className="py-8 text-center text-slate-500 text-sm">
              <p className="mb-3">Nhấn <span className="text-accent-teal font-semibold">Sinh lại</span> để tạo báo cáo phân tích</p>
              <button
                onClick={() => generateRpt()}
                className="px-4 py-2 bg-accent-teal/20 hover:bg-accent-teal/30 border border-accent-teal/40 rounded-lg text-accent-teal text-sm font-semibold transition"
              >
                Sinh báo cáo ngay
              </button>
            </div>
          )}

          {!loading && report && report.sections.map((sec) => (
            <SectionAccordion
              key={sec.id}
              section={sec}
              open={openSections.has(sec.id)}
              onToggle={() => toggleSection(sec.id)}
            />
          ))}
        </div>

        {/* ── Footer: terrain info ── */}
        {report && !loading && (
          <div className="px-4 py-2 border-t border-white/10 bg-bg-card/40 flex-shrink-0 text-[10px] text-slate-500 text-center">
            {report.terrain.minZ.toFixed(0)}–{report.terrain.maxZ.toFixed(0)} m •{' '}
            {report.terrain.areaHa < 0.1
              ? `${(report.terrain.areaHa * 10000).toFixed(0)} m²`
              : `${report.terrain.areaHa.toFixed(2)} ha`
            } •{' '}
            {report.terrain.cellSize} m/cell
          </div>
        )}
      </div>
    </div>
  );
}

// ── Accordion section ─────────────────────────────────────────────────────────

function SectionAccordion({
  section: sec,
  open,
  onToggle,
}: {
  section: ReportSection;
  open: boolean;
  onToggle: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopySection = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const lines = [
      `## ${sec.title}`,
      ``,
      sec.summary,
      ``,
      ...sec.metrics.map((m: ReportMetric) => `**${m.label}**: ${m.value}`),
      ``,
      ...sec.notes.map((n) => `- ${n}`),
      ...(sec.recommendations?.length ? [``, `**Khuyến nghị:**`, ...sec.recommendations.map((r) => `- ${r}`)] : []),
    ];
    await navigator.clipboard.writeText(lines.join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="rounded-lg border border-white/8 overflow-hidden">
      {/* Title row */}
      <button
        className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-white/5 transition group"
        onClick={onToggle}
      >
        {open ? (
          <ChevronDown size={13} className="text-accent-teal flex-shrink-0" />
        ) : (
          <ChevronRight size={13} className="text-slate-500 flex-shrink-0" />
        )}
        <span className={`text-[12px] font-semibold flex-1 ${open ? 'text-slate-100' : 'text-slate-400'}`}>
          {sec.title}
        </span>
        {sec.empty && <span className="text-[9px] text-yellow-500 font-semibold uppercase tracking-wider">chưa có data</span>}
        <button
          onClick={handleCopySection}
          title="Sao chép section"
          className="opacity-0 group-hover:opacity-100 transition p-0.5 rounded hover:bg-white/10 text-slate-500 hover:text-accent-teal"
        >
          {copied ? <span className="text-[9px] text-accent-teal font-bold">✓</span> : <ClipboardCopy size={11} />}
        </button>
      </button>

      {/* Body */}
      {open && (
        <div className="px-4 pb-3 space-y-2 border-t border-white/5">
          {sec.empty ? (
            <p className="text-xs text-slate-500 italic py-2">{sec.emptyMessage ?? 'Chưa có dữ liệu phân tích'}</p>
          ) : (
            <>
              <p className="text-[11px] text-slate-300 leading-relaxed pt-2">{sec.summary}</p>

              {/* Metrics grid */}
              {sec.metrics.length > 0 && (
                <div className="grid grid-cols-2 gap-1.5">
                  {sec.metrics.map((m, i) => (
                    <div
                      key={i}
                      className={`rounded-md px-2.5 py-1.5 ${
                        m.emphasis === 'good' ? 'bg-emerald-900/30 border border-emerald-700/30' :
                        m.emphasis === 'warn' ? 'bg-amber-900/30 border border-amber-700/30' :
                        m.emphasis === 'bad'  ? 'bg-red-900/30 border border-red-700/30' :
                        'bg-white/5 border border-white/8'
                      }`}
                    >
                      <div className="text-[9px] uppercase tracking-wider text-slate-500">{m.label}</div>
                      <div className={`text-[12px] font-mono font-semibold mt-0.5 ${
                        m.emphasis === 'good' ? 'text-emerald-400' :
                        m.emphasis === 'warn' ? 'text-amber-400' :
                        m.emphasis === 'bad'  ? 'text-red-400' :
                        'text-slate-200'
                      }`}>{m.value}</div>
                    </div>
                  ))}
                </div>
              )}

              {/* Notes */}
              {sec.notes.length > 0 && (
                <ul className="space-y-1 pt-1">
                  {sec.notes.map((n, i) => (
                    <li key={i} className="flex gap-2 text-[11px] text-slate-400 leading-snug">
                      <span className="text-accent-teal mt-0.5 flex-shrink-0">•</span>
                      <span>{n}</span>
                    </li>
                  ))}
                </ul>
              )}

              {/* Recommendations */}
              {sec.recommendations && sec.recommendations.length > 0 && (
                <div className="mt-2 pt-2 border-t border-white/5">
                  <div className="text-[9px] uppercase tracking-wider text-accent-teal mb-1.5">Khuyến nghị</div>
                  <ul className="space-y-1">
                    {sec.recommendations.map((r, i) => (
                      <li key={i} className="flex gap-2 text-[11px] text-slate-300 leading-snug">
                        <span className="text-accent-teal mt-0.5 flex-shrink-0">→</span>
                        <span>{r}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Trigger button (khi panel đóng) ─────────────────────────────────────────

export function ReportTrigger() {
  const togglePanel = useSiteStore((s) => s.toggleReportPanel);
  const showPanel   = useSiteStore((s) => s.showReportPanel);
  const terrain     = useSiteStore((s) => s.terrain);
  const loading     = useSiteStore((s) => s.reportLoading);

  if (showPanel || !terrain) return null;

  return (
    <button
      onClick={togglePanel}
      className="fixed bottom-4 z-40 flex items-center gap-2 px-3 py-2
                 bg-bg-card/90 backdrop-blur-sm border border-white/15
                 rounded-lg text-xs font-semibold text-slate-300
                 hover:border-accent-teal/60 hover:text-accent-teal transition shadow-lg"
      style={{ right: 'calc(var(--sidebar-w, 336px) + 1rem)' }}
      title="Mở báo cáo phân tích"
    >
      {loading
        ? <div className="w-3.5 h-3.5 border-2 border-accent-teal border-t-transparent rounded-full animate-spin" />
        : <FileText size={14} className="text-accent-teal" />
      }
      Báo cáo
    </button>
  );
}
