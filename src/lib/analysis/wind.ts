import type { Heightmap } from '../types';

export interface WindParticle {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  life: number;
}

// Khởi tạo particle hạt gió - update mỗi frame ở client.
export function initWindParticles(
  hm: Heightmap,
  count: number,
  windDirDeg: number,
  speed: number
): WindParticle[] {
  const cx = (hm.width * hm.cellSize) / 2;
  const cy = (hm.height * hm.cellSize) / 2;
  const rad = (windDirDeg + 180) * Math.PI / 180;
  const dx = Math.sin(rad) * speed;
  const dz = -Math.cos(rad) * speed;
  const result: WindParticle[] = [];
  for (let i = 0; i < count; i++) {
    const px = (Math.random() - 0.5) * hm.width * hm.cellSize;
    const pz = (Math.random() - 0.5) * hm.height * hm.cellSize;
    result.push({
      x: px, y: 0, z: pz,
      vx: dx, vy: 0, vz: dz,
      life: Math.random() * 100,
    });
  }
  void cx; void cy;
  return result;
}

export function sampleHeight(hm: Heightmap, worldX: number, worldZ: number): number {
  const cx = (hm.width * hm.cellSize) / 2;
  const cy = (hm.height * hm.cellSize) / 2;
  const fx = (worldX + cx) / hm.cellSize;
  // Three.js Z = cy − (gridRow * cellSize)  →  gridRow = (cy − worldZ) / cellSize
  const fz = (cy - worldZ) / hm.cellSize;
  const x = Math.max(0, Math.min(hm.width - 1, Math.round(fx)));
  const z = Math.max(0, Math.min(hm.height - 1, Math.round(fz)));
  return hm.data[z * hm.width + x];
}
