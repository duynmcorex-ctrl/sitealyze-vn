import { useMemo } from 'react';
import * as THREE from 'three';
import { Html } from '@react-three/drei';
import { useSiteStore } from '../../store/useSiteStore';
import { ELEV_PALETTE_HEX, elevPaletteIndex } from '../../lib/analysis/elevationPalette';
import { originalContoursToSegments } from '../../lib/analysis/contours';
import type { Heightmap } from '../../lib/types';

/**
 * Sample heightmap height tại vị trí Three.js world (wx, wz).
 * Chuyển ngược: world → DXF coords → grid index → bilinear interp.
 * Trả về `fallback` nếu điểm nằm ngoài grid.
 */
function sampleHM(
  wx: number, wz: number,
  bounds: { minX: number; minY: number; maxX: number; maxY: number },
  hm: Heightmap,
  fallback: number,
): number {
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cy = (bounds.minY + bounds.maxY) / 2;
  // Three.js world → DXF: X = wx + cx, Y = cy - wz (flip Z)
  const dxfX = wx + cx;
  const dxfY = cy - wz;
  const fx = (dxfX - hm.origin.x) / hm.cellSize;
  const fy = (dxfY - hm.origin.y) / hm.cellSize;
  // Clamp vào [0, width-2] / [0, height-2] để c1/r1 không vượt biên
  const c0 = Math.max(0, Math.min(hm.width  - 2, Math.floor(fx)));
  const r0 = Math.max(0, Math.min(hm.height - 2, Math.floor(fy)));
  const c1 = c0 + 1, r1 = r0 + 1;
  const tx = fx - c0, ty = fy - r0;
  const h =
    hm.data[r0 * hm.width + c0] * (1 - tx) * (1 - ty) +
    hm.data[r0 * hm.width + c1] *       tx  * (1 - ty) +
    hm.data[r1 * hm.width + c0] * (1 - tx) *       ty  +
    hm.data[r1 * hm.width + c1] *       tx  *       ty;
  return Number.isFinite(h) ? h : fallback;
}

export function ContourLines() {
  const terrain  = useSiteStore((s) => s.terrain);
  const analysis = useSiteStore((s) => s.analysis);
  const mode     = useSiteStore((s) => s.mode);
  const env      = useSiteStore((s) => s.env);

  const colorMode   = env.contourColorMode;
  const singleColor = env.contourSingleColor;
  const opacity     = env.contourOpacity;
  const useOriginal = env.useOriginalContours;

  // Nhãn chỉ hiển thị khi đang ở chế độ "đồng mức" chính (không phải overlay)
  const showLabels = mode === 'contour';

  const { geometry, labelPoints } = useMemo(() => {
    if (!terrain) return { geometry: null, labelPoints: [] };

    // Chọn nguồn segments: nguyên bản DXF (trung thực) HOẶC tính lại từ heightmap
    const segments =
      useOriginal && terrain.contours.length > 0
        ? originalContoursToSegments(terrain.contours, terrain.bounds)
        : analysis.contours;

    if (!segments || segments.length === 0) return { geometry: null, labelPoints: [] };

    const hm       = terrain.heightmap;
    // Offset nhỏ để tránh Z-fighting: 0.5% relief nhưng tối thiểu 0.3m, tối đa 2m
    const relief   = hm.maxZ - hm.minZ;
    const zOffset  = Math.min(2.0, Math.max(0.3, relief * 0.005));
    const positions: number[] = [];
    const colors: number[]    = [];
    const sc = new THREE.Color(singleColor);

    const labelMap = new Map<number, { x: number; y: number; z: number }>();

    for (const seg of segments) {
      // Chọn màu theo chế độ
      let r: number, g: number, b: number;
      if (colorMode === 'single') {
        r = sc.r; g = sc.g; b = sc.b;
      } else {
        const idx = elevPaletteIndex(seg.elevation, hm.minZ, hm.maxZ);
        const c = new THREE.Color(ELEV_PALETTE_HEX[idx]);
        r = c.r; g = c.g; b = c.b;
      }

      for (const path of seg.paths) {
        for (let i = 0; i < path.length - 1; i++) {
          // ── Dùng chiều cao thực từ heightmap thay vì elevation cố định ──
          // → đường đồng mức bám sát mặt terrain mesh, không nổi trên không khí
          const y0 = sampleHM(path[i].x,   path[i].y,   terrain.bounds, hm, seg.elevation) + zOffset;
          const y1 = sampleHM(path[i+1].x, path[i+1].y, terrain.bounds, hm, seg.elevation) + zOffset;
          positions.push(path[i].x,   y0, path[i].y);
          positions.push(path[i+1].x, y1, path[i+1].y);
          colors.push(r, g, b, r, g, b);
        }
        // Điểm ngoài cùng bên phải (+X lớn nhất) → đặt nhãn
        for (const pt of path) {
          const prev = labelMap.get(seg.elevation);
          if (!prev || pt.x > prev.x) {
            const labelY = sampleHM(pt.x, pt.y, terrain.bounds, hm, seg.elevation) + zOffset + 1.0;
            labelMap.set(seg.elevation, { x: pt.x, y: labelY, z: pt.y });
          }
        }
      }
    }

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute('color',    new THREE.Float32BufferAttribute(colors,    3));

    const labelPoints = Array.from(labelMap.entries()).map(([elev, pos]) => ({
      elev,
      pos,
      hex: colorMode === 'single'
        ? singleColor
        : ELEV_PALETTE_HEX[elevPaletteIndex(elev, hm.minZ, hm.maxZ)],
    }));

    return { geometry: g, labelPoints };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [terrain, analysis.contours, colorMode, singleColor, useOriginal, terrain?.heightmap.minZ, terrain?.heightmap.maxZ, terrain?.bounds]);

  if (!geometry) return null;

  return (
    <>
      {/* renderOrder=1 đảm bảo vẽ sau terrain mesh (renderOrder=0 mặc định) */}
      <lineSegments geometry={geometry} renderOrder={1}>
        <lineBasicMaterial
          vertexColors
          transparent
          opacity={opacity}
          depthWrite={false}
        />
      </lineSegments>

      {showLabels && labelPoints.map(({ elev, pos, hex }) => (
        <Html
          key={elev}
          position={[pos.x, pos.y, pos.z]}
          center
          distanceFactor={120}
          style={{ pointerEvents: 'none' }}
        >
          <div style={{
            background: `${hex}dd`,
            color: labelTextColor(hex),
            fontSize: '9px',
            fontFamily: 'monospace',
            fontWeight: 700,
            padding: '1px 4px',
            borderRadius: '3px',
            whiteSpace: 'nowrap',
            border: `1px solid ${hex}`,
            userSelect: 'none',
          }}>
            {elev.toFixed(0)} m
          </div>
        </Html>
      ))}
    </>
  );
}

function labelTextColor(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.55 ? '#111' : '#fff';
}
