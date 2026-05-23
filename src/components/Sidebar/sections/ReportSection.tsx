/**
 * ReportSection.tsx — Mục 5 "Báo cáo"
 *
 * - Sinh báo cáo phân tích (đã có generateReport)
 * - Xuất PNG, JSON
 * - Placeholder: MD-for-PPT, batch PNG từ scenes
 */

import { FileText, Files, FileSliders } from 'lucide-react';
import { useSiteStore } from '../../../store/useSiteStore';
import { ExportPanel } from '../ExportPanel';
import { PlaceholderCard } from './tabs/PlaceholderCard';

export function ReportSection() {
  const generateReport    = useSiteStore(s => s.generateReport);
  const reportLoading     = useSiteStore(s => s.reportLoading);
  const report            = useSiteStore(s => s.report);
  const toggleReportPanel = useSiteStore(s => s.toggleReportPanel);
  const terrain           = useSiteStore(s => s.terrain);
  const scenes            = useSiteStore(s => s.scenes);

  return (
    <div className="flex flex-col gap-3">

      {/* Sinh báo cáo */}
      <div>
        <button
          onClick={() => generateReport(true)}
          disabled={!terrain || reportLoading}
          className="w-full flex items-center justify-center gap-2 py-2 rounded-md text-xs
                     font-bold uppercase bg-purple-500/15 border border-purple-400/40 text-purple-300
                     hover:bg-purple-500/25 transition disabled:opacity-40"
        >
          <FileText size={13} /> {reportLoading ? 'Đang phân tích…' : 'Sinh báo cáo phân tích'}
        </button>
        {report && (
          <button
            onClick={toggleReportPanel}
            className="w-full mt-1.5 text-[10px] text-slate-500 hover:text-purple-300 transition uppercase tracking-wider"
          >
            Xem báo cáo đầy đủ →
          </button>
        )}
      </div>

      {/* Export PNG + JSON (đã có) */}
      <div>
        <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Xuất dữ liệu</div>
        <ExportPanel />
      </div>

      {/* Placeholder: batch PNG từ scenes */}
      <PlaceholderCard
        icon={<Files size={13} />}
        title={`Xuất nhiều PNG từ scenes ${scenes.length > 0 ? `(${scenes.length} scenes)` : ''}`}
        description="Tự động render và lưu PNG chất lượng cao cho tất cả scenes đã lưu — phục vụ xuất ảnh trình chiếu / PPT."
      />

      {/* Placeholder: MD for PPT */}
      <PlaceholderCard
        icon={<FileSliders size={13} />}
        title="Xuất file .md cho Claude/PPT design"
        description="Tổng hợp tất cả nhận xét từ Mục 1, 2, 4 thành file Markdown chuẩn để Claude design tự sinh PowerPoint."
      />

    </div>
  );
}
