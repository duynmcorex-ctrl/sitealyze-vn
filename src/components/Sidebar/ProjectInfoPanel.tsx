/**
 * ProjectInfoPanel.tsx
 * Bảng thông tin chung của dự án:
 *   - Tên dự án, loại hình, chủ đầu tư / tư vấn
 *   - Vị trí (tỉnh — lấy từ EnvParams geo)
 *   - Diện tích (tự tính từ terrain hoặc nhập thủ công)
 *   - Mô tả / ghi chú
 */
import { useSiteStore } from '../../store/useSiteStore';
import type { ProjectType } from '../../store/useSiteStore';

const PROJECT_TYPE_OPTIONS: { value: ProjectType; label: string }[] = [
  { value: 'kdc',        label: '🏘 Khu dân cư' },
  { value: 'kdt',        label: '🏙 Khu đô thị mới' },
  { value: 'kcn',        label: '🏭 Khu công nghiệp' },
  { value: 'du_lich',    label: '🌴 Du lịch / Nghỉ dưỡng' },
  { value: 'golf',       label: '⛳ Sân golf' },
  { value: 'nong_lam',   label: '🌾 Nông - Lâm nghiệp' },
  { value: 'hanh_chinh', label: '🏛 Hành chính - Trung tâm' },
  { value: 'khac',       label: '📋 Khác' },
];

