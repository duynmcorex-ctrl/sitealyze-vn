import { Download, FileJson, Image as ImageIcon } from 'lucide-react';
import { useState } from 'react';
import { useSiteStore } from '../../store/useSiteStore';
import { highResCaptureRef } from '../../lib/render/highResCapture';

export function ExportPanel() {
  const terrain = useSiteStore((s) => s.terrain);
  const mode = useSiteStore((s) => s.mode);
  const env = useSiteStore((s) => s.env);
  const analysis = useSiteStore((s) => s.analysis);
  const [capturing, setCapturing] = useState(false);

  const exportPng = () => {
    const canvas = document.querySelector('canvas') as HTMLCanvasElement | null;
    if (!canvas) return;
    const url = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = `sitealyze-${mode}-${Date.now()}.png`;
    a.click();
  };

  // Xuất ảnh 4K (3840×2160) cho slide thuyết trình — render off-screen ở resolution
  // cao hơn viewport, không ảnh hưởng hiển thị hiện tại. Xem Canvas3D.tsx (HighResCaptureBridge).
  const export4k = () => {
    if (!highResCaptureRef.current) return;
    setCapturing(true);
    // requestAnimationFrame để UI (label "Đang chụp…") kịp render trước khi block 1 frame
    requestAnimationFrame(() => {
      highResCaptureRef.current?.(3840, 2160, `sitealyze-${mode}-4k-${Date.now()}.png`);
      setCapturing(false);
    });
  };

  const exportJson = () => {
    if (!terrain) return;
    const hm = terrain.heightmap;
    const summary: Record<string, unknown> = {
      generatedAt: new Date().toISOString(),
      bounds: terrain.bounds,
      gridSize: { width: hm.width, height: hm.height, cellSize: hm.cellSize },
      elevation: { min: hm.minZ, max: hm.maxZ },
      contourCount: terrain.contours.length,
      env,
      mode,
    };
    if (analysis.slope) {
      const counts = new Array(6).fill(0);
      for (const c of analysis.slope.classes) counts[c]++;
      summary.slopeDistribution = counts;
    }
    if (analysis.suitability) {
      const counts = new Array(4).fill(0);
      for (const c of analysis.suitability.classes) counts[c]++;
      summary.suitabilityDistribution = counts;
    }
    if (analysis.features) {
      summary.peakCount = analysis.features.peaks.length;
      summary.pitCount = analysis.features.pits.length;
    }
    const blob = new Blob([JSON.stringify(summary, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sitealyze-report-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-2">
      <button onClick={exportPng} disabled={!terrain}
        className="w-full py-2 rounded-md text-xs font-bold uppercase tracking-wider
                   bg-bg-card hover:bg-white/10 disabled:opacity-40 text-slate-300
                   flex items-center justify-center gap-2">
        <Download size={14} /> Ảnh PNG (viewport hiện tại)
      </button>
      <button onClick={export4k} disabled={!terrain || capturing}
        title="Xuất ảnh 3840×2160 — chất lượng cao để chèn vào slide thuyết trình"
        className="w-full py-2 rounded-md text-xs font-bold uppercase tracking-wider
                   bg-accent-teal/15 border border-accent-teal/40 hover:bg-accent-teal/25
                   disabled:opacity-40 text-accent-teal
                   flex items-center justify-center gap-2">
        <ImageIcon size={14} /> {capturing ? 'Đang chụp…' : 'Ảnh 4K (cho slide)'}
      </button>
      <button onClick={exportJson} disabled={!terrain}
        className="w-full py-2 rounded-md text-xs font-bold uppercase tracking-wider
                   bg-bg-card hover:bg-white/10 disabled:opacity-40 text-slate-300
                   flex items-center justify-center gap-2">
        <FileJson size={14} /> Báo cáo JSON
      </button>
    </div>
  );
}
