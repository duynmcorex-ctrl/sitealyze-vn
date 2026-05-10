/**
 * LanduseLayer.tsx
 * Render bản đồ quy hoạch sử dụng đất 2D — extruded polygon mỏng (~0.5m)
 * Mỗi parcel màu theo LanduseType, hover hiện tooltip.
 *
 * Chỉ render khi mode === 'landuse'. Tọa độ DXF gốc → world space giống TerrainMesh
 * (center XY về 0, flip Z, drape lên heightmap nếu có).
 */
import { useMemo, useState } from 'react';
import * as THREE from 'three';
import { Html } from '@react-three/drei';
import { useSiteStore } from '../../store/useSiteStore';
import { LANDUSE_DISPLAY_COLOR, LANDUSE_LABEL } from '../../lib/dxf/parseLanduse';
import type { LanduseParcel } from '../../lib/types';

/** Convert DXF (x,y) → world (x, z negated) using terrain bounds for centering */
function dxfToWorld(
  pt: { x: number; y: number },
  bounds: { minX: number; maxX: number; minY: number; maxY: number },
): { x: number; z: number } {
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cy = (bounds.minY + bounds.maxY) / 2;
  return { x: pt.x - cx, z: -(pt.y - cy) };
}

export function LanduseLayer() {
  const mode = useSiteStore((s) => s.mode);
  const landuse = useSiteStore((s) => s.landuse);
  const terrain = useSiteStore((s) => s.terrain);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  // Build geometry cho từng parcel (memoize)
  const parcelMeshes = useMemo(() => {
    if (!landuse || !terrain) return [];
    const result: { parcel: LanduseParcel; geometry: THREE.ExtrudeGeometry; color: string; centerWorld: THREE.Vector3 }[] = [];
    for (const p of landuse.parcels) {
      if (p.polygon.length < 3) continue;

      // Tạo Shape 2D từ polygon (XY trong shape = world XZ)
      const shape = new THREE.Shape();
      const w0 = dxfToWorld(p.polygon[0], terrain.bounds);
      shape.moveTo(w0.x, w0.z);
      for (let i = 1; i < p.polygon.length; i++) {
        const w = dxfToWorld(p.polygon[i], terrain.bounds);
        shape.lineTo(w.x, w.z);
      }
      shape.closePath();

      const geometry = new THREE.ExtrudeGeometry(shape, {
        depth: 0.5,
        bevelEnabled: false,
      });
      // Xoay để Y là up (Shape mặc định extrude theo +Z)
      geometry.rotateX(-Math.PI / 2);

      // Tâm parcel (cho tooltip placement)
      let sumX = 0, sumZ = 0;
      for (const pt of p.polygon) {
        const w = dxfToWorld(pt, terrain.bounds);
        sumX += w.x; sumZ += w.z;
      }
      const cx = sumX / p.polygon.length;
      const cz = sumZ / p.polygon.length;

      result.push({
        parcel: p,
        geometry,
        color: LANDUSE_DISPLAY_COLOR[p.inferredType],
        centerWorld: new THREE.Vector3(cx, terrain.heightmap.maxZ + 1, cz),
      });
    }
    return result;
  }, [landuse, terrain]);

  if (mode !== 'landuse' || !landuse || parcelMeshes.length === 0) return null;

  const hovered = parcelMeshes.find(m => m.parcel.id === hoveredId);

  return (
    <group>
      {parcelMeshes.map(({ parcel, geometry, color }) => (
        <mesh
          key={parcel.id}
          geometry={geometry}
          position={[0, terrain!.heightmap.maxZ + 0.2, 0]}
          onPointerOver={(e) => { e.stopPropagation(); setHoveredId(parcel.id); }}
          onPointerOut={() => setHoveredId(null)}
        >
          <meshStandardMaterial
            color={color}
            opacity={hoveredId === parcel.id ? 0.95 : 0.75}
            transparent
            side={THREE.DoubleSide}
          />
        </mesh>
      ))}

      {/* Tooltip on hover */}
      {hovered && (
        <Html position={hovered.centerWorld} center distanceFactor={50}>
          <div
            style={{
              background: 'rgba(15, 23, 42, 0.95)',
              border: '1px solid rgba(0, 229, 204, 0.5)',
              padding: '8px 12px',
              borderRadius: 6,
              color: '#e2e8f0',
              fontSize: 12,
              fontFamily: 'system-ui, sans-serif',
              minWidth: 160,
              pointerEvents: 'none',
              boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
            }}
          >
            <div style={{ fontWeight: 700, color: hovered.color, marginBottom: 4 }}>
              {LANDUSE_LABEL[hovered.parcel.inferredType]}
            </div>
            {hovered.parcel.indicator?.code && (
              <div><b>Mã:</b> {hovered.parcel.indicator.code}</div>
            )}
            <div><b>Diện tích:</b> {hovered.parcel.areaSqm.toFixed(0)} m² ({(hovered.parcel.areaSqm/10000).toFixed(2)} ha)</div>
            {hovered.parcel.indicator?.maxDensity !== null && hovered.parcel.indicator?.maxDensity !== undefined && (
              <div><b>Mật độ XD:</b> {hovered.parcel.indicator.maxDensity}%</div>
            )}
            {hovered.parcel.indicator?.maxFloors !== null && hovered.parcel.indicator?.maxFloors !== undefined && (
              <div><b>Tầng cao:</b> {hovered.parcel.indicator.maxFloors}</div>
            )}
            {hovered.parcel.indicator?.far !== null && hovered.parcel.indicator?.far !== undefined && (
              <div><b>FAR:</b> {hovered.parcel.indicator.far}</div>
            )}
            {hovered.parcel.indicator?.population !== null && hovered.parcel.indicator?.population !== undefined && (
              <div><b>Dân số:</b> {hovered.parcel.indicator.population} người</div>
            )}
          </div>
        </Html>
      )}
    </group>
  );
}
