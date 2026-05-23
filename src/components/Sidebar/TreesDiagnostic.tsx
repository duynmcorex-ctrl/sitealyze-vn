/**
 * TreesDiagnostic.tsx — UI panel chẩn đoán + quản lý layer cây.
 *
 * Khi user load file CAD, parser cố detect tree từ layer name (CAY/TREE/THONG…),
 * block name (TREE_*, CAY_*), TEXT content (Thông, Bàng, …). Nếu vẫn không
 * detect được → user manually mark layer là "tree" qua UI này.
 *
 * Show:
 *  - Tổng số cây đang render
 *  - List tất cả overlay layer chưa được tag là tree → user có thể click để tag
 *  - List layer đã tag → click để bỏ tag
 */

import { useMemo } from 'react';
import { Trees, Check, Square } from 'lucide-react';
import { useSiteStore } from '../../store/useSiteStore';

export function TreesDiagnostic() {
  const overlayLayers = useSiteStore(s => s.overlayLayers);
  const toggleIsTree  = useSiteStore(s => s.toggleOverlayLayerIsTree);

  // Tổng số cây đang render (treePoints * visible)
  const totalTrees = useMemo(() => {
    return overlayLayers
      .filter(l => l.isTree && l.visible)
      .reduce((s, l) => s + (l.treePoints?.length ?? 0), 0);
  }, [overlayLayers]);

  // Phân chia layers: tree (đã tag) vs candidates (chưa tag, có bất kỳ entity nào)
  const treeLayers = useMemo(
    () => overlayLayers.filter(l => l.isTree),
    [overlayLayers],
  );
  const candidateLayers = useMemo(
    () => overlayLayers.filter(l =>
      !l.isTree && (
        l.polylines.length > 0 ||
        (l.textPositions?.length ?? 0) > 0 ||
        (l.entityCounts?.circle ?? 0) > 0
      )
    ),
    [overlayLayers],
  );

  if (overlayLayers.length === 0) {
    return (
      <div className="text-[10px] text-slate-500 italic px-2 py-1.5 rounded bg-white/3 border border-white/5">
        Chưa có file CAD nào được tải. Upload DXF có layer cây để tự detect.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Tổng */}
      <div className="flex items-center gap-2 px-2 py-1.5 rounded bg-green-500/10 border border-green-400/30 text-[10.5px]">
        <Trees size={13} className="text-green-300" />
        <span className="text-slate-200">
          Đang render <b className="text-green-300">{totalTrees}</b> cây từ{' '}
          <b>{treeLayers.length}</b> layer
        </span>
      </div>

      {/* Đã tag là tree */}
      {treeLayers.length > 0 && (
        <div>
          <div className="text-[9.5px] uppercase tracking-wider text-slate-500 font-bold mb-1">
            Layer cây đang dùng ({treeLayers.length})
          </div>
          <div className="space-y-0.5 max-h-32 overflow-y-auto pr-1">
            {treeLayers.map(l => (
              <button
                key={l.id}
                onClick={() => toggleIsTree(l.id)}
                className="w-full flex items-center gap-1.5 px-1.5 py-1 rounded text-[10px]
                           border border-green-400/30 bg-green-500/5 hover:bg-green-500/15 transition text-left"
                title="Click để bỏ tag tree"
              >
                <Check size={10} className="text-green-300 shrink-0" />
                <span className="block w-2.5 h-2.5 rounded-sm border border-white/20 shrink-0"
                      style={{ background: l.color }} />
                <span className="flex-1 truncate text-slate-200">{l.name}</span>
                <span className="text-[9px] text-slate-500 font-mono">
                  {l.treePoints?.length ?? 0} cây
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Candidates — chưa tag */}
      {candidateLayers.length > 0 && (
        <div>
          <div className="text-[9.5px] uppercase tracking-wider text-slate-500 font-bold mb-1">
            Layer khác — click để thêm làm cây ({candidateLayers.length})
          </div>
          <div className="text-[9.5px] text-slate-500 italic mb-1 leading-snug">
            Nếu parser không tự detect được → tự chọn layer chứa ký hiệu cây
            (mỗi polyline = 1 cây tại centroid của nó).
          </div>
          <div className="space-y-0.5 max-h-40 overflow-y-auto pr-1">
            {candidateLayers.map(l => (
              <button
                key={l.id}
                onClick={() => toggleIsTree(l.id)}
                className="w-full flex items-center gap-1.5 px-1.5 py-1 rounded text-[10px]
                           border border-white/10 hover:border-green-400/40 hover:bg-green-500/5 transition text-left"
                title={`Click để tag "${l.name}" làm layer cây`}
              >
                <Square size={10} className="text-slate-500 shrink-0" />
                <span className="block w-2.5 h-2.5 rounded-sm border border-white/20 shrink-0"
                      style={{ background: l.color }} />
                <span className="flex-1 truncate text-slate-300">{l.name}</span>
                <span className="text-[9px] text-slate-500 font-mono">
                  {l.entityCounts ? (
                    <>
                      {l.entityCounts.polyline > 0 && <span>{l.entityCounts.polyline}P </span>}
                      {l.entityCounts.circle  > 0 && <span>{l.entityCounts.circle}C </span>}
                      {l.entityCounts.text    > 0 && <span>{l.entityCounts.text}T </span>}
                      {l.entityCounts.insert  > 0 && <span>{l.entityCounts.insert}I</span>}
                    </>
                  ) : (
                    <>{l.polylines.length}P</>
                  )}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
