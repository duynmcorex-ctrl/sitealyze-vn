/**
 * TreeInstances.tsx
 * Render cây hiện trạng dạng instanced 3D:
 *   - Thân cây: cylinder mảnh (80% chiều cao)
 *   - Tán cây:  cone ở trên (40% chiều cao, radius = crownRadius từ DXF CIRCLE)
 *
 * Dùng InstancedMesh để render hiệu quả hàng trăm cây mà không ảnh hưởng framerate.
 */
import { useMemo, useRef, useEffect } from 'react';
import * as THREE from 'three';
import { useSiteStore } from '../../store/useSiteStore';
import type { TreePoint } from '../../lib/types';

interface Props {
  trees: TreePoint[];
}

/** Tạo matrix cho từng cây theo vị trí + scale */
function buildMatrices(trees: TreePoint[], treeHeight: number) {
  const trunkMats: THREE.Matrix4[] = [];
  const canopyMats: THREE.Matrix4[] = [];
  const m = new THREE.Matrix4();
  const trunkH  = treeHeight * 0.65;  // 65% chiều cao = thân
  const canopyH = treeHeight * 0.55;  // 55% chiều cao = tán (overlap nhẹ để liền mạch)

  for (const t of trees) {
    const r = Math.max(0.3, Math.min(t.crownRadius, 15)); // clamp 0.3–15m

    // Thân: tâm ở y + trunkH/2
    const trunkRadius = Math.max(0.15, r * 0.08);
    m.makeScale(trunkRadius, trunkH / 2, trunkRadius);    // cylinder geo height=2 → chia 2
    m.setPosition(t.x, t.y + trunkH / 2, t.z);
    trunkMats.push(m.clone());

    // Tán: đáy tán ở y + trunkH * 0.7, tâm hình học ở trên đó
    const canopyBase = t.y + trunkH * 0.7;
    m.makeScale(r, canopyH / 2, r);                       // cone geo height=2 → chia 2
    m.setPosition(t.x, canopyBase + canopyH / 2, t.z);
    canopyMats.push(m.clone());
  }
  return { trunkMats, canopyMats };
}

export function TreeInstances({ trees }: Props) {
  const treeHeight = useSiteStore((s) => s.env.treeHeight);

  const trunkRef  = useRef<THREE.InstancedMesh>(null);
  const canopyRef = useRef<THREE.InstancedMesh>(null);

  // Geometry: dùng low-poly để nhẹ
  const trunkGeo  = useMemo(() => new THREE.CylinderGeometry(1, 1, 2, 6, 1), []);
  const canopyGeo = useMemo(() => new THREE.ConeGeometry(1, 2, 7, 1), []);

  const trunkMat  = useMemo(() => new THREE.MeshLambertMaterial({ color: '#5C4033' }), []); // nâu đất
  const canopyMat = useMemo(() => new THREE.MeshLambertMaterial({ color: '#2E7D32', side: THREE.FrontSide }), []); // xanh lá

  const { trunkMats, canopyMats } = useMemo(
    () => buildMatrices(trees, treeHeight),
    [trees, treeHeight],
  );

  // Cập nhật instance matrices mỗi khi trees hoặc height thay đổi
  useEffect(() => {
    const tm = trunkRef.current;
    const cm = canopyRef.current;
    if (!tm || !cm) return;

    trunkMats.forEach((mat, i)  => tm.setMatrixAt(i, mat));
    canopyMats.forEach((mat, i) => cm.setMatrixAt(i, mat));
    tm.instanceMatrix.needsUpdate = true;
    cm.instanceMatrix.needsUpdate = true;
    tm.computeBoundingSphere();
    cm.computeBoundingSphere();
  }, [trunkMats, canopyMats]);

  if (trees.length === 0) return null;
  const n = trees.length;

  return (
    <group name="trees">
      {/* key={n} → force remount khi số cây thay đổi, tránh stale InstancedMesh count */}
      <instancedMesh key={`trunk-${n}`}  ref={trunkRef}  args={[trunkGeo, trunkMat, n]}   castShadow />
      <instancedMesh key={`canopy-${n}`} ref={canopyRef} args={[canopyGeo, canopyMat, n]} castShadow receiveShadow />
    </group>
  );
}
