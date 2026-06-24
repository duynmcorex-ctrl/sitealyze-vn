import { Html } from '@react-three/drei';
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
      {/* Label nổi rõ — xác định vị trí điểm view ngay trên terrain, không cần tự mò tìm */}
      <Html position={[0, vp.height + 3, 0]} center distanceFactor={180} zIndexRange={[40, 0]} style={{ pointerEvents: 'none' }}>
        <div style={{
          background: 'rgba(8,10,20,0.92)',
          border: '1.5px solid #22d3c5',
          borderRadius: 7,
          padding: '4px 10px',
          color: '#22d3c5',
          fontSize: 13,
          fontWeight: 800,
          fontFamily: '"Courier New", monospace',
          whiteSpace: 'nowrap',
          boxShadow: '0 2px 10px rgba(0,0,0,0.6), 0 0 8px #22d3c544',
          transform: 'translateY(-100%)',
        }}>
          📍 {y.toFixed(0)}m
        </div>
      </Html>
    </group>
  );
}
