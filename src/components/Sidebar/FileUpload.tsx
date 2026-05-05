import { Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { useSiteStore } from '../../store/useSiteStore';
import { getTerrainApi } from '../../workers/terrainClient';

export function FileUpload() {
  const setTerrain = useSiteStore((s) => s.setTerrain);
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
      if (isDwg) {
        const buffer = await file.arrayBuffer();
        // Dùng Comlink transfer để chuyển ArrayBuffer sang worker không copy
        terrain = await api.processDwg(buffer, 384, layerPattern || undefined);
      } else {
        const text = await file.text();
        terrain = await api.processDxf(text, 384, layerPattern || undefined);
      }
      setTerrain(terrain);
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
