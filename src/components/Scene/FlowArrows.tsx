import { useMemo, useEffect, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
// Three.js addons: thick lines (không bị giới hạn 1px của WebGL)
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { useSiteStore } from '../../store/useSiteStore';

export function FlowArrows() {
  const terrain  = useSiteStore((s) => s.terrain);
  const analysis = useSiteStore((s) => s.analysis);
  const { size } = useThree();               // viewport size cho LineMaterial
  const groupRef = useRef<THREE.Group>(null);

  // ── Build geometry (shaft + 2 cánh arrowhead) ────────────────────────────
  const segPositions = useMemo(() => {
    if (!terrain || !analysis.hydro) return null;
    const hm  = terrain.heightmap;
    const cx  = (hm.width  * hm.cellSize) / 2;
    const cy  = (hm.height * hm.cellSize) / 2;

    // Độ dài mũi tên = 4× cellSize, tối thiểu 8 m
    const len = Math.max(hm.cellSize * 4, 8);
    const headLen  = len * 0.38;    // chiều dài cánh
    const headAngle = 0.55;         // ~31°

    // LineSegmentsGeometry nhận mảng [x1,y1,z1, x2,y2,z2, ...]
    const pts: number[] = [];

    const addSeg = (
      x1: number, y1: number, z1: number,
      x2: number, y2: number, z2: number,
    ) => { pts.push(x1, y1, z1, x2, y2, z2); };

    for (const a of analysis.hydro.arrows) {
      // Lấy cao độ từ heightmap (đã sửa flip)
      const ix = Math.round((a.x + cx) / hm.cellSize);
      const iy = Math.round((cy - a.y) / hm.cellSize);
      const idxHm = Math.min(Math.max(iy, 0), hm.height - 1) * hm.width
                  + Math.min(Math.max(ix, 0), hm.width  - 1);
      const z0 = hm.data[idxHm] + 1.5;   // nổi cao hơn mặt terrain 1.5 m

      // Điểm đuôi → mũi
      const tx = a.x;
      const ty = a.y;
      const hx = a.x + Math.cos(a.angle) * len;
      const hy = a.y + Math.sin(a.angle) * len;

      // Shaft
      addSeg(tx, z0, ty, hx, z0, hy);

      // Arrowhead cánh trái
      const aL = a.angle + Math.PI - headAngle;
      addSeg(hx, z0, hy,
             hx + Math.cos(aL) * headLen, z0, hy + Math.sin(aL) * headLen);

      // Arrowhead cánh phải
      const aR = a.angle + Math.PI + headAngle;
      addSeg(hx, z0, hy,
             hx + Math.cos(aR) * headLen, z0, hy + Math.sin(aR) * headLen);
    }

    return pts;
  }, [terrain, analysis.hydro]);

  // ── Tạo / update LineSegments2 khi data thay đổi ──────────────────────────
  useEffect(() => {
    const group = groupRef.current;
    if (!group) return;

    // Dọn object cũ
    group.clear();
    if (!segPositions || segPositions.length === 0) return;

    const geo = new LineSegmentsGeometry();
    geo.setPositions(segPositions);

    const mat = new LineMaterial({
      color: 0x38bdf8,        // sky-400 — rõ nét trên nền xanh nhạt
      linewidth: 2.5,         // pixels (LineMaterial dùng pixels, không world units)
      resolution: new THREE.Vector2(size.width, size.height),
    });

    const lines = new LineSegments2(geo, mat);
    lines.computeLineDistances();
    group.add(lines);

    return () => {
      geo.dispose();
      mat.dispose();
    };
  }, [segPositions, size.width, size.height]);

  return <group ref={groupRef} />;
}
