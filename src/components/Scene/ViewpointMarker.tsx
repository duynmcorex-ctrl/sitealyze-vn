import { useSiteStore } from '../../store/useSiteStore';

export function ViewpointMarker() {
  const vp = useSiteStore((s) => s.viewpoint);
  const terrain = useSiteStore((s) => s.terrain);
  if (!vp || !terrain) return null;
  const hm = terrain.heightmap;
  const cx = (hm.width * hm.cellSize) / 2;
  const cy = (hm.height * hm.cellSize) / 2;
  const ix = Math.round((vp.x + cx) / hm.cellSize);
  const iz = Math.round((vp.z + cy) / hm.cellSize);
  const y = hm.data[iz * hm.width + ix];
  return (
    <group position={[vp.x, y, vp.z]}>
      <mesh position={[0, vp.height / 2, 0]}>
        <cylinderGeometry args={[0.4, 0.4, vp.height, 12]} />
        <meshStandardMaterial color="#22d3c5" emissive="#22d3c5" emissiveIntensity={0.5} />
      </mesh>
      <mesh position={[0, vp.height + 1, 0]}>
        <sphereGeometry args={[1.2, 16, 16]} />
        <meshStandardMaterial color="#22d3c5" emissive="#22d3c5" emissiveIntensity={0.6} />
      </mesh>
    </group>
  );
}
