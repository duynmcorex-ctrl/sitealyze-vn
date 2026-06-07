/**
 * Sidebar.tsx — v0.7.0
 * 6 mục CollapsiblePanel kiểu SketchUp Default Tray + resize handle.
 */

import { useState, useEffect } from 'react';
import { CollapsiblePanel } from './CollapsiblePanel';
import { ResizeHandle, getStoredSidebarWidth } from './ResizeHandle';
import { ProjectManagementSection } from './sections/ProjectManagementSection';
import { GeneralInfoSection }       from './sections/GeneralInfoSection';
import { EvaluationSection }        from './sections/EvaluationSection';
import { PlanningSection }          from './sections/PlanningSection';
import { SimulationSection }        from './sections/SimulationSection';
import { ReportSection }            from './sections/ReportSection';

export function Sidebar() {
  const [width, setWidth] = useState<number>(() => getStoredSidebarWidth());

  // Set CSS var on mount with initial value
  useEffect(() => {
    document.documentElement.style.setProperty('--sidebar-w', width + 'px');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Đồng bộ sidebar width vào CSS custom property để ReportPanel + các overlay fixed
  // có thể dùng `right: calc(var(--sidebar-w) + Xpx)` mà không hardcode 336px
  const handleResize = (w: number) => {
    setWidth(w);
    document.documentElement.style.setProperty('--sidebar-w', w + 'px');
  };

  return (
    // Wrapper div bao ngoài để ResizeHandle KHÔNG bị clipped bởi overflow-y:auto của aside
    <div className="relative shrink-0 flex" style={{ width }}>
      <ResizeHandle width={width} onChange={handleResize} />

      <aside className="flex-1 panel border-l overflow-y-auto min-w-0">
      <div className="p-3 pt-3 pl-4">
        <CollapsiblePanel id="projects" number="0" title="Quản lý dự án" color="blue" defaultOpen>
          <ProjectManagementSection />
        </CollapsiblePanel>

        <CollapsiblePanel id="general" number="1" title="Thông tin chung" color="slate">
          <GeneralInfoSection />
        </CollapsiblePanel>

        <CollapsiblePanel id="evaluation" number="2" title="Đánh giá hiện trạng" color="green">
          <EvaluationSection />
        </CollapsiblePanel>

        <CollapsiblePanel id="planning" number="3" title="Phương án quy hoạch" color="amber">
          <PlanningSection />
        </CollapsiblePanel>

        <CollapsiblePanel id="simulation" number="4" title="Mô phỏng" color="red">
          <SimulationSection />
        </CollapsiblePanel>

        <CollapsiblePanel id="report" number="5" title="Báo cáo" color="purple">
          <ReportSection />
        </CollapsiblePanel>
      </div>
      </aside>
    </div>
  );
}
