import { useMemo } from 'react';
import { useSiteStore } from '../../store/useSiteStore';
import { computeSunPosition } from '../../lib/analysis/sun';

export function SunLight() {
  const env = useSiteStore((s) => s.env);
  const terrain = useSiteStore((s) => s.terrain);

  // northRotation đã được áp dụng ở group cha trong Canvas3D, không cần áp lại
  const sun = useMemo(() => computeSunPosition(env.month, env.hour, env.latitude, 105, 0), [env]);

  if (!terrain) return null;
  const hm = terrain.heightmap;
  const sz = Math.max(hm.width, hm.height) * hm.cellSize * 0.8;
  const [vx, vy, vz] = sun.vector;
  const isDay = sun.altitude > 0;

  return (
    <>
      <directionalLight
        position={[vx * sz, Math.max(0.05, vy) * sz, vz * sz]}
        intensity={isDay ? 1.6 : 0.05}
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
      <ambientLight intensity={isDay ? 0.25 : 0.15} color="#9ec5ff" />
      {isDay && (
        <mesh position={[vx * sz, vy * sz, vz * sz]}>
          <sphereGeometry args={[sz * 0.04, 16, 16]} />
          <meshBasicMaterial color="#fde68a" />
        </mesh>
      )}
    </>
  );
}
