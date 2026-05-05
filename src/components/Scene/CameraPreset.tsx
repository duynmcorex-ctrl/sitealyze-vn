/**
 * CameraPreset — bên trong Canvas, lắng nghe store và di chuyển camera đến view đặt trước.
 */
import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useSiteStore } from '../../store/useSiteStore';

export function CameraPreset() {
  const { camera, controls } = useThree() as {
    camera: THREE.PerspectiveCamera;
    controls: { target: THREE.Vector3; update: () => void } | null;
  };

  const terrain         = useSiteStore((s) => s.terrain);
  const preset          = useSiteStore((s) => s.cameraPreset);
  const setCameraPreset = useSiteStore((s) => s.setCameraPreset);

  useEffect(() => {
    if (!preset || !terrain) return;

    const hm   = terrain.heightmap;
    const sizeX = hm.width  * hm.cellSize;
    const sizeZ = hm.height * hm.cellSize;
    const diag  = Math.hypot(sizeX, sizeZ);
    const midY  = (hm.minZ + hm.maxZ) / 2;
    const d     = diag * 0.72;          // khoảng cách từ tâm đến camera
    const high  = diag * 0.55;          // chiều cao so với midY

    const target = new THREE.Vector3(0, midY, 0);
    const up     = new THREE.Vector3(0, 1, 0);
    let   pos    = new THREE.Vector3();

    switch (preset) {
      // ── Mặt bằng (nhìn từ trên xuống) ──────────────────────────────────
      case 'top':
        pos.set(0, midY + diag * 0.95, 0.01); // offset nhỏ tránh gimbal
        up.set(0, 0, -1);                       // Bắc hướng lên màn hình
        break;

      // ── Nhìn từ Nam vào (hướng Bắc = +Z trong Three.js) ────────────────
      case 'south':
        pos.set(0, midY + high * 0.3, -d);
        break;

      // ── Nhìn từ Bắc vào (hướng Nam = −Z) ───────────────────────────────
      case 'north':
        pos.set(0, midY + high * 0.3, d);
        break;

      // ── Nhìn từ Đông vào (−X) ───────────────────────────────────────────
      case 'east':
        pos.set(d, midY + high * 0.3, 0);
        break;

      // ── Nhìn từ Tây vào (+X) ────────────────────────────────────────────
      case 'west':
        pos.set(-d, midY + high * 0.3, 0);
        break;

      // ── Phối cảnh 3D mặc định ───────────────────────────────────────────
      case '3d':
      default:
        pos.set(diag * 0.55, hm.maxZ + diag * 0.45, diag * 0.55);
        break;
    }

    camera.position.copy(pos);
    camera.up.copy(up);
    camera.lookAt(target);
    camera.near = Math.max(0.1, diag / 2000);
    camera.far  = diag * 8;
    camera.updateProjectionMatrix();

    if (controls) {
      controls.target.copy(target);
      controls.update();
    }

    setCameraPreset(null); // reset sau khi dùng
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset]);

  return null;
}
