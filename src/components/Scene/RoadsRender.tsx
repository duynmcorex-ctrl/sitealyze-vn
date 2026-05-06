/**
 * Render các layer giao thông (isRoad = true) với kiểu dáng riêng:
 * - Màu layer gốc (hoặc override)
 * - Dày hơn overlay thường (line width 2 → nhưng WebGL thực tế 1px, dùng z-offset thay)
 * - Hiện nhãn layer khi mode = 'roads'
 */
import { useMemo } from 'react';
import * as THREE from 'three';
import { useSiteStore } from '../../store/useSiteStore';

export function RoadsRender() {
  const overlayLayers = useSiteStore((s) => s.overlayLayers);
  const showRoads     = useSiteStore((s) => s.showRoads);

  const roadLayers = overlayLayers.filter(l => l.isRoad && l.visible);

  const geometry = useMemo(() => {
    if (!showRoads || roadLayers.length === 0) return null;

    const positions: number[] = [];
    const colors: number[]    = [];

    for (const layer of roadLayers) {
      const c = new THREE.Color(layer.color);
      for (const poly of layer.polylines) {
        for (let i = 0; i < poly.length - 1; i++) {
          const a = poly[i], b = poly[i + 1];
          positions.push(a.x, a.z + 1.2, a.y,  b.x, b.z + 1.2, b.y);
          // prettier-ignore
          colors.push(c.r, c.g, c.b,  c.r, c.g, c.b);
        }
      }
    }

    if (positions.length === 0) return null;

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute('color',    new THREE.Float32BufferAttribute(colors,    3));
    return g;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showRoads, overlayLayers]);

  if (!geometry) return null;

  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial vertexColors linewidth={2} />
    </lineSegments>
  );
}
