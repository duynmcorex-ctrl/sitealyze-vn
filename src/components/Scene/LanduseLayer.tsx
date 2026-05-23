/**
 * LanduseLayer.tsx
 * Render bản đồ quy hoạch sử dụng đất:
 *  - Khi mode='landuse' HOẶC showMassing3D = true → hiển thị
 *  - Slab 2D thường ngày (depth ~0.5m) khi không bật massing
 *  - Khối 3D công trình (depth = maxFloors × floorHeight) khi bật massing
 *  - Footprint khối thu nhỏ theo √(MĐXD/100) — khối < ranh ô đất
 *  - Drape lên mặt địa hình (sample heightmap) để khối đặt trên ground
 */
import { useMemo, useState } from 'react';
import * as THREE from 'three';
import { Html } from '@react-three/drei';
import { useSiteStore } from '../../store/useSiteStore';
import { LANDUSE_DISPLAY_COLOR, LANDUSE_LABEL } from '../../lib/dxf/parseLanduse';
import type { LanduseParcel } from '../../lib/types';
import { sampleHM } from '../../lib/terrain/sample';
import { shrinkPolygonToCenter } from '../../lib/util/polygonScale';

/** Convert DXF (x,y) → world (x, z negated) using bounds center for centering */
function dxfToWorld(
  pt: { x: number; y: number },
  bounds: { minX: number; maxX: number; minY: number; maxY: number },
): { x: number; z: number } {
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cy = (bounds.minY + bounds.maxY) / 2;
  return { x: pt.x - cx, z: -(pt.y - cy) };
}

/**
 * Tính bbox của tất cả parcel polygons (DXF coords) — dùng khi landuse file
 * có coord origin khác terrain file.
 */
function computeLanduseBounds(parcels: LanduseParcel[]) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of parcels) {
    for (const pt of p.polygon) {
      if (pt.x < minX) minX = pt.x;
      if (pt.y < minY) minY = pt.y;
      if (pt.x > maxX) maxX = pt.x;
      if (pt.y > maxY) maxY = pt.y;
    }
  }
  return { minX, minY, maxX, maxY };
}

/**
 * Quyết định bounds nào dùng cho landuse centering:
 *  - Nếu landuse bbox NẰM TRONG terrain bbox (cùng coord system) → dùng terrain
 *  - Nếu KHÔNG → landuse file có coord khác → dùng landuse-own bounds
 *    (parcels sẽ center tại world origin, có thể overlap terrain hoặc ko)
 */
function pickCenteringBounds(
  landuseBounds: ReturnType<typeof computeLanduseBounds>,
  terrainBounds: { minX: number; maxX: number; minY: number; maxY: number },
): { bounds: typeof terrainBounds; sharedCoord: boolean } {
  // Check overlap: landuse bbox center có trong terrain bbox không
  const luCx = (landuseBounds.minX + landuseBounds.maxX) / 2;
  const luCy = (landuseBounds.minY + landuseBounds.maxY) / 2;
  const inTerrain =
    luCx >= terrainBounds.minX && luCx <= terrainBounds.maxX &&
    luCy >= terrainBounds.minY && luCy <= terrainBounds.maxY;
  if (inTerrain) {
    return { bounds: terrainBounds, sharedCoord: true };
  }
  // Không overlap → landuse có coord riêng
  return { bounds: landuseBounds, sharedCoord: false };
}

