/**
 * SceneTweener.tsx
 * Inside Canvas3D — lắng nghe pendingSceneLoad từ store và animate camera đến scene đã lưu.
 *
 * Khác với CameraPreset (set tức thì), SceneTweener dùng requestAnimationFrame
 * + cubic easing để di chuyển mượt trong ~1.5s.
 */

import { useEffect, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useSiteStore } from '../../store/useSiteStore';

const TWEEN_DURATION_MS = 1500;

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export function SceneTweener() {
  const { camera, controls } = useThree() as {
    camera: THREE.PerspectiveCamera;
    controls: { target: THREE.Vector3; update: () => void } | null;
  };

  const pending = useSiteStore(s => s.pendingSceneLoad);
  const clearPending = useSiteStore(s => s.clearPendingScene);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!pending) return;

    // Hủy animation đang chạy nếu có
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }

    const startPos = camera.position.clone();
    const endPos   = new THREE.Vector3(...pending.position);
    const startTgt = controls?.target.clone() ?? new THREE.Vector3();
    const endTgt   = new THREE.Vector3(...pending.target);
    const startFov = camera.fov;
    const endFov   = pending.fov;
    const t0 = performance.now();

    const step = () => {
      const elapsed = performance.now() - t0;
      const k = Math.min(1, elapsed / TWEEN_DURATION_MS);
      const e = easeInOutCubic(k);

      camera.position.lerpVectors(startPos, endPos, e);
      camera.fov = startFov + (endFov - startFov) * e;
      camera.updateProjectionMatrix();

      if (controls) {
        controls.target.lerpVectors(startTgt, endTgt, e);
        controls.update();
      } else {
        camera.lookAt(endTgt);
      }

      if (k < 1) {
        rafRef.current = requestAnimationFrame(step);
      } else {
        rafRef.current = null;
        clearPending();
      }
    };

    rafRef.current = requestAnimationFrame(step);

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending]);

  return null;
}
