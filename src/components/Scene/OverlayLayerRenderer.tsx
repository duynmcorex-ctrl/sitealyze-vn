import { Line } from '@react-three/drei';
import type { OverlayLayer } from '../../lib/types';
import { useSiteStore } from '../../store/useSiteStore';

export function OverlayLayerRenderer() {
  const overlayLayers = useSiteStore((s) => s.overlayLayers);
  return (
    <>
      {overlayLayers.filter((l) => l.visible).map((layer) => (
        <OverlayLines key={layer.id} layer={layer} />
      ))}
    </>
  );
}

/**
 * Dùng drei <Line> (Line2/LineMaterial) thay vì THREE.LineSegments + LineBasicMaterial.
 * LineBasicMaterial.linewidth bị driver WebGL bỏ qua trên hầu hết platform (luôn render
 * 1px bất kể giá trị set) — đây là giới hạn của OpenGL/ANGLE, không phải bug code. Line2
 * dùng shader riêng nên lineWidth có tác dụng thật, cross-platform.
 */
function OverlayLines({ layer }: { layer: OverlayLayer }) {
  const width = layer.lineWidth ?? 2;
  const ox = layer.offsetX ?? 0;
  const oz = layer.offsetZ ?? 0;
  return (
    <group position={[ox, 0, oz]}>
      {layer.polylines.map((poly, i) => {
        if (poly.length < 2) return null;
        const points = poly.map((p) => [p.x, p.y, p.z] as [number, number, number]);
        return (
          <Line
            key={i}
            points={points}
            color={layer.color}
            lineWidth={width}
          />
        );
      })}
    </group>
  );
}
