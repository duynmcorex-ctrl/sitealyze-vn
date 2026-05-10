import { Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { useSiteStore } from '../../store/useSiteStore';
import { getTerrainApi } from '../../workers/terrainClient';
import { groupToWorldSpace, parseOverlayDxfGroups, isTreeLayer, circlesToTreePoints } from '../../lib/dxf/parseOverlayDxf';
import { classifyRoadLayer, groupRawRoadsByLayer, SURFACE_COLOR } from '../../lib/analysis/roadClassify';
import { isRoadLayer } from '../../lib/analysis/roads';
import type { OverlayLayer } from '../../lib/types';

// Layer pattern bỏ qua khi auto-import (đã được xử lý ở pipeline khác)
const SKIP_LAYER_RE = /(DM|DC|DG|DONGMUC|DUONG[_-]?DONG[_-]?MUC|CONTOUR|TOPO|ELEV|TERRAIN|HEIGHT|BINHDO)/i;
const MAX_AUTO_LAYERS = 50;

export function FileUpload() {
  const setTerrain = useSiteStore((s) => s.setTerrain);
  const addOverlayLayer = useSiteStore((s) => s.addOverlayLayer);
  const setLoading = useSiteStore((s) => s.setLoading);
  const setError = useSiteStore((s) => s.setError);
  const computeForMode = useSiteStore((s) => s.computeForMode);
  const mode = useSiteStore((s) => s.mode);
  const layerPattern = useSiteStore((s) => s.layerPattern);
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  const handleFile = async (file: File) => {
    setFileName(file.name);
    setLoading(true);
    setError(null);
    try {
      const api = getTerrainApi();
      const isDwg = /\.dwg$/i.test(file.name);
      let terrain;
      let dxfText: string | null = null;
      if (isDwg) {
        const buffer = await file.arrayBuffer();
        // Dùng Comlink transfer để chuyển ArrayBuffer sang worker không copy
        terrain = await api.processDwg(buffer, 384, layerPattern || undefined);
      } else {
        dxfText = await file.text();
        terrain = await api.processDxf(dxfText, 384, layerPattern || undefined);
      }
      setTerrain(terrain);

      // ── Auto-import TẤT CẢ layer DXF khác (nhà, ranh giới, hạ tầng...) ──
      // Để KTS thấy đầy đủ bản đồ nền, không chỉ contour + đường giao thông
      // Chỉ DXF text — DWG file chưa hỗ trợ (user có thể export DXF từ AutoCAD)
      if (dxfText && !isDwg) {
        try {
          const fileTimestamp = Date.now();
          const baseName = file.name.replace(/\.(dxf|DXF)$/i, '');
          const fileId = `auto-${fileTimestamp}`;
          const groups = parseOverlayDxfGroups(dxfText);
          let added = 0;
          for (const group of groups) {
            if (added >= MAX_AUTO_LAYERS) break;
            // Bỏ qua layer đã được pipeline khác xử lý
            if (SKIP_LAYER_RE.test(group.layerName)) continue;
            if (isRoadLayer(group.layerName)) continue; // road đã được auto-add ở dưới
            // Skip layer "0" trống
            if (group.layerName === '0' && (group.polylines?.length ?? 0) === 0) continue;

            const worldPolylines = groupToWorldSpace(group, terrain.bounds, terrain.heightmap);
            const treeDetected = isTreeLayer(group.layerName) && (group.circles?.length ?? 0) > 0;
            const treePoints = treeDetected
              ? circlesToTreePoints(group.circles!, terrain.bounds, terrain.heightmap)
              : undefined;

            if (worldPolylines.length === 0 && !treePoints?.length) continue;

            const layer: OverlayLayer = {
              id: `auto-${fileTimestamp}-${group.layerName}`,
              fileId,
              fileName: baseName,
              name: group.layerName,
              color: group.color,
              originalColor: group.color,
              visible: true,
              isRoad: false,
              isTree: treeDetected,
              treePoints,
              polylines: worldPolylines,
            };
            addOverlayLayer(layer);
            added++;
          }
          if (groups.length > MAX_AUTO_LAYERS) {
            console.warn(
              `[FileUpload] File có ${groups.length} layer, chỉ auto-import ${MAX_AUTO_LAYERS} đầu. Các layer khác có thể thêm thủ công qua nút "Thêm layer DXF".`,
            );
          }
        } catch (e) {
          console.warn('[FileUpload] Auto-import all layers failed:', e);
        }
      }

      // ── Auto-tạo road overlay layers từ rawRoadPolylines trong terrain ────
      if (terrain.rawRoadPolylines && terrain.rawRoadPolylines.length > 0) {
        const groups = groupRawRoadsByLayer(terrain.rawRoadPolylines);
        const timestamp = Date.now();
        const baseName = file.name.replace(/\.(dxf|DXF|dwg|DWG)$/i, '');
        const fileId = `auto-${timestamp}`;
        for (const group of groups) {
          const worldPolylines = groupToWorldSpace(
            { layerName: group.layerName, color: group.color, polylines: group.polylines },
            terrain.bounds,
            terrain.heightmap,
            1.5,  // offset 1.5m trên mặt đường
          );
          if (worldPolylines.length === 0) continue;

          const roadMeta = classifyRoadLayer(group.layerName, group.polylines, terrain.bounds);
          // Dùng màu theo surface type nếu phân loại được, giữ màu CAD nếu unknown
          const displayColor = roadMeta.surface !== 'unknown'
            ? SURFACE_COLOR[roadMeta.surface]
            : group.color;

          const layer: OverlayLayer = {
            id: `road-${timestamp}-${group.layerName}`,
            fileId,
            fileName: baseName,
            name: group.layerName,
            color: displayColor,
            originalColor: group.color,
            visible: true,
            isRoad: true,
            roadMeta,
            polylines: worldPolylines,
          };
          addOverlayLayer(layer);
        }
      }

      computeForMode(mode);
    } catch (err) {
      console.error(err);
      const ext = /\.dwg$/i.test(file.name) ? 'DWG' : 'DXF';
      setError(err instanceof Error ? err.message : `Lỗi không xác định khi xử lý ${ext}.`);
    } finally {
      setLoading(false);
    }
  };

  const setLayerPattern = useSiteStore((s) => s.setLayerPattern);

  return (
    <div>
      <button
        onClick={() => inputRef.current?.click()}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-md
                   bg-accent-teal/10 hover:bg-accent-teal/20 border border-accent-teal/40
                   text-accent-teal font-semibold text-sm transition"
      >
        <Upload size={16} />
        Tải file CAD (.DWG / .DXF)
      </button>
      <input
        ref={inputRef}
        type="file"
        accept=".dxf,.DXF,.dwg,.DWG"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
        }}
      />
      {fileName && <div className="mt-2 text-xs text-slate-400 truncate">{fileName}</div>}
      <div className="mt-3">
        <label className="text-[10px] uppercase tracking-wider text-slate-500">
          Lọc layer (regex, để trống = auto)
        </label>
        <input
          type="text"
          placeholder="vd: ^(DM|DC|CONTOUR)"
          value={layerPattern}
          onChange={(e) => setLayerPattern(e.target.value)}
          className="mt-1 w-full px-2 py-1.5 rounded bg-bg-card border border-white/5
                     text-xs text-slate-200 placeholder:text-slate-600 outline-none
                     focus:border-accent-teal/40"
        />
      </div>
    </div>
  );
}
