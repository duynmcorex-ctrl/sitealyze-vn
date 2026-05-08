/**
 * RoadsRender.tsx
 * Render layer giao thông:
 *  - Màu theo loại mặt đường (surface): bê tông / nhựa / cấp phối / đất
 *  - Độ dày line dùng offset Z để nổi trên terrain
 *  - Marker lối vào (🔴 sphere nhỏ) tại các điểm endpoint gần biên địa hình
 */
import { useMemo } from 'react';
import * as THREE from 'three';
import { useSiteStore } from '../../store/useSiteStore';
import { SURFACE_COLOR, SURFACE_LABEL, ROLE_LABEL } from '../../lib/analysis/roadClassify';
import type { RoadSurface } from '../../lib/types';

// Offset Z cho từng loại đường để tránh z-fighting (đường asphalt cao hơn vì thường quan trọng hơn)
const SURFACE_ZOFFSET: Record<RoadSurface, number> = {
  concrete: 1.4,
  asphalt:  1.6,
  gravel:   1.2,
  dirt:     1.0,
  unknown:  1.2,
};

export function RoadsRender() {
  const overlayLayers = useSiteStore((s) => s.overlayLayers);
  const showRoads     = useSiteStore((s) => s.showRoads);

  const roadLayers = overlayLayers.filter(l => l.isRoad && l.visible);

  // ── Road line geometry — một BufferGeometry mỗi surface type để group màu ──
  const geometry = useMemo(() => {
    if (!showRoads || roadLayers.length === 0) return null;

    const positions: number[] = [];
    const colors:    number[] = [];

    for (const layer of roadLayers) {
      const surface = layer.roadMeta?.surface ?? 'unknown';
      const zOff    = SURFACE_ZOFFSET[surface];
      // Màu theo surface (đã lưu ở layer.color khi tạo từ FileUpload)
      const c = new THREE.Color(layer.color);

      for (const poly of layer.polylines) {
        for (let i = 0; i < poly.length - 1; i++) {
          const a = poly[i], b = poly[i + 1];
          // Dùng y từ heightmap draped (poly[i].z = Three.js Y từ overlayToWorldSpace)
          // poly format: {x, y (=height), z (=−DXF_Y)}
          positions.push(a.x, a.y + zOff, a.z,  b.x, b.y + zOff, b.z);
          colors.push(c.r, c.g, c.b,  c.r, c.g, c.b);
        }
      }
    }

    if (positions.length === 0) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute('color',    new THREE.Float32BufferAttribute(colors,    3));
    return g;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showRoads, overlayLayers]);

  // ── Entrance markers — spheres nhỏ tại lối vào ────────────────────────────
  const entranceData = useMemo(() => {
    if (!showRoads) return [];
    const pts: { x: number; z: number; y: number }[] = [];
    for (const layer of roadLayers) {
      const eps = layer.roadMeta?.entrancePoints ?? [];
      for (const ep of eps) {
        // Tìm y (height) gần nhất trong polylines của layer
        let bestY = 0;
        let bestDist = Infinity;
        for (const poly of layer.polylines) {
          for (const p of poly) {
            const d2 = (p.x - ep.x) ** 2 + (p.z - ep.z) ** 2;
            if (d2 < bestDist) { bestDist = d2; bestY = p.y; }
          }
        }
        pts.push({ x: ep.x, z: ep.z, y: bestY });
      }
    }
    return pts;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showRoads, overlayLayers]);

  if (!showRoads) return null;

  return (
    <group name="roads">
      {/* Road lines */}
      {geometry && (
        <lineSegments geometry={geometry}>
          <lineBasicMaterial vertexColors />
        </lineSegments>
      )}

      {/* Entrance markers */}
      {entranceData.map((ep, i) => (
        <group key={i} position={[ep.x, ep.y + 3, ep.z]}>
          {/* Cột đứng nhỏ */}
          <mesh position={[0, -1.5, 0]}>
            <cylinderGeometry args={[0.15, 0.15, 3, 6]} />
            <meshLambertMaterial color="#FF6600" />
          </mesh>
          {/* Đầu sphere */}
          <mesh>
            <sphereGeometry args={[0.8, 8, 6]} />
            <meshLambertMaterial color="#FF4400" emissive="#FF2200" emissiveIntensity={0.4} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

// ── Road Legend component (dùng trong sidebar / Legend) ───────────────────────

export function RoadsLegend() {
  const overlayLayers = useSiteStore((s) => s.overlayLayers);
  const showRoads     = useSiteStore((s) => s.showRoads);

  if (!showRoads) return null;

  const roadLayers = overlayLayers.filter(l => l.isRoad && l.visible);
  if (roadLayers.length === 0) return null;

  // Gom unique surfaces
  const surfaces = new Set<RoadSurface>();
  let totalEntrances = 0;
  for (const l of roadLayers) {
    if (l.roadMeta) {
      surfaces.add(l.roadMeta.surface);
      totalEntrances += l.roadMeta.entrancePoints.length;
    }
  }

  return (
    <div className="space-y-1">
      {Array.from(surfaces).map((s) => (
        <div key={s} className="flex items-center gap-2">
          <span
            className="w-6 h-2 rounded-sm flex-shrink-0"
            style={{ background: SURFACE_COLOR[s] }}
          />
          <span className="text-[10px] text-slate-300">{SURFACE_LABEL[s]}</span>
        </div>
      ))}
      {totalEntrances > 0 && (
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-orange-500 flex-shrink-0" />
          <span className="text-[10px] text-slate-300">{totalEntrances} lối vào</span>
        </div>
      )}
    </div>
  );
}

