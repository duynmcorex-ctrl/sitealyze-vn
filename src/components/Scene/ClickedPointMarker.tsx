/**
 * ClickedPointMarker.tsx
 * Hiển thị marker + label cao độ tại điểm user vừa click trên TerrainMesh.
 * Cao độ là TUYỆT ĐỐI (lấy trực tiếp từ heightmap.data — không offset MSL).
 */
import { Html } from '@react-three/drei';
import { useSiteStore } from '../../store/useSiteStore';

export function ClickedPointMarker() {
  const clickedPoint = useSiteStore((s) => s.clickedPoint);
  const terrain      = useSiteStore((s) => s.terrain);
  const setClickedPoint = useSiteStore((s) => s.setClickedPoint);

  if (!clickedPoint || !terrain) return null;

  // y trong scene = giá trị Z tuyệt đối của heightmap
  const elevation = clickedPoint.y;

  return (
    <group position={[clickedPoint.x, clickedPoint.y, clickedPoint.z]}>
      {/* Cọc thẳng đứng marker — line nhỏ */}
      <mesh position={[0, 1, 0]}>
        <cylinderGeometry args={[0.15, 0.15, 2.5, 8]} />
        <meshBasicMaterial color="#fbbf24" />
      </mesh>
      {/* Quả cầu trên đầu */}
      <mesh position={[0, 2.5, 0]}>
        <sphereGeometry args={[0.6, 12, 12]} />
        <meshBasicMaterial color="#fbbf24" />
      </mesh>

      {/* HTML label */}
      <Html
        position={[0, 4, 0]}
        center
        distanceFactor={180}
        zIndexRange={[60, 0]}
        style={{ pointerEvents: 'auto' }}
      >
        <div
          onClick={(e) => { e.stopPropagation(); setClickedPoint(null); }}
          style={{
            background: 'rgba(10, 14, 26, 0.95)',
            border: '1.5px solid #fbbf24',
            borderRadius: 7,
            padding: '5px 10px',
            color: '#fbbf24',
            fontSize: 16,
            fontWeight: 800,
            fontFamily: '"Courier New", monospace',
            whiteSpace: 'nowrap',
            boxShadow: '0 2px 10px rgba(0,0,0,0.6)',
            cursor: 'pointer',
            userSelect: 'none',
          }}
          title="Click để bỏ chọn"
        >
          {elevation.toFixed(2)} m
        </div>
      </Html>
    </group>
  );
}
