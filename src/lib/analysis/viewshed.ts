import type { Heightmap } from '../types';

// Tính viewshed bằng raycast trên heightmap, trả về mask 0/1.
export function computeViewshed(
  hm: Heightmap,
  observerWorld: { x: number; z: number; height: number },
  maxRange = Infinity
): Uint8Array {
  const { width: w, height: h, cellSize, data } = hm;
  const cx = (w * cellSize) / 2;
  const cy = (h * cellSize) / 2;
  const ox = Math.round((observerWorld.x + cx) / cellSize);
  const oz = Math.round((observerWorld.z + cy) / cellSize);
  if (ox < 0 || oz < 0 || ox >= w || oz >= h) return new Uint8Array(w * h);
  const observerZ = data[oz * w + ox] + observerWorld.height;
  const visible = new Uint8Array(w * h);
  const rangeCells = Math.min(maxRange / cellSize, Math.hypot(w, h));

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = x - ox;
      const dy = y - oz;
      const dist = Math.hypot(dx, dy);
      if (dist > rangeCells) continue;
      if (dist === 0) { visible[y * w + x] = 1; continue; }
      const targetZ = data[y * w + x];
      const steps = Math.ceil(dist);
      let maxAngle = -Infinity;
      let blocked = false;
      for (let s = 1; s < steps; s++) {
        const t = s / steps;
        const sx = ox + dx * t;
        const sy = oz + dy * t;
        const ix = Math.round(sx);
        const iy = Math.round(sy);
        const sz = data[iy * w + ix];
        const angle = (sz - observerZ) / (s * cellSize);
        if (angle > maxAngle) maxAngle = angle;
      }
      const targetAngle = (targetZ - observerZ) / (dist * cellSize);
      blocked = targetAngle < maxAngle - 1e-6;
      visible[y * w + x] = blocked ? 0 : 1;
    }
  }
  return visible;
}