export function LanduseLayer() {
  const mode          = useSiteStore((s) => s.mode);
  const landuse       = useSiteStore((s) => s.landuse);
  const terrain       = useSiteStore((s) => s.terrain);
  const showMassing   = useSiteStore((s) => s.showMassing3D);
  const floorHeight   = useSiteStore((s) => s.floorHeight);
  const typeOverrides = useSiteStore((s) => s.typeOverrides);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  // Build geometry cho từng parcel (memoize theo những input ảnh hưởng)
  const parcelMeshes = useMemo(() => {
    if (!landuse || !terrain) return [];

    // Quyết định bounds dùng cho centering: terrain (cùng coord) hoặc landuse-own
    const landuseBounds = computeLanduseBounds(landuse.parcels);
    const { bounds: centerBounds, sharedCoord } = pickCenteringBounds(landuseBounds, terrain.bounds);
    if (!sharedCoord) {
      console.warn(
        `[LanduseLayer] ⚠ DXF QH có coord origin KHÁC terrain DXF → ` +
        `dùng landuse-own center. Để align chính xác, export 2 file CAD từ ` +
        `cùng project AutoCAD (same UCS origin).`
      );
    }

    const result: {
      parcel: LanduseParcel;
      geometry: THREE.ExtrudeGeometry;
      color: string;
      groundY: number;
      isMassing: boolean;
      centerWorld: THREE.Vector3;
    }[] = [];

    for (const p of landuse.parcels) {
      if (p.polygon.length < 3) continue;

      // World coords — dùng centerBounds (terrain hoặc landuse own)
      const worldPts = p.polygon.map(pt => dxfToWorld(pt, centerBounds));

      // Drape: chỉ khi sharedCoord (cùng coord system) — sample heightmap Z
      // Khi ko shared, đặt parcel ở Z=0 (nền phẳng) để khối vẫn hiện đẹp
      let groundY = terrain.heightmap.minZ;
      if (sharedCoord) {
        let sumZ = 0, cntZ = 0;
        for (const w of worldPts) {
          const z = sampleHM(w.x, w.z, terrain.bounds, terrain.heightmap, NaN);
          if (Number.isFinite(z)) { sumZ += z; cntZ++; }
        }
        if (cntZ > 0) groundY = sumZ / cntZ;
      } else {
        // Khác coord: đặt ngay trên mặt phẳng grid (Y=0) để khối nổi rõ
        groundY = 0;
      }

      // Resolve floors/density — Indicator parcel-level WIN, fallback typeOverride
      const indicator = p.indicator;
      const typeOv = typeOverrides[p.inferredType];
      const floors  = indicator?.maxFloors  ?? typeOv?.maxFloors  ?? null;
      const density = indicator?.maxDensity ?? typeOv?.maxDensity ?? null;
      const isMassing = !!(showMassing && floors && floors > 0);

      // Footprint: nếu massing và có MĐXD → thu nhỏ shape
      let shapePts = worldPts;
      if (isMassing && density && density > 0 && density < 100) {
        shapePts = shrinkPolygonToCenter(
          worldPts.map(w => ({ x: w.x, y: w.z })),
          Math.sqrt(density / 100),
        ).map(p => ({ x: p.x, z: p.y }));
      }

      // Tạo Shape 2D
      const shape = new THREE.Shape();
      shape.moveTo(shapePts[0].x, shapePts[0].z);
      for (let i = 1; i < shapePts.length; i++) {
        shape.lineTo(shapePts[i].x, shapePts[i].z);
      }
      shape.closePath();

      // Extrude depth: khối 3D dùng floors × floorHeight, slab thường 0.5m
      const depth = isMassing && floors
        ? floors * floorHeight
        : 0.5;

      const geometry = new THREE.ExtrudeGeometry(shape, {
        depth,
        bevelEnabled: false,
      });
      // Xoay để Y up (Shape mặc định extrude theo +Z)
      geometry.rotateX(-Math.PI / 2);

      // Tâm parcel (tooltip placement) — dùng world coords gốc, không scaled
      let sumX = 0, sumZ2 = 0;
      for (const w of worldPts) { sumX += w.x; sumZ2 += w.z; }
      const cx = sumX / worldPts.length;
      const cz = sumZ2 / worldPts.length;

      result.push({
        parcel: p,
        geometry,
        color: LANDUSE_DISPLAY_COLOR[p.inferredType],
        groundY,
        isMassing,
        centerWorld: new THREE.Vector3(cx, groundY + depth + 1, cz),
      });
    }
    return result;
  }, [landuse, terrain, showMassing, floorHeight, typeOverrides]);

  // Hiển thị nếu: đang ở mode landuse HOẶC user bật toggle 3D massing
  const shouldRender = mode === 'landuse' || showMassing;
  if (!shouldRender || !landuse || parcelMeshes.length === 0) return null;

  const hovered = parcelMeshes.find(m => m.parcel.id === hoveredId);

  return (
    <group>
      {parcelMeshes.map(({ parcel, geometry, color, groundY, isMassing }) => (
        <mesh
          key={parcel.id}
          geometry={geometry}
          position={[0, groundY + (isMassing ? 0 : 0.2), 0]}
          onPointerOver={(e) => { e.stopPropagation(); setHoveredId(parcel.id); }}
          onPointerOut={() => setHoveredId(null)}
        >
          <meshStandardMaterial
            color={color}
            opacity={isMassing ? (hoveredId === parcel.id ? 0.95 : 0.82) : (hoveredId === parcel.id ? 0.95 : 0.75)}
            transparent
            side={THREE.DoubleSide}
            roughness={isMassing ? 0.7 : 0.95}
            metalness={isMassing ? 0.15 : 0}
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
              <div>
                <b>Tầng cao:</b> {hovered.parcel.indicator.maxFloors}
                {hovered.isMassing && (
                  <span style={{ color: '#fbbf24', marginLeft: 6 }}>
                    (≈{(hovered.parcel.indicator.maxFloors * floorHeight).toFixed(1)} m)
                  </span>
                )}
              </div>
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
