import { useMemo } from 'react';
import * as THREE from 'three';
import { useSiteStore } from '../../store/useSiteStore';
import { computeSunPosition } from '../../lib/analysis/sun';

export function SunLight() {
  const env = useSiteStore((s) => s.env);
  const terrain = useSiteStore((s) => s.terrain);
  const sunHideBall = useSiteStore((s) => s.sunHideBall);
  const lightIntensity = useSiteStore((s) => s.sunLightIntensity);
  const darkIntensity = useSiteStore((s) => s.sunDarkIntensity);

  // SunLight nằm BÊN TRONG group đã rotate -northRotation quanh Y.
  // Để sun vector đúng hướng thực tế, bù ngược lại: truyền -northRotation.
  const sun = useMemo(
    () => computeSunPosition(env.month, env.hour, env.latitude, 105, -env.northRotation),
    [env],
  );

  if (!terrain) return null;
  const hm = terrain.heightmap;
  const sz = Math.max(hm.width, hm.height) * hm.cellSize * 0.8;
  const [vx, vy, vz] = sun.vector;
  const isDay = sun.altitude > 0;

  // Đảm bảo mặt trời luôn cao hơn đỉnh địa hình + 15% chiều rộng scene
  const minSunY = hm.maxZ + sz * 0.15;
  const sunY = Math.max(minSunY, vy * sz);
  const sunPos: [number, number, number] = [vx * sz, sunY, vz * sz];

  // Tia nắng (rays): từ vị trí mặt trời xuống các điểm lấy mẫu trên terrain
  const rayGeometry = useMemo(() => {
    if (!isDay) return null;
    const pts: number[] = [];
    const cx = (hm.width * hm.cellSize) / 2;
    const cy = (hm.height * hm.cellSize) / 2;
    for (let row = 0; row < hm.height; row += Math.ceil(hm.height / 4)) {
      for (let col = 0; col < hm.width; col += Math.ceil(hm.width / 4)) {
        const wx = col * hm.cellSize - cx;
        const wz = -(row * hm.cellSize - cy);
        const wy = hm.data[row * hm.width + col] ?? hm.minZ;
        pts.push(sunPos[0], sunPos[1], sunPos[2]);
        pts.push(wx, wy + 2, wz);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    return g;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDay, sun.altitude, sun.azimuth, terrain]);

  return (
    <>
      <directionalLight
        position={sunPos}
        intensity={isDay ? lightIntensity : 0.05}
        color={isDay ? '#fff5d6' : '#5b6b8c'}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-near={1}
        shadow-camera-far={sz * 4}
        shadow-camera-left={-sz}
        shadow-camera-right={sz}
        shadow-camera-top={sz}
        shadow-camera-bottom={-sz}
      />
      <ambientLight intensity={isDay ? darkIntensity : 0.15} color="#9ec5ff" />
      {isDay && !sunHideBall && (
        <>
          {/* Mặt trời (quả cầu) */}
          <mesh position={sunPos}>
            <sphereGeometry args={[sz * 0.04, 16, 16]} />
            <meshBasicMaterial color="#fde68a" />
          </mesh>
          {/* Quầng sáng (halo) */}
          <mesh position={sunPos}>
            <sphereGeometry args={[sz * 0.07, 12, 12]} />
            <meshBasicMaterial color="#fef3c7" transparent opacity={0.18} />
          </mesh>
          {/* Tia nắng chiếu xuống địa hình */}
          {rayGeometry && (
            <lineSegments geometry={rayGeometry}>
              <lineBasicMaterial color="#fbbf24" transparent opacity={0.25} />
            </lineSegments>
          )}
        </>
      )}
      {!isDay && (
        // Ban đêm: ánh trăng xanh tím
        <mesh position={[vx * sz, Math.max(hm.maxZ + sz * 0.1, -vy * sz), vz * sz]}>
          <sphereGeometry args={[sz * 0.025, 12, 12]} />
          <meshBasicMaterial color="#c7d2fe" />
        </mesh>
      )}
    </>
  );
}
