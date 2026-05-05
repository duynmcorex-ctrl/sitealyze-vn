import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { useSiteStore } from '../../store/useSiteStore';

export function AutoFit() {
  const terrain = useSiteStore((s) => s.terrain);
  const { camera, controls } = useThree() as any;

  useEffect(() => {
    if (!terrain || !camera) return;
    const hm = terrain.heightmap;
    const sizeX = hm.width * hm.cellSize;
    const sizeZ = hm.height * hm.cellSize;
    const diag = Math.hypot(sizeX, sizeZ);
    const midZ = (hm.minZ + hm.maxZ) / 2;

    camera.position.set(diag * 0.55, hm.maxZ + diag * 0.45, diag * 0.55);
    camera.near = Math.max(0.1, diag / 2000);
    camera.far = diag * 8;
    camera.lookAt(0, midZ, 0);
    camera.updateProjectionMatrix();

    if (controls && controls.target) {
      controls.target.set(0, midZ, 0);
      controls.update?.();
    }
  }, [terrain, camera, controls]);

  return null;
}
