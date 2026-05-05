import { useMemo } from 'react';
import * as THREE from 'three';
import { Html } from '@react-three/drei';
import { useSiteStore } from '../../store/useSiteStore';
import { ELEV_PALETTE_HEX, elevPaletteIndex } from '../../lib/analysis/elevationPalette';

export function ContourLines() {
  const terrain  = useSiteStore((s) => s.terrain);
  const analysis = useSiteStore((s) => s.analysis);
  const mode     = useSiteStore((s) => s.mode);
  const env      = useSiteStore((s) => s.env);

  const colorMode   = env.contourColorMode;
  const singleColor = env.contourSingleColor;
  const opacity     = env.contourOpacity;

  // Nhãn chỉ hiển thị khi đang ở chế độ "đồng mức" chính (không phải overlay)
  const showLabels = mode === 'contour';

  const { geometry, labelPoints } = useMemo(() => {
    if (!terrain || !analysis.contours) return { geometry: null, labelPoints: [] };

    const hm       = terrain.heightmap;
    const positions: number[] = [];
    const colors: number[]    = [];
    const sc = new THREE.Color(singleColor);

    const labelMap = new Map<number, { x: number; y: number; z: number }>();

    for (const seg of analysis.contours) {
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
          positions.push(path[i].x,   seg.elevation + 0.5, path[i].y);
          positions.push(path[i+1].x, seg.elevation + 0.5, path[i+1].y);
          colors.push(r, g, b, r, g, b);
        }
        // Điểm ngoài cùng bên phải (+X lớn nhất) → đặt nhãn
        for (const pt of path) {
          const prev = labelMap.get(seg.elevation);
          if (!prev || pt.x > prev.x) {
            labelMap.set(seg.elevation, { x: pt.x, y: seg.elevation + 1.5, z: pt.y });
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
  }, [terrain, analysis.contours, colorMode, singleColor]);

  if (!geometry) return null;

  return (
    <>
      <lineSegments geometry={geometry}>
        <lineBasicMaterial vertexColors transparent opacity={opacity} />
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
