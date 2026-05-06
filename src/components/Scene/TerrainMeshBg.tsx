/**
 * Render terrain mesh của project KHÔNG active trong multi-project view.
 * Dùng màu elevation đơn giản + semi-transparent.
 */
import { useMemo } from 'react';
import * as THREE from 'three';
import type { TerrainData } from '../../lib/types';
import { ELEV_PALETTE_RGB, elevPaletteIndex } from '../../lib/analysis/elevationPalette';

interface Props {
  terrain: TerrainData;
  position: [number, number, number];
  opacity?: number;
}

export function TerrainMeshBg({ terrain, position, opacity = 0.55 }: Props) {
  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(terrain.meshPositions, 3));
    g.setAttribute('normal',   new THREE.BufferAttribute(terrain.meshNormals,   3));
    g.setIndex(new THREE.BufferAttribute(terrain.meshIndices, 1));

    // Vertex colors: elevation palette
    const hm = terrain.heightmap;
    const n = hm.width * hm.height;
    const colors = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const idx = elevPaletteIndex(hm.data[i], hm.minZ, hm.maxZ);
      const [r, gg, b] = ELEV_PALETTE_RGB[idx];
      colors[i * 3]     = r;
      colors[i * 3 + 1] = gg;
      colors[i * 3 + 2] = b;
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    g.computeBoundingBox();
    g.computeBoundingSphere();
    return g;
  }, [terrain]);

  return (
    <mesh geometry={geometry} position={position}>
      <meshStandardMaterial
        vertexColors
        flatShading={false}
        side={THREE.DoubleSide}
        roughness={0.95}
        metalness={0}
        transparent
        opacity={opacity}
      />
    </mesh>
  );
}
