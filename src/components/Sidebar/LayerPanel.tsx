import { Eye, EyeOff, Trash2, Upload, Save, FolderOpen, RotateCcw, Route, Trees, ChevronDown, ChevronRight, Folder } from 'lucide-react';
import { useRef, useState } from 'react';
import { useSiteStore } from '../../store/useSiteStore';
import { parseOverlayDxfGroups, groupToWorldSpace, isTreeLayer, circlesToTreePoints } from '../../lib/dxf/parseOverlayDxf';
import { saveProject, loadProject } from '../../lib/project/saveLoad';
import { isRoadLayer } from '../../lib/analysis/roads';
import { SURFACE_LABEL, SURFACE_COLOR } from '../../lib/analysis/roadClassify';
import type { OverlayLayer } from '../../lib/types';

export function LayerPanel() {
  const terrain = useSiteStore((s) => s.terrain);
  const overlayLayers = useSiteStore((s) => s.overlayLayers);
  const addOverlayLayer = useSiteStore((s) => s.addOverlayLayer);
  const removeOverlayLayer = useSiteStore((s) => s.removeOverlayLayer);
  const toggleOverlayLayerVisible = useSiteStore((s) => s.toggleOverlayLayerVisible);
  const updateOverlayLayerColor = useSiteStore((s) => s.updateOverlayLayerColor);
  const updateOverlayLayerWidth = useSiteStore((s) => s.updateOverlayLayerWidth);
  const renameOverlayLayer = useSiteStore((s) => s.renameOverlayLayer);
  const setTerrain = useSiteStore((s) => s.setTerrain);
  const setOverlayLayers = useSiteStore((s) => s.setOverlayLayers);
  const computeForMode = useSiteStore((s) => s.computeForMode);
  const mode = useSiteStore((s) => s.mode);
  // Save/load: cần thêm context multi-project + scenes + env
  const projects        = useSiteStore((s) => s.projects);
  const activeProjectId = useSiteStore((s) => s.activeProjectId);
  const env             = useSiteStore((s) => s.env);
  const scenes          = useSiteStore((s) => s.scenes);

  const addLayerRef = useRef<HTMLInputElement>(null);
  const loadProjRef = useRef<HTMLInputElement>(null);

  const handleAddLayer = async (file: File) => {
    if (!terrain) return;
    const text = await file.text();

    // Parse → nhóm theo CAD layer, giữ màu gốc
    const groups = parseOverlayDxfGroups(text);
    if (groups.length === 0) return;

    const baseName = file.name.replace(/\.[^.]+$/, '');
    const timestamp = Date.now();

    for (const group of groups) {
      const worldPolylines = groupToWorldSpace(group, terrain.bounds, terrain.heightmap);

      // Detect tree + convert circles
      const treeDetected = isTreeLayer(group.layerName) && (group.circles?.length ?? 0) > 0;
      const treePoints = treeDetected
        ? circlesToTreePoints(group.circles!, terrain.bounds, terrain.heightmap)
        : undefined;

      // Bỏ qua nếu không có polylines VÀ không có tree points
      if (worldPolylines.length === 0 && !treePoints?.length) continue;

      // Tên layer: "tên-file / tên-CAD-layer" (hoặc chỉ tên file nếu layer là "0" duy nhất)
      const displayName =
        groups.length === 1 && group.layerName === '0'
          ? baseName
          : `${baseName} / ${group.layerName}`;

      const layer: OverlayLayer = {
        id: `layer-${timestamp}-${group.layerName}`,
        fileId: `file-${timestamp}`,
        fileName: baseName,
        name: group.layerName === '0' && groups.length === 1 ? baseName : group.layerName,
        color: group.color,
        originalColor: group.color,
        visible: true,
        isRoad: isRoadLayer(group.layerName),
        isTree: treeDetected,
        treePoints,
        polylines: worldPolylines,
      };
      addOverlayLayer(layer);
    }
  };

  const handleSaveProject = () => {
    if (!terrain) return;
    const active = projects.find(p => p.id === activeProjectId);
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

  const handleLoadProject = async (file: File) => {
    const text = await file.text();
    const result = loadProject(text);
    // Đợt này tối thiểu hoá: chỉ apply active terrain + overlay (multi-project import sẽ làm sau)
    if (result.terrain) setTerrain(result.terrain);
    setOverlayLayers(result.overlayLayers);
    computeForMode(mode);
  };

  // Nhóm layers theo fileId (Google Earth tree)
  const fileGroups = (() => {
    const map = new Map<string, OverlayLayer[]>();
    for (const l of overlayLayers) {
      const key = l.fileId ?? 'ungrouped';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(l);
    }
    return Array.from(map.entries());
  })();

  const handleDeleteFile = (fileId: string) => {
    const ids = overlayLayers.filter(l => (l.fileId ?? 'ungrouped') === fileId).map(l => l.id);
    ids.forEach(id => removeOverlayLayer(id));
  };

  const handleToggleFile = (fileId: string) => {
    const layers = overlayLayers.filter(l => (l.fileId ?? 'ungrouped') === fileId);
    const allVisible = layers.every(l => l.visible);
    layers.forEach(l => { if (l.visible === allVisible) toggleOverlayLayerVisible(l.id); });
  };

  const handleColorFile = (fileId: string, color: string) => {
    const layers = overlayLayers.filter(l => (l.fileId ?? 'ungrouped') === fileId);
    layers.forEach(l => updateOverlayLayerColor(l.id, color));
  };

  return (
    <div className="space-y-3">
      {/* Cây layer kiểu Google Earth */}
      {fileGroups.length > 0 && (
        <div className="space-y-1">
          {fileGroups.map(([fileId, layers]) => (
            <FileGroup
              key={fileId}
              fileId={fileId}
              layers={layers}
              onToggleFile={() => handleToggleFile(fileId)}
              onDeleteFile={() => handleDeleteFile(fileId)}
              onColorFile={(c) => handleColorFile(fileId, c)}
              onToggleLayer={(id) => toggleOverlayLayerVisible(id)}
              onDeleteLayer={(id) => removeOverlayLayer(id)}
              onColorLayer={(id, c) => updateOverlayLayerColor(id, c)}
              onWidthLayer={(id, w) => updateOverlayLayerWidth(id, w)}
              onRenameLayer={(id, n) => renameOverlayLayer(id, n)}
            />
          ))}
        </div>
      )}

      {/* Thêm layer từ DXF */}
      <button
        onClick={() => addLayerRef.current?.click()}
        disabled={!terrain}
        className="w-full flex items-center justify-center gap-2 py-2 rounded-md text-xs
                   font-bold uppercase tracking-wider bg-bg-card hover:bg-white/10
                   border border-white/10 text-slate-400 hover:text-slate-200
                   transition disabled:opacity-40"
      >
        <Upload size={13} /> Thêm layer DXF
      </button>
      <input
        ref={addLayerRef} type="file" accept=".dxf,.DXF" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleAddLayer(f); e.target.value = ''; }}
      />

      {/* Save / Load project */}
      <div className="flex gap-2">
        <button
          onClick={handleSaveProject}
          disabled={!terrain}
          title="Lưu project (.siteproj.json)"
          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-xs
                     font-bold uppercase bg-bg-card hover:bg-white/10 border border-white/10
                     text-slate-400 hover:text-slate-200 transition disabled:opacity-40"
        >
          <Save size={13} /> Lưu
        </button>
        <button
          onClick={() => loadProjRef.current?.click()}
          title="Mở project đã lưu (.siteproj.json)"
          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-xs
                     font-bold uppercase bg-bg-card hover:bg-white/10 border border-white/10
                     text-slate-400 hover:text-slate-200 transition"
        >
          <FolderOpen size={13} /> Mở
        </button>
        <input
          ref={loadProjRef} type="file" accept=".json" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleLoadProject(f); e.target.value = ''; }}
        />
      </div>
    </div>
  );
}

