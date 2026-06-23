/**
 * ProjectManagementSection.tsx — Mục 0 "Quản lý dự án"
 *
 * Cấu trúc theo PDF slide 3:
 *   1. Tabs dự án ngang (Dự án 1, 2, 3, + Thêm)
 *   2. Tên dự án — input
 *   3. Tải file CAD (.DWG / .DXF)
 *   4. Lớp dữ liệu (LayerPanel)
 *   5. Scene (ScenesPanel — camera bookmarks)
 *   6. Save / Mở .siteproj.json
 */

import { useRef, useState } from 'react';
import { Plus, Eye, EyeOff, X, Save, FolderOpen, MapPin, Upload } from 'lucide-react';
import { useSiteStore } from '../../../store/useSiteStore';
import { FileUpload } from '../FileUpload';
import { LayerPanel } from '../LayerPanel';
import { ScenesPanel } from '../ScenesPanel';
import { saveProject, loadProject } from '../../../lib/project/saveLoad';
import { parseBoundaryFile } from '../../../lib/coord/parseKml';
import { buildTerrainFromBoundary } from '../../../lib/dem/buildDemTerrain';

export function ProjectManagementSection() {
  const projects        = useSiteStore(s => s.projects);
  const activeProjectId = useSiteStore(s => s.activeProjectId);
  const createProject   = useSiteStore(s => s.createProject);
  const switchProject   = useSiteStore(s => s.switchProject);
  const removeProject   = useSiteStore(s => s.removeProject);
  const renameProject   = useSiteStore(s => s.renameProject);
  const toggleProjectVisible = useSiteStore(s => s.toggleProjectVisible);

  const terrain         = useSiteStore(s => s.terrain);
  const overlayLayers   = useSiteStore(s => s.overlayLayers);
  const env             = useSiteStore(s => s.env);
  const scenes          = useSiteStore(s => s.scenes);
  const setTerrain      = useSiteStore(s => s.setTerrain);
  const setOverlayLayers = useSiteStore(s => s.setOverlayLayers);
  const computeForMode  = useSiteStore(s => s.computeForMode);
  const mode            = useSiteStore(s => s.mode);
  const setError        = useSiteStore(s => s.setError);
  const setLoading      = useSiteStore(s => s.setLoading);
  const startGisDraw    = useSiteStore(s => s.startGisDraw);
  const toggleBasemap   = useSiteStore(s => s.toggleBasemap);
  const showBasemap     = useSiteStore(s => s.showBasemap);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const kmlInputRef   = useRef<HTMLInputElement>(null);
  const [genBusy, setGenBusy] = useState(false);

  const active = projects.find(p => p.id === activeProjectId);

  const handleKmlBoundary = async (file: File) => {
    setGenBusy(true);
    setLoading(true);
    setError(null);
    try {
      const points = await parseBoundaryFile(file);
      if (!points || points.length < 3) {
        throw new Error('Không tìm thấy polygon ranh giới trong file (cần Polygon/LinearRing ≥3 điểm).');
      }
      const terrain = await buildTerrainFromBoundary(points);
      setTerrain(terrain);
      computeForMode(mode);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Lỗi không xác định khi đọc ranh giới KML/KMZ.');
    } finally {
      setGenBusy(false);
      setLoading(false);
    }
  };

  const handleDrawBoundary = () => {
    startGisDraw();
    if (!showBasemap) toggleBasemap();
  };

  const handleSave = () => {
    if (!terrain) {
      alert('Cần tải file địa hình trước khi lưu');
      return;
    }
    saveProject({
      activeProjectName: active?.name ?? 'SiteAlyze',
      activeProjectId,
      projects,
      currentTerrain: terrain,
      currentOverlayLayers: overlayLayers,
      currentEnv: env,
      currentScenes: scenes,
    });
  };

  const handleLoad = async (file: File) => {
    try {
      const text = await file.text();
      const r = loadProject(text);
      if (r.terrain) setTerrain(r.terrain);
      setOverlayLayers(r.overlayLayers);
      if (r.env) {
        // Restore env nếu có (v2 format)
        const { setEnv } = useSiteStore.getState();
        setEnv(r.env);
      }
      computeForMode(mode);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'File không hợp lệ hoặc bị lỗi';
      console.error('Load project failed:', e);
      setError(`Không mở được file: ${msg}`);
    }
  };

  return (
    <div className="flex flex-col gap-3">

      {/* ── 1. Project tabs (ngang) ── */}
      <div className="flex items-center gap-1 overflow-x-auto pb-1">
        {projects.map(p => {
          const isActive = p.id === activeProjectId;
          return (
            <button
              key={p.id}
              onClick={() => switchProject(p.id)}
              title={p.name}
              className={`group flex items-center gap-1 px-2 py-1 rounded-md text-[10.5px] font-bold
                          border whitespace-nowrap transition shrink-0
                          ${isActive
                            ? 'bg-blue-500/25 border-blue-400/60 text-blue-200'
                            : 'border-white/10 text-slate-400 hover:text-slate-200 hover:border-white/25'}`}
            >
              <span className="max-w-[90px] truncate">{p.name}</span>
              {projects.length > 1 && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm(`Xoá dự án "${p.name}"?`)) removeProject(p.id);
                  }}
                  className="text-slate-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition"
                  title="Xoá dự án"
                ><X size={10} /></button>
              )}
            </button>
          );
        })}
        <button
          onClick={() => createProject()}
          className="flex items-center gap-1 px-2 py-1 rounded-md text-[10.5px] font-bold
                     border border-dashed border-white/20 text-slate-500 hover:text-blue-300
                     hover:border-blue-400/40 transition shrink-0"
          title="Thêm dự án mới"
        >
          <Plus size={11} /> Thêm
        </button>
      </div>

      {/* ── 2. Tên dự án + visibility ── */}
      {active && (
        <div className="flex items-center gap-2">
          <label className="text-[10px] text-slate-500 uppercase tracking-wider shrink-0 w-16">Tên DA</label>
          <input
            value={active.name}
            onChange={(e) => renameProject(active.id, e.target.value)}
            className="flex-1 px-2 py-1 text-xs bg-bg-dark border border-white/10 rounded
                       text-slate-100 outline-none focus:border-blue-400/50"
          />
          <button
            onClick={() => toggleProjectVisible(active.id)}
            className={`p-1 rounded transition ${active.visible ? 'text-accent-teal hover:bg-white/5' : 'text-slate-600 hover:text-slate-400'}`}
            title={active.visible ? 'Ẩn project trong scene' : 'Hiện project trong scene'}
          >
            {active.visible ? <Eye size={13} /> : <EyeOff size={13} />}
          </button>
        </div>
      )}

      {/* ── 3. Tải file CAD ── */}
      <div>
        <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Tải file địa hình</div>
        <FileUpload />
      </div>

      {/* ── 3b. Tạo địa hình từ ranh giới Google Earth (DEM SRTM 30m) ── */}
      <div>
        <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">
          Hoặc tạo địa hình từ ranh giới Google Earth
        </div>
        <div className="flex gap-1.5">
          <button
            onClick={() => kmlInputRef.current?.click()}
            disabled={genBusy}
            className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md
                       bg-amber-500/10 border border-amber-400/40 text-amber-300
                       hover:bg-amber-500/20 transition text-[10.5px] font-bold disabled:opacity-40"
            title="Tải file .kml/.kmz có Polygon ranh giới xuất từ Google Earth"
          >
            <Upload size={11} /> Tải KML/KMZ ranh giới
          </button>
          <button
            onClick={handleDrawBoundary}
            disabled={genBusy}
            className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md
                       bg-amber-500/10 border border-amber-400/40 text-amber-300
                       hover:bg-amber-500/20 transition text-[10.5px] font-bold disabled:opacity-40"
            title="Mở bản đồ vệ tinh, click để vẽ ranh giới trực tiếp"
          >
            <MapPin size={11} /> Vẽ ranh giới trên bản đồ
          </button>
        </div>
        <input
          ref={kmlInputRef}
          type="file"
          accept=".kml,.KML,.kmz,.KMZ"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleKmlBoundary(f);
            e.target.value = '';
          }}
        />
        <p className="mt-1 text-[9.5px] text-slate-600 leading-snug">
          Dùng DEM SRTM 30m (miễn phí) — phù hợp phân tích tổng quan, không thay thế file
          khảo sát CAD cho thiết kế chi tiết 1/500.
        </p>
      </div>

      {/* ── 4. Lớp dữ liệu ── */}
      <div>
        <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Lớp dữ liệu</div>
        <LayerPanel />
      </div>

      {/* ── 5. Scene (camera bookmarks) ── */}
      <div>
        <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Scene (góc nhìn)</div>
        <ScenesPanel />
      </div>

      {/* ── 6. Save / Mở ── */}
      <div className="flex gap-1.5">
        <button
          onClick={handleSave}
          disabled={!terrain}
          className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md
                     bg-blue-500/15 border border-blue-400/40 text-blue-300
                     hover:bg-blue-500/25 transition text-[10.5px] font-bold disabled:opacity-40"
          title="Lưu file .siteproj.json (YYYY-MM-DD-tên dự án)"
        >
          <Save size={11} /> Lưu
        </button>
        <button
          onClick={() => fileInputRef.current?.click()}
          className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md
                     border border-white/15 text-slate-300 hover:bg-white/5 transition text-[10.5px] font-bold"
          title="Mở file .siteproj.json"
        >
          <FolderOpen size={11} /> Mở
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json,.siteproj"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleLoad(f);
            e.target.value = '';
          }}
        />
      </div>
    </div>
  );
}
