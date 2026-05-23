/**
 * FloodMesh.tsx
 * Mô phỏng ngập lụt 3D — đúng theo logic floodmap.net (Section 10 guide).
 *
 * Thuật toán: duyệt từng cell heightmap, chỉ tạo quad cho cell có z ≤ waterLevel.
 * Màu sắc: depth-proportional (nông = cyan nhạt, sâu = xanh navy đậm).
 * Khớp với buildFloodDataURL dùng cho bản đồ 2D:
 *   alpha = min(220, 80 + sqrt(depth) * 30)
 *   G channel = max(60, 140 - depth * 3)
 *
 * Không dùng PlaneGeometry phủ cả terrain vì:
 *   - Sẽ tô xanh cả vùng đỉnh núi cao hơn mực nước
 *   - Sẽ tô xanh vùng ngoài mask (nước lơ lửng trong không khí)
 */

import { useMemo } from 'react';
import * as THREE from 'three';
import { useSiteStore } from '../../store/useSiteStore';

export function FloodMesh() {
  const terrain     = useSiteStore(s => s.terrain);
  const showFlood3D = useSiteStore(s => s.showFlood3D);
  const waterLevel  = useSiteStore(s => s.waterLevel3D);

  const geometry = useMemo(() => {
    if (!terrain || !showFlood3D) return null;
    const hm = terrain.heightmap;
    const { width, height, cellSize, data, mask, minZ } = hm;

    // Tâm terrain (giống buildMeshFromHeightmap centerXY=true)
    const cx = (width  * cellSize) / 2;
    const cy = (height * cellSize) / 2;

    // Độ sâu tối đa để normalize màu
    const maxDepth = Math.max(1, waterLevel - minZ);

    const verts: number[] = [];
    const cols:  number[] = [];
    const idxs:  number[] = [];

    for (let y = 0; y < height - 1; y++) {
      for (let x = 0; x < width - 1; x++) {
        const ia = y * width + x;
        const ib = ia + 1;
        const ic = ia + width;
        const id = ic + 1;

        const za = data[ia];
        const zb = data[ib];
        const zc = data[ic];
        const zd = data[id];

        // Bỏ cell nếu tất cả 4 đỉnh đều trên mực nước
        if (za > waterLevel && zb > waterLevel && zc > waterLevel && zd > waterLevel) continue;

        // Bỏ cell ngoài mask (nước lơ lửng trong không khí)
        if (mask && !mask[ia] && !mask[ib] && !mask[ic] && !mask[id]) continue;

        // 4 góc của cell trong tọa độ Three.js
        const x0 = x * cellSize - cx;
        const z0 = -(y * cellSize - cy);       // flip Y→-Z (North = -Z)
        const x1 = (x + 1) * cellSize - cx;
        const z1 = -((y + 1) * cellSize - cy);

        const base = verts.length / 3;

        // 4 đỉnh tại mực nước + offset nhỏ tránh z-fight với terrain
        verts.push(x0, waterLevel + 0.08, z0);   // a = NW
        verts.push(x1, waterLevel + 0.08, z0);   // b = NE
        verts.push(x0, waterLevel + 0.08, z1);   // c = SW
        verts.push(x1, waterLevel + 0.08, z1);   // d = SE

        // Màu theo độ sâu — khớp logic buildFloodDataURL:
        //   alpha = min(220, 80 + sqrt(depth) * 30)  →  dùng làm brightness thay thế
        //   G = max(60, 140 - depth * 3)
        // Convert sang RGB 0..1 cho Three.js vertexColors
        const depths = [
          Math.max(0, waterLevel - za),
          Math.max(0, waterLevel - zb),
          Math.max(0, waterLevel - zc),
          Math.max(0, waterLevel - zd),
        ];
        for (const d of depths) {
          const t = Math.min(1, d / maxDepth);  // 0=nông, 1=sâu tối đa
          // Nông (t=0): cyan nhạt   RGB(0.05, 0.75, 0.95)
          // Sâu  (t=1): navy đậm    RGB(0.00, 0.20, 0.75)
          cols.push(
            0.05 * (1 - t),           // R: 0.05 → 0.00
            0.75 - t * 0.55,          // G: 0.75 → 0.20
            0.95 - t * 0.20,          // B: 0.95 → 0.75
          );
        }

        // 2 tam giác / quad (counter-clockwise khi nhìn từ trên xuống)
        idxs.push(base,     base + 2, base + 1);
        idxs.push(base + 1, base + 2, base + 3);
      }
    }

    if (verts.length === 0) return null;

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(verts), 3));
    g.setAttribute('color',    new THREE.BufferAttribute(new Float32Array(cols), 3));
    g.setIndex(new THREE.BufferAttribute(new Uint32Array(idxs), 1));
    // Normal không cần chính xác vì dùng MeshBasicMaterial
    return g;
  }, [terrain, showFlood3D, waterLevel]);

  if (!geometry) return null;

  return (
    <mesh geometry={geometry} renderOrder={2}>
      <meshBasicMaterial
        vertexColors
        transparent
        opacity={0.72}      // opacity cố định; depth effect đến từ vertex color
        side={THREE.DoubleSide}
        depthWrite={false}  // không ghi depth buffer → không che terrain phía dưới
      />
    </mesh>
  );
}