// ── File group (folder) ──────────────────────────────────────────────────────

function FileGroup({
  fileId, layers,
  onToggleFile, onDeleteFile, onColorFile,
  onToggleLayer, onDeleteLayer, onColorLayer, onWidthLayer, onRenameLayer,
}: {
  fileId: string;
  layers: OverlayLayer[];
  onToggleFile: () => void;
  onDeleteFile: () => void;
  onColorFile: (c: string) => void;
  onToggleLayer: (id: string) => void;
  onDeleteLayer: (id: string) => void;
  onColorLayer: (id: string, c: string) => void;
  onWidthLayer: (id: string, w: number) => void;
  onRenameLayer: (id: string, n: string) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const isMultiLayer = layers.length > 1;
  const allVisible = layers.every(l => l.visible);
  const someVisible = layers.some(l => l.visible);
  const fileName = layers[0]?.fileName ?? layers[0]?.name ?? fileId;

  // Màu đại diện folder: lấy màu layer đầu tiên
  const folderColor = layers[0]?.color ?? '#888';

  if (!isMultiLayer) {
    // File chỉ có 1 layer → hiện flat row (không cần folder)
    return (
      <LayerRow
        layer={layers[0]}
        onToggle={() => onToggleLayer(layers[0].id)}
        onDelete={() => onDeleteLayer(layers[0].id)}
        onColorChange={(c) => onColorLayer(layers[0].id, c)}
        onWidthChange={(w) => onWidthLayer(layers[0].id, w)}
        onRename={(n) => onRenameLayer(layers[0].id, n)}
      />
    );
  }

  return (
    <div className="rounded border border-white/10 overflow-hidden">
      {/* Folder header */}
      <div className="flex items-center gap-1 px-2 py-1.5 bg-white/5 hover:bg-white/8 transition">
        {/* Expand toggle */}
        <button
          onClick={() => setExpanded(e => !e)}
          className="text-slate-500 hover:text-slate-300 flex-shrink-0"
        >
          {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </button>

        {/* Folder icon */}
        <Folder size={12} className="text-accent-teal/70 flex-shrink-0" />

        {/* Folder color (tất cả layer con) */}
        <label className="cursor-pointer flex-shrink-0 relative" title="Đổi màu tất cả layer">
          <span
            className="block w-3.5 h-3.5 rounded-sm border border-white/20"
            style={{ background: folderColor }}
          />
          <input
            type="color" value={folderColor}
            onChange={(e) => onColorFile(e.target.value)}
            className="w-0 h-0 opacity-0 absolute"
          />
        </label>

        {/* Tên file */}
        <span className="flex-1 min-w-0 truncate text-xs text-slate-200 font-medium" title={fileName}>
          {fileName}
        </span>

        {/* Badge số layer */}
        <span className="text-[9px] text-slate-500 flex-shrink-0 mr-1">
          {layers.length} layers
        </span>

        {/* Toggle tất cả */}
        <button
          onClick={onToggleFile}
          title={allVisible ? 'Tắt tất cả' : 'Bật tất cả'}
          className="text-slate-500 hover:text-slate-300 transition flex-shrink-0"
        >
          {(allVisible || someVisible) ? <Eye size={13} /> : <EyeOff size={13} />}
        </button>

        {/* Xoá tất cả */}
        <button
          onClick={onDeleteFile}
          title="Xoá tất cả layer trong file này"
          className="text-slate-600 hover:text-red-400 transition flex-shrink-0"
        >
          <Trash2 size={12} />
        </button>
      </div>

      {/* Layer con */}
      {expanded && (
        <div className="pl-5 border-t border-white/5 space-y-px">
          {layers.map(layer => (
            <LayerRow
              key={layer.id}
              layer={layer}
              onToggle={() => onToggleLayer(layer.id)}
              onDelete={() => onDeleteLayer(layer.id)}
              onColorChange={(c) => onColorLayer(layer.id, c)}
              onWidthChange={(w) => onWidthLayer(layer.id, w)}
              onRename={(n) => onRenameLayer(layer.id, n)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Layer row ────────────────────────────────────────────────────────────────

function LayerRow({
  layer, onToggle, onDelete, onColorChange, onWidthChange, onRename,
}: {
  layer: OverlayLayer;
  onToggle: () => void;
  onDelete: () => void;
  onColorChange: (c: string) => void;
  onWidthChange: (w: number) => void;
  onRename: (n: string) => void;
}) {
  const isColorOverridden =
    layer.originalColor != null && layer.color !== layer.originalColor;
  const width = layer.lineWidth ?? 2;

  return (
    <div className="flex items-center gap-1.5 px-2 py-1.5 rounded bg-bg-card border border-white/5">
      {/* Color swatch / picker */}
      <label className="cursor-pointer flex-shrink-0 relative" title="Đổi màu">
        <span
          className="block w-4 h-4 rounded-sm border border-white/20"
          style={{ background: layer.color }}
        />
        <input
          type="color" value={layer.color}
          onChange={(e) => onColorChange(e.target.value)}
          className="w-0 h-0 opacity-0 absolute"
        />
      </label>

      {/* Độ rộng nét vẽ */}
      <input
        type="range" min={0.5} max={10} step={0.5}
        value={width}
        onChange={(e) => onWidthChange(Number(e.target.value))}
        title={`Độ rộng nét: ${width}px`}
        className="w-10 h-1 accent-accent-teal flex-shrink-0"
      />

      {/* Reset colour to original CAD colour */}
      {isColorOverridden && (
        <button
          onClick={() => onColorChange(layer.originalColor!)}
          title={`Reset về màu gốc CAD (${layer.originalColor})`}
          className="flex-shrink-0 text-slate-600 hover:text-accent-teal transition"
        >
          <RotateCcw size={10} />
        </button>
      )}

      {/* Road badge */}
      {layer.isRoad && (() => {
        const meta = layer.roadMeta;
        const surface = meta?.surface ?? 'unknown';
        const surfaceColor = SURFACE_COLOR[surface as keyof typeof SURFACE_COLOR] ?? '#AAAAAA';
        const surfaceLabel = surface !== 'unknown'
          ? SURFACE_LABEL[surface as keyof typeof SURFACE_LABEL]
          : 'Đường';
        const widthStr = meta?.estimatedWidthM ? ` ${meta.estimatedWidthM}m` : '';
        const entStr = (meta?.entrancePoints?.length ?? 0) > 0
          ? ` · ${meta!.entrancePoints.length} lối vào` : '';
        const tooltip = `${surfaceLabel}${widthStr}${entStr} — hiển thị qua nút Giao thông`;
        return (
          <span
            className="flex items-center gap-0.5 px-1 rounded text-[9px] font-bold flex-shrink-0"
            style={{ background: surfaceColor + '33', color: surfaceColor, border: `1px solid ${surfaceColor}55` }}
            title={tooltip}
          >
            <Route size={9} />
            {surface !== 'unknown' && <span>{surfaceLabel.split(' ')[0]}</span>}
          </span>
        );
      })()}
      {/* Tree badge */}
      {layer.isTree && (
        <span title={`Cây hiện trạng — ${layer.treePoints?.length ?? 0} cây`}>
          <Trees size={10} className="text-green-400 flex-shrink-0" />
        </span>
      )}

      {/* Name (editable) */}
      <input
        type="text" value={layer.name}
        onChange={(e) => onRename(e.target.value)}
        className="flex-1 min-w-0 text-xs text-slate-200 bg-transparent outline-none
                   truncate placeholder:text-slate-600"
      />

      {/* Toggle visibility */}
      <button onClick={onToggle} className="text-slate-500 hover:text-slate-300 transition flex-shrink-0">
        {layer.visible ? <Eye size={13} /> : <EyeOff size={13} />}
      </button>

      {/* Delete */}
      <button onClick={onDelete} className="text-slate-600 hover:text-red-400 transition flex-shrink-0">
        <Trash2 size={13} />
      </button>
    </div>
  );
}