export function ProjectInfoPanel() {
  const projects          = useSiteStore((s) => s.projects);
  const activeProjectId   = useSiteStore((s) => s.activeProjectId);
  const updateProjectMeta = useSiteStore((s) => s.updateProjectMeta);
  const renameProject     = useSiteStore((s) => s.renameProject);
  const terrain           = useSiteStore((s) => s.terrain);
  const geo               = useSiteStore((s) => s.geo);

  const active = projects.find(p => p.id === activeProjectId);

  // Diện tích tự tính từ terrain (ha)
  const autoAreaHa = terrain
    ? (terrain.heightmap.width * terrain.heightmap.height * terrain.heightmap.cellSize ** 2) / 10000
    : null;
  const displayAreaHa = active?.manualAreaHa ?? autoAreaHa;

  return (
    <div className="space-y-3">
      {/* ── Tên dự án ─────────────────────────────────────────────────────── */}
      <div>
        <label className="text-[10px] uppercase tracking-wider text-slate-500">Tên dự án</label>
        <input
          type="text"
          value={active?.name ?? ''}
          placeholder="VD: Khu đô thị Bắc Lý Nhân"
          onChange={(e) => {
            if (activeProjectId) renameProject(activeProjectId, e.target.value);
          }}
          className="mt-1 w-full px-2 py-1.5 rounded bg-bg-card border border-white/10
                     text-xs text-slate-200 placeholder:text-slate-600 outline-none
                     focus:border-accent-teal/50 transition"
        />
      </div>

      {/* ── Loại hình dự án ────────────────────────────────────────────────── */}
      <div>
        <label className="text-[10px] uppercase tracking-wider text-slate-500">Loại hình</label>
        <select
          value={active?.projectType ?? ''}
          onChange={(e) => updateProjectMeta({ projectType: (e.target.value || undefined) as ProjectType | undefined })}
          className="mt-1 w-full px-2 py-1.5 rounded bg-bg-card border border-white/10
                     text-[11px] text-slate-200 outline-none hover:border-accent-teal/40
                     focus:border-accent-teal transition"
        >
          <option value="">— Chọn loại hình —</option>
          {PROJECT_TYPE_OPTIONS.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      {/* ── Vị trí ─────────────────────────────────────────────────────────── */}
      <div>
        <label className="text-[10px] uppercase tracking-wider text-slate-500">Vị trí</label>
        <div className="mt-1 px-2 py-1.5 rounded bg-bg-card border border-white/10 text-[11px]">
          {geo ? (
            <span className="text-accent-teal">
              📍 {geo.province}
              <span className="text-slate-500 ml-2">
                {geo.lat.toFixed(3)}°N, {geo.lon.toFixed(3)}°E
              </span>
            </span>
          ) : (
            <span className="text-slate-500 italic">
              Chưa xác định — tải KMZ/KML hoặc chọn tỉnh bên dưới
            </span>
          )}
        </div>
      </div>

      {/* ── Diện tích ──────────────────────────────────────────────────────── */}
      <div>
        <div className="flex justify-between items-center">
          <label className="text-[10px] uppercase tracking-wider text-slate-500">Diện tích (ha)</label>
          {autoAreaHa && (
            <span className="text-[9px] text-slate-600">
              Tự tính: {autoAreaHa.toFixed(2)} ha
            </span>
          )}
        </div>
        <input
          type="number"
          value={active?.manualAreaHa ?? ''}
          placeholder={autoAreaHa ? `${autoAreaHa.toFixed(2)} (tự tính)` : 'Nhập diện tích…'}
          min={0} step={0.01}
          onChange={(e) => {
            const v = parseFloat(e.target.value);
            updateProjectMeta({ manualAreaHa: Number.isFinite(v) ? v : undefined });
          }}
          className="mt-1 w-full px-2 py-1.5 rounded bg-bg-card border border-white/10
                     text-xs text-slate-200 placeholder:text-slate-600 outline-none
                     focus:border-accent-teal/50 transition"
        />
        {displayAreaHa && (
          <div className="text-[9px] text-accent-teal mt-0.5">
            ≈ {displayAreaHa.toFixed(2)} ha · {(displayAreaHa * 10000).toFixed(0)} m²
          </div>
        )}
      </div>

      {/* ── Chủ đầu tư / Đơn vị tư vấn ────────────────────────────────────── */}
      <div>
        <label className="text-[10px] uppercase tracking-wider text-slate-500">
          Chủ đầu tư / Đơn vị tư vấn
        </label>
        <input
          type="text"
          value={active?.investor ?? ''}
          placeholder="VD: Công ty TNHH ABC"
          onChange={(e) => updateProjectMeta({ investor: e.target.value || undefined })}
          className="mt-1 w-full px-2 py-1.5 rounded bg-bg-card border border-white/10
                     text-xs text-slate-200 placeholder:text-slate-600 outline-none
                     focus:border-accent-teal/50 transition"
        />
      </div>

      {/* ── Ghi chú / Mô tả ─────────────────────────────────────────────────── */}
      <div>
        <label className="text-[10px] uppercase tracking-wider text-slate-500">Ghi chú</label>
        <textarea
          value={active?.description ?? ''}
          placeholder="Mô tả ngắn về dự án, đặc điểm địa hình, yêu cầu thiết kế…"
          rows={3}
          onChange={(e) => updateProjectMeta({ description: e.target.value || undefined })}
          className="mt-1 w-full px-2 py-1.5 rounded bg-bg-card border border-white/10
                     text-xs text-slate-200 placeholder:text-slate-600 outline-none
                     focus:border-accent-teal/50 transition resize-none leading-relaxed"
        />
      </div>

      {/* ── Summary card ─────────────────────────────────────────────────────── */}
      {active && (active.projectType || displayAreaHa || geo) && (
        <div className="px-2.5 py-2 rounded-md bg-bg-card border border-white/8 space-y-1">
          <div className="text-[9px] uppercase tracking-wider text-slate-500 font-bold mb-1">
            📋 Thông tin dự án
          </div>
          {active.name && (
            <div className="text-[10px] text-slate-200 font-semibold">{active.name}</div>
          )}
          {active.projectType && (
            <div className="text-[10px] text-slate-400">
              {PROJECT_TYPE_OPTIONS.find(o => o.value === active.projectType)?.label}
            </div>
          )}
          {geo && (
            <div className="text-[10px] text-slate-400">📍 {geo.province}</div>
          )}
          {displayAreaHa && (
            <div className="text-[10px] text-slate-400">📐 {displayAreaHa.toFixed(2)} ha</div>
          )}
          {active.investor && (
            <div className="text-[10px] text-slate-500 italic">{active.investor}</div>
          )}
        </div>
      )}
    </div>
  );
}
