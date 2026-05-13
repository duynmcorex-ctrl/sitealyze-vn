import { FileText } from 'lucide-react';
import { FileUpload } from './FileUpload';
import { EnvParams } from './EnvParams';
import { ModeSelector } from './ModeSelector';
import { ViewpointTool } from './ViewpointTool';
import { ExportPanel } from './ExportPanel';
import { LayerPanel } from './LayerPanel';
import { LandusePanel } from './LandusePanel';
import { ProjectsPanel } from './ProjectsPanel';
import { ProjectInfoPanel } from './ProjectInfoPanel';
import { useSiteStore } from '../../store/useSiteStore';

export function Sidebar() {
  const terrain       = useSiteStore((s) => s.terrain);
  const generateRpt   = useSiteStore((s) => s.generateReport);
  const reportLoading = useSiteStore((s) => s.reportLoading);

  return (
    <aside className="w-80 panel border-l overflow-y-auto">
      <div className="p-4 space-y-5">
        <Section title="1. Tải dữ liệu địa hình">
          <FileUpload />
        </Section>
        <Section title="2. Thông tin dự án">
          <ProjectInfoPanel />
        </Section>
        <Section title="3. Quản lý dự án">
          <ProjectsPanel />
        </Section>
        <Section title="4. Lớp dữ liệu">
          <LayerPanel />
        </Section>
        <Section title="5. Tham số hiện trạng">
          <EnvParams />
        </Section>
        <Section title="6. Chế độ phân tích">
          <ModeSelector />
        </Section>
        <Section title="7. Quy hoạch sử dụng đất">
          <LandusePanel />
        </Section>
        <Section title="8. Công cụ điểm nhìn">
          <ViewpointTool />
        </Section>
        <Section title="9. Báo cáo phân tích">
          <button
            onClick={() => generateRpt()}
            disabled={!terrain || reportLoading}
            className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-lg
                        text-sm font-semibold transition border
                        ${terrain && !reportLoading
                          ? 'bg-accent-teal/15 border-accent-teal/40 text-accent-teal hover:bg-accent-teal/25'
                          : 'bg-bg-card border-white/8 text-slate-600 cursor-not-allowed'}`}
          >
            {reportLoading
              ? <div className="w-4 h-4 border-2 border-accent-teal border-t-transparent rounded-full animate-spin" />
              : <FileText size={15} />
            }
            {reportLoading ? 'Đang sinh báo cáo…' : 'Sinh báo cáo phân tích'}
          </button>
          {!terrain && (
            <p className="text-[10px] text-slate-600 text-center">Tải file DXF trước để kích hoạt</p>
          )}
        </Section>
        <Section title="10. Xuất dữ liệu">
          <ExportPanel />
        </Section>
      </div>
    </aside>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="label-section">{title}</div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}
