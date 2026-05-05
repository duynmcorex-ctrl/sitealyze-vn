import { useMemo } from 'react';
import * as THREE from 'three';
import type { OverlayLayer } from '../../lib/types';
import { useSiteStore } from '../../store/useSiteStore';

export function OverlayLayerRenderer() {
  const overlayLayers = useSiteStore((s) => s.overlayLayers);
  return (
    <>
      {overlayLayers.filter((l) => l.visible).map((layer) => (
        <OverlayLines key={layer.id} layer={layer} />
      ))}
    </>
  );
}

function OverlayLines({ layer }: { layer: OverlayLayer }) {
  const geometry = useMemo(() => {
    const positions: number[] = [];
    for (const poly of layer.polylines) {
      for (let i = 0; i < poly.length - 1; i++) {
        const a = poly[i];
        const b = poly[i + 1];
        positions.push(a.x, a.y, a.z, b.x, b.y, b.z);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    return g;
  }, [layer.polylines]);

  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial color={layer.color} linewidth={1.5} />
    </lineSegments>
  );
}
