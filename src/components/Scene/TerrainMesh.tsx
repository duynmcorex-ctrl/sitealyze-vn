import { useMemo, useRef, useEffect } from 'react';
import * as THREE from 'three';
import { useSiteStore } from '../../store/useSiteStore';
import { getSlopeClasses } from '../../lib/analysis/slope';
import { SUITABILITY_CLASSES } from '../../lib/analysis/suitability';
import { ELEV_PALETTE_RGB, ELEV_PALETTE_SMALL_RGB, SMALL_RANGE_THRESHOLD_M, elevPaletteIndex } from '../../lib/analysis/elevationPalette';
import { ThreeEvent } from '@react-three/fiber';

/** Gradient topographic kiểu bản đồ địa hình (xanh→vàng→đỏ→nâu→trắng) */
function rainbowElevColor(t: number, c: THREE.Color): void {
  // t=0 (thấp nhất) → blue; t=1 (cao nhất) → purple/white
  // Dùng dải HSL: 0.67 (blue) → 0.33 (green) → 0.16 (yellow) → 0 (red) → -0.08 (maroon)
  // Đơn giản: setHSL với hue chạy từ 0.67 (blue) xuống 0 (red) rồi xuống 0.83 (purple)
  const hue = 0.67 - t * 0.67;   // blue → red
  const sat = 0.9 - t * 0.2;     // giảm nhẹ saturation ở cao
  const lit = 0.35 + t * 0.25;   // sáng dần lên cao
  c.setHSL(hue, sat, lit);
}

