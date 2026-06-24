/**
 * AutoViewpoints.tsx — Tự động đề xuất điểm view dựa trên đặc trưng địa hình.
 *
 * Suggest các điểm view thuộc 3 loại:
 *  - 🔺 ĐỈNH cao  : top 3 peaks (panorama 360°)
 *  - 🔻 THUNG LŨNG: bottom 3 pits (đáy thung — view ngẩng nhìn đỉnh)
 *  - 💧 MẶT NƯỚC : trung tâm các polygon HO_AO_DAM trong landuse
 *
 * User click 1 suggestion → set vào store.viewpoint. Mode tự chuyển 'viewshed'
 * để pre-compute visibility.
 */

import { useMemo } from 'react';
import { Mountain, ArrowDownToLine, Droplets, Sparkles } from 'lucide-react';
import { useSiteStore } from '../../store/useSiteStore';
import type { TerrainData, LanduseData } from '../../lib/types';

export interface SuggestedViewpoint {
  kind: 'peak' | 'valley' | 'water';
  label: string;
  /** World Three.js coords (X, Z) — Y compute từ heightmap khi place */
  x: number;
  z: number;
  zElev: number;  // cao độ tại điểm
  /** Chiều cao điểm nhìn đề xuất (m) — peak 1.7m mắt người, valley 5m nhìn lên */
  suggestedHeight: number;
}

function computeSuggestions(
  terrain: TerrainData,
  landuse: LanduseData | null,
): SuggestedViewpoint[] {
  const suggestions: SuggestedViewpoint[] = [];
  const hm = terrain.heightmap;

  // 1. Top peaks từ features (nếu đã compute) — fallback tự tìm
  const peaks = (terrain as TerrainData & { _features?: { peaks: { x: number; y: number; z: number }[] } });
  // Tính trực tiếp top peaks bằng cách scan local max trong heightmap
  const peakCandidates: { x: number; y: number; z: number }[] = [];
  const R = 5; // bán kính so sánh local
  const cxW = (hm.width * hm.cellSize) / 2;
  const cyW = (hm.height * hm.cellSize) / 2;
  for (let y = R; y < hm.height - R; y += 3) {  // step 3 để giảm cost
    for (let x = R; x < hm.width - R; x += 3) {
      const z = hm.data[y * hm.width + x];
      if (!Number.isFinite(z)) continue;
      let isMax = true, isMin = true;
      for (let dy = -R; dy <= R && (isMax || isMin); dy++) {
        for (let dx = -R; dx <= R; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nz = hm.data[(y + dy) * hm.width + (x + dx)];
          if (!Number.isFinite(nz)) continue;
          if (nz > z) isMax = false;
          if (nz < z) isMin = false;
        }
      }
      if (isMax) {
        peakCandidates.push({
          x: x * hm.cellSize - cxW,
          y: z,
          z: -(y * hm.cellSize - cyW),
        });
      }
    }
  }
  void peaks; // (suppress unused warning if removed)

  // Sort by elevation desc, take top 3
  peakCandidates.sort((a, b) => b.y - a.y);
  for (let i = 0; i < Math.min(3, peakCandidates.length); i++) {
    const p = peakCandidates[i];
    suggestions.push({
      kind: 'peak',
      label: `Đỉnh #${i + 1} · ${p.y.toFixed(0)}m`,
      x: p.x, z: p.z, zElev: p.y,
      suggestedHeight: 1.7,
    });
  }

  // 2. Valleys / pits — top 3 lowest local min
  const pitCandidates: { x: number; y: number; z: number }[] = [];
  for (let y = R; y < hm.height - R; y += 3) {
    for (let x = R; x < hm.width - R; x += 3) {
      const z = hm.data[y * hm.width + x];
      if (!Number.isFinite(z)) continue;
      let isMin = true;
      for (let dy = -R; dy <= R && isMin; dy++) {
        for (let dx = -R; dx <= R; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nz = hm.data[(y + dy) * hm.width + (x + dx)];
          if (Number.isFinite(nz) && nz < z) { isMin = false; break; }
        }
      }
      if (isMin) {
        pitCandidates.push({
          x: x * hm.cellSize - cxW,
          y: z,
          z: -(y * hm.cellSize - cyW),
        });
      }
    }
  }
  pitCandidates.sort((a, b) => a.y - b.y);
  for (let i = 0; i < Math.min(2, pitCandidates.length); i++) {
    const p = pitCandidates[i];
    suggestions.push({
      kind: 'valley',
      label: `Thung lũng #${i + 1} · ${p.y.toFixed(0)}m`,
      x: p.x, z: p.z, zElev: p.y,
      suggestedHeight: 5,
    });
  }

  // 3. Water bodies từ landuse (HO_AO_DAM, CAU_BE_TONG) — center của polygon
  if (landuse) {
    const bounds = terrain.bounds;
    const cx = (bounds.minX + bounds.maxX) / 2;
    const cy = (bounds.minY + bounds.maxY) / 2;
    let waterIdx = 1;
    for (const p of landuse.parcels) {
      if (p.inferredType !== 'HO_AO_DAM' && p.inferredType !== 'CAU_BE_TONG') continue;
      if (waterIdx > 2) break;
      // Centroid của polygon
      let sx = 0, sy = 0;
      for (const pt of p.polygon) { sx += pt.x; sy += pt.y; }
      const cxP = sx / p.polygon.length;
      const cyP = sy / p.polygon.length;
      // DXF → world
      const wx = cxP - cx;
      const wz = -(cyP - cy);
      // Lấy cao độ từ heightmap
      const col = Math.round((cxP - hm.origin.x) / hm.cellSize);
      const row = Math.round((cyP - hm.origin.y) / hm.cellSize);
      let zE = hm.minZ;
      if (col >= 0 && col < hm.width && row >= 0 && row < hm.height) {
        const z = hm.data[row * hm.width + col];
        if (Number.isFinite(z)) zE = z;
      }
      suggestions.push({
        kind: 'water',
        label: `Mặt nước #${waterIdx++} · ${(p.areaSqm/10000).toFixed(2)}ha`,
        x: wx, z: wz, zElev: zE,
        suggestedHeight: 3,
      });
    }
  }

  return suggestions;
}

