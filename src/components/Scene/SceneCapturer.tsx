/**
 * SceneCapturer.tsx
 * Inside Canvas3D — lắng nghe saveSceneTrigger từ store. Khi user click "+ Thêm scene":
 *   1. Capture camera.position, controls.target, camera.fov
 *   2. Capture canvas thành thumbnail dataURL 120×80
 *   3. Gọi addScene()
 */

import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useSiteStore } from '../../store/useSiteStore';

export function SceneCapturer() {
  const { camera, controls, gl, scene } = useThree() as {
    camera: THREE.PerspectiveCamera;
    controls: { target: THREE.Vector3 } | null;
    gl: THREE.WebGLRenderer;
    scene: THREE.Scene;
  };

  const trigger          = useSiteStore(s => s.saveSceneTrigger);
  const pendingName      = useSiteStore(s => s.pendingSceneName);
  const addScene         = useSiteStore(s => s.addScene);
  const clearSaveTrigger = useSiteStore(s => s.clearSaveSceneTrigger);

  useEffect(() => {
    if (trigger === 0 || !pendingName) return;

    // Capture camera state
    const pos = camera.position.toArray() as [number, number, number];
    const tgt = (controls?.target ?? new THREE.Vector3()).toArray() as [number, number, number];
    const fov = camera.fov;

    // Capture thumbnail: render lại scene rồi shrink xuống 120×80
    let thumbnail: string | undefined;
    try {
      gl.render(scene, camera);
      const src = gl.domElement;
      const canvas = document.createElement('canvas');
      canvas.width = 120;
      canvas.height = 80;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(src, 0, 0, src.width, src.height, 0, 0, 120, 80);
        thumbnail = canvas.toDataURL('image/jpeg', 0.7);
      }
    } catch (e) {
      console.warn('[SceneCapturer] thumbnail capture failed:', e);
    }

    addScene({
      id: `scene-${Date.now()}`,
      name: pendingName,
      position: pos,
      target:   tgt,
      fov,
      thumbnail,
      createdAt: Date.now(),
    });
    clearSaveTrigger();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trigger]);

  return null;
}