export function TerrainMesh() {
  const terrain = useSiteStore((s) => s.terrain);
  const mode = useSiteStore((s) => s.mode);
  const analysis = useSiteStore((s) => s.analysis);
  const slopeMode = useSiteStore((s) => s.slopeMode);
  const setViewpoint = useSiteStore((s) => s.setViewpoint);
  const terrainRenderMode = useSiteStore((s) => s.terrainRenderMode);
  const elevColorMode = useSiteStore((s) => s.elevColorMode);
  const setClickedPoint = useSiteStore((s) => s.setClickedPoint);
  const meshRef = useRef<THREE.Mesh>(null);

  const geometry = useMemo(() => {
    if (!terrain) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(terrain.meshPositions, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(terrain.meshNormals, 3));
    g.setIndex(new THREE.BufferAttribute(terrain.meshIndices, 1));
    g.computeBoundingBox();
    g.computeBoundingSphere();
    return g;
  }, [terrain]);

  // Vertex colors theo mode
  useEffect(() => {
    if (!terrain || !geometry) return;
    const hm = terrain.heightmap;
    const n = hm.width * hm.height;
    const colors = new Float32Array(n * 3);
    const c = new THREE.Color();

    const setColor = (i: number, hex: string | THREE.Color) => {
      if (typeof hex === 'string') c.set(hex); else c.copy(hex);
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    };

    // Terrain phẳng: chỉ coi là phẳng khi range < 0.1m (gần như 0)
    // Trước đây 0.5m làm files có chênh 1–5m thành màu xám đơn — sai
    const isFlat = Math.abs(hm.maxZ - hm.minZ) < 0.1;

    // Helper: tô màu mesh theo bảng màu cao độ — dùng cho cả mode 'elevation' và 'contour'
    const applyElevationPalette = () => {
      if (isFlat) {
        for (let i = 0; i < n; i++) setColor(i, '#94a3b8');
        return;
      }
      if (elevColorMode === 'rainbow') {
        const range = Math.max(1e-6, hm.maxZ - hm.minZ);
        for (let i = 0; i < n; i++) {
          const t = (hm.data[i] - hm.minZ) / range;
          rainbowElevColor(t, c);
          colors[i * 3]     = c.r;
          colors[i * 3 + 1] = c.g;
          colors[i * 3 + 2] = c.b;
        }
      } else {
        const range = hm.maxZ - hm.minZ;
        const palette = range < SMALL_RANGE_THRESHOLD_M ? ELEV_PALETTE_SMALL_RGB : ELEV_PALETTE_RGB;
        for (let i = 0; i < n; i++) {
          const idx = elevPaletteIndex(hm.data[i], hm.minZ, hm.maxZ);
          const [r, g, b] = palette[idx];
          colors[i * 3]     = r;
          colors[i * 3 + 1] = g;
          colors[i * 3 + 2] = b;
        }
      }
    };

    if (mode === 'elevation') {
      applyElevationPalette();
    } else if (mode === 'contour') {
      // Dùng cùng bảng màu cao độ (không còn nền tan đơn) → đường đồng mức nổi rõ trên gradient
      applyElevationPalette();
    } else if (mode === 'wind') {
      // Wind: gradient mịn để particle nổi bật
      for (let i = 0; i < n; i++) {
        const t = (hm.data[i] - hm.minZ) / Math.max(1e-6, hm.maxZ - hm.minZ);
        c.setHSL(0.6 - t * 0.55, 0.55, 0.28 + t * 0.22);
        colors[i * 3] = c.r;
        colors[i * 3 + 1] = c.g;
        colors[i * 3 + 2] = c.b;
      }
    } else if (mode === 'slope' && analysis.slope) {
      const sc = getSlopeClasses(slopeMode);
      for (let i = 0; i < n; i++) {
        setColor(i, sc[analysis.slope.classes[i]]?.color ?? '#888');
      }
    } else if (mode === 'suitability' && analysis.suitability) {
      for (let i = 0; i < n; i++) {
        setColor(i, SUITABILITY_CLASSES[analysis.suitability.classes[i]].color);
      }
    } else if (mode === 'hydrology' && analysis.hydro) {
      let maxLog = 0;
      for (let i = 0; i < n; i++) {
        const v = Math.log10(1 + analysis.hydro.flowAccum[i]);
        if (v > maxLog) maxLog = v;
      }
      for (let i = 0; i < n; i++) {
        const v = Math.log10(1 + analysis.hydro.flowAccum[i]) / Math.max(1, maxLog);
        c.setRGB(0.85 - v * 0.7, 0.92 - v * 0.4, 1.0);
        colors[i * 3] = c.r;
        colors[i * 3 + 1] = c.g;
        colors[i * 3 + 2] = c.b;
      }
    } else if (mode === 'features' && analysis.features) {
      for (let i = 0; i < n; i++) {
        if (analysis.features.ridges[i]) setColor(i, '#fb923c');
        else if (analysis.features.valleys[i]) setColor(i, '#3b82f6');
        else {
          const t = (hm.data[i] - hm.minZ) / Math.max(1e-6, hm.maxZ - hm.minZ);
          c.setHSL(0.1, 0.05, 0.3 + t * 0.3);
          colors[i * 3] = c.r;
          colors[i * 3 + 1] = c.g;
          colors[i * 3 + 2] = c.b;
        }
      }
    } else if (mode === 'sun') {
      for (let i = 0; i < n; i++) setColor(i, '#cbd5e1');
    } else if (mode === 'viewshed' && analysis.viewshed) {
      for (let i = 0; i < n; i++) {
        const t = (hm.data[i] - hm.minZ) / Math.max(1e-6, hm.maxZ - hm.minZ);
        if (analysis.viewshed[i]) {
          c.setRGB(0.4 + t * 0.4, 0.85, 0.5);
        } else {
          c.setHSL(0, 0, 0.18 + t * 0.15);
        }
        colors[i * 3] = c.r;
        colors[i * 3 + 1] = c.g;
        colors[i * 3 + 2] = c.b;
      }
    } else {
      for (let i = 0; i < n; i++) {
        const t = (hm.data[i] - hm.minZ) / Math.max(1e-6, hm.maxZ - hm.minZ);
        c.setHSL(0.6 - t * 0.55, 0.7, 0.4);
        colors[i * 3] = c.r;
        colors[i * 3 + 1] = c.g;
        colors[i * 3 + 2] = c.b;
      }
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    (geometry.attributes.color as THREE.BufferAttribute).needsUpdate = true;
  }, [mode, analysis, terrain, geometry, slopeMode, elevColorMode]);

  // Center camera on first load
  useEffect(() => {
    if (!terrain) return;
    const hm = terrain.heightmap;
    const sz = Math.max(hm.width, hm.height) * hm.cellSize;
    if (meshRef.current) {
      meshRef.current.position.set(0, 0, 0);
    }
    void sz;
  }, [terrain]);

  // Tự động xoá clickedPoint khi rời khỏi tab "Cao độ"
  useEffect(() => {
    if (mode !== 'elevation') setClickedPoint(null);
  }, [mode, setClickedPoint]);

  if (!terrain || !geometry) return null;

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    const p = e.point;
    if (mode === 'viewshed') {
      setViewpoint({ x: p.x, z: p.z, height: 1.7 });
    } else if (mode === 'elevation') {
      // Chỉ ở tab "Cao độ" mới đặt marker — tránh hiện điểm khi đang ở Đồng mức/Slope/...
      setClickedPoint({ x: p.x, y: p.y, z: p.z });
    }
  };

  // Wireframe mode: chỉ render nét lưới, không tô mặt — giống nét file DXF gốc
  if (terrainRenderMode === 'wireframe') {
    return (
      <mesh ref={meshRef} geometry={geometry} onClick={handleClick}>
        <meshBasicMaterial
          vertexColors
          wireframe
          side={THREE.DoubleSide}
          transparent
          opacity={0.85}
        />
      </mesh>
    );
  }

  return (
    <mesh ref={meshRef} geometry={geometry} castShadow receiveShadow onClick={handleClick}>
      <meshStandardMaterial
        vertexColors
        flatShading={false}
        side={THREE.DoubleSide}
        roughness={0.95}
        metalness={0.0}
      />
    </mesh>
  );
}
