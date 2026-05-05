import { Eye, EyeOff, Trash2, Upload, Save, FolderOpen, RotateCcw } from 'lucide-react';
import { useRef } from 'react';
import { useSiteStore } from '../../store/useSiteStore';
import { parseOverlayDxfGroups, groupToWorldSpace } from '../../lib/dxf/parseOverlayDxf';
import { saveProject, loadProject } from '../../lib/project/saveLoad';
import type { OverlayLayer } from '../../lib/types';

export function LayerPanel() {
  const terrain = useSiteStore((s) => s.terrain);
  const overlayLayers = useSiteStore((s) => s.overlayLayers);
  const addOverlayLayer = useSiteStore((s) => s.addOverlayLayer);
  const removeOverlayLayer = useSiteStore((s) => s.removeOverlayLayer);
  const toggleOverlayLayerVisible = useSiteStore((s) => s.toggleOverlayLayerVisible);
  const updateOverlayLayerColor = useSiteStore((s) => s.updateOverlayLayerColor);
  const renameOverlayLayer = useSiteStore((s) => s.renameOverlayLayer);
  const setTerrain = useSiteStore((s) => s.setTerrain);
  const setOverlayLayers = useSiteStore((s) => s.setOverlayLayers);
  const computeForMode = useSiteStore((s) => s.computeForMode);
  const mode = useSiteStore((s) => s.mode);

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
      if (worldPolylines.length === 0) continue;

      // Tên layer: "tên-file / tên-CAD-layer" (hoặc chỉ tên file nếu layer là "0" duy nhất)
      const displayName =
        groups.length === 1 && group.layerName === '0'
          ? baseName
          : `${baseName} / ${group.layerName}`;

      const layer: OverlayLayer = {
        id: `layer-${timestamp}-${group.layerName}`,
        name: displayName,
        color: group.color,           // màu gốc từ DXF
        originalColor: group.color,   // lưu để reset
        visible: true,
        polylines: worldPolylines,
      };
      addOverlayLayer(layer);
    }
  };

  const handleSaveProject = () => {
    if (!terrain) return;
    saveProject(terrain, overlayLayers);
  };

  const handleLoadProject = async (file: File) => {
    const text = await file.text();
    const { terrain: loadedTerrain, overlayLayers: loadedLayers } = loadProject(text);
    setTerrain(loadedTerrain);
    setOverlayLayers(loadedLayers);
    computeForMode(mode);
  };

  return (
    <div className="space-y-3">
      {/* Danh sách overlay layers */}
      {overlayLayers.length > 0 && (
        <div className="space-y-1.5">
          {overlayLayers.map((layer) => (
            <LayerRow
              key={layer.id}
              layer={layer}
              onToggle={() => toggleOverlayLayerVisible(layer.id)}
              onDelete={() => removeOverlayLayer(layer.id)}
              onColorChange={(c) => updateOverlayLayerColor(layer.id, c)}
              onRename={(n) => renameOverlayLayer(layer.id, n)}
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

// ── Layer row ────────────────────────────────────────────────────────────────

function LayerRow({
  layer, onToggle, onDelete, onColorChange, onRename,
}: {
  layer: OverlayLayer;
  onToggle: () => void;
  onDelete: () => void;
  onColorChange: (c: string) => void;
  onRename: (n: string) => void;
}) {
  const isColorOverridden =
    layer.originalColor != null && layer.color !== layer.originalColor;

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