export function AutoViewpoints() {
  const terrain = useSiteStore(s => s.terrain);
  const landuse = useSiteStore(s => s.landuse);
  const setViewpoint = useSiteStore(s => s.setViewpoint);
  const setMode = useSiteStore(s => s.setMode);

  const suggestions = useMemo(() => {
    if (!terrain) return [];
    return computeSuggestions(terrain, landuse);
  }, [terrain, landuse]);

  if (!terrain) return null;

  const place = (s: SuggestedViewpoint) => {
    setViewpoint({ x: s.x, z: s.z, height: s.suggestedHeight });
    setMode('viewshed');

    // Fly camera đến gần điểm vừa chọn — để user thấy NGAY vị trí đỉnh/thung lũng/mặt
    // nước trên terrain 3D, không phải tự mò xoay camera đi tìm marker nhỏ.
    if (terrain) {
      const hm = terrain.heightmap;
      const sizeM = Math.max(hm.width, hm.height) * hm.cellSize;
      const dist = Math.min(300, Math.max(40, sizeM * 0.15));
      useSiteStore.setState({
        pendingSceneLoad: {
          id: 'auto-viewpoint-fly',
          name: s.label,
          position: [s.x + dist * 0.6, s.zElev + dist * 0.5, s.z + dist * 0.6],
          target: [s.x, s.zElev, s.z],
          fov: 50,
          createdAt: Date.now(),
        },
      });
    }
  };

  if (suggestions.length === 0) {
    return (
      <div className="text-[10px] text-slate-500 italic px-2 py-1.5 rounded bg-white/3 border border-white/5">
        Chưa phát hiện đỉnh / thung lũng / mặt nước nổi bật.
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-slate-500 font-bold">
        <Sparkles size={11} className="text-accent-teal" />
        Đề xuất tự động ({suggestions.length})
      </div>
      <div className="space-y-1">
        {suggestions.map((s, i) => {
          const Icon = s.kind === 'peak' ? Mountain
                     : s.kind === 'valley' ? ArrowDownToLine
                     : Droplets;
          const color = s.kind === 'peak' ? 'text-orange-300 border-orange-400/30 hover:bg-orange-500/10'
                      : s.kind === 'valley' ? 'text-cyan-300 border-cyan-400/30 hover:bg-cyan-500/10'
                      : 'text-blue-300 border-blue-400/30 hover:bg-blue-500/10';
          return (
            <button
              key={i}
              onClick={() => place(s)}
              className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-[10.5px]
                          border ${color} transition text-left`}
            >
              <Icon size={12} />
              <span className="flex-1 truncate">{s.label}</span>
              <span className="text-[9px] text-slate-500 font-mono">
                +{s.suggestedHeight}m
              </span>
            </button>
          );
        })}
      </div>
      <div className="text-[9px] text-slate-500 italic leading-snug">
        💡 Click để đặt điểm view tự động. Mode chuyển 'Tầm nhìn' để tính viewshed.
      </div>
    </div>
  );
}
