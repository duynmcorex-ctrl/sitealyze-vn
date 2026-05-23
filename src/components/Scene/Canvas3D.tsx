import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { Suspense, useMemo } from 'react';
import { TerrainMesh } from './TerrainMesh';
import { TerrainMeshBg } from './TerrainMeshBg';
import { ContourLines } from './ContourLines';
import { FlowArrows } from './FlowArrows';
import { FeatureMarkers } from './FeatureMarkers';
import { LanduseLayer } from './LanduseLayer';
import { MCALayer } from './MCALayer';
import { SunLight } from './SunLight';
import { WindParticles } from './WindParticles';
import { WindParticlesV2 } from './WindParticlesV2';
import { ViewpointMarker } from './ViewpointMarker';
import { OverlayLayerRenderer } from './OverlayLayerRenderer';
import { RoadsRender } from './RoadsRender';
import { AutoFit } from './AutoFit';
import { CameraPreset } from './CameraPreset';
import { TreeInstances } from './TreeInstances';
import { FloodMesh } from './FloodMesh';
import { SceneCapturer } from './SceneCapturer';
import { SceneTweener } from './SceneTweener';
import { ClickedPointMarker } from './ClickedPointMarker';
import { useSiteStore } from '../../store/useSiteStore';

/**
 * AzimuthSync: component bên trong Canvas — dùng useFrame để đọc azimuth
 * từ camera và cập nhật store mỗi frame. Dùng cho Compass bên ngoài.
 */
function AzimuthSync() {
  const { camera } = useThree();
  const setCameraAzimuth = useSiteStore(s => s.setCameraAzimuth);
  useFrame(() => {
    // Camera ở vị trí (x, y, z), target mặc định là origin.
    // Azimuth = góc trên mặt phẳng XZ từ trục -Z: atan2(x, z)
    const azimuth = Math.atan2(camera.position.x, camera.position.z);
    setCameraAzimuth(azimuth);
  });
  return null;
}

/** Toggle V1/V2 wind particles bên trong Canvas (cần đọc store) */
function WindParticlesWrapper() {
  const vis = useSiteStore((s) => s.env.windVisualization);
  return vis === 'v2' ? <WindParticlesV2 /> : <WindParticles />;
}

export function Canvas3D() {
  const terrain         = useSiteStore((s) => s.terrain);
  const mode            = useSiteStore((s) => s.mode);
  const northRotation   = useSiteStore((s) => s.env.northRotation);
  const showTrees       = useSiteStore((s) => s.env.showTrees);
  const overlayLayers   = useSiteStore((s) => s.overlayLayers);
  const showContourOverlay = useSiteStore((s) => s.showContourOverlay);
  const showGrid        = useSiteStore((s) => s.showGrid);
  const projects        = useSiteStore((s) => s.projects);
  const activeProjectId = useSiteStore((s) => s.activeProjectId);
  const theme           = useSiteStore((s) => s.theme);

  // Background projects: visible, not active, có terrain
  const bgProjects = useMemo(() => {
    const active = projects.find(p => p.id === activeProjectId);
    return projects
      .filter(p => p.id !== activeProjectId && p.visible && p.terrain)
      .map(p => {
        // Tính offset VN2000: dE (easting) → Three.js +X, dN (northing) → Three.js -Z
        let ox = 0, oz = 0;
        if (active?.terrain && p.terrain) {
          const ax = (active.terrain.bounds.minX + active.terrain.bounds.maxX) / 2;
          const ay = (active.terrain.bounds.minY + active.terrain.bounds.maxY) / 2;
          const px = (p.terrain.bounds.minX + p.terrain.bounds.maxX) / 2;
          const py = (p.terrain.bounds.minY + p.terrain.bounds.maxY) / 2;
          ox = px - ax;
          oz = -(py - ay); // flip Y → Three.js -Z
        }
        return { id: p.id, terrain: p.terrain!, offset: [ox, 0, oz] as [number, number, number] };
      });
  }, [projects, activeProjectId]);

  // Gom tất cả tree points từ các layer tree đang visible
  const treesToRender = useMemo(
    () => overlayLayers
      .filter(l => l.isTree && l.visible && l.treePoints?.length)
      .flatMap(l => l.treePoints!),
    [overlayLayers],
  );

  const gridConfig = useMemo(() => {
    if (!terrain) return { size: 2000, divisions: 40, y: 0 };
    const hm = terrain.heightmap;
    const size = Math.max(hm.width * hm.cellSize, hm.height * hm.cellSize) * 1.6;
    const cell = Math.max(5, Math.round(size / 50));
    return { size, divisions: Math.round(size / cell), y: hm.minZ - 0.5 };
  }, [terrain]);

  return (
    <Canvas
      camera={{ position: [200, 200, 200], fov: 45, near: 0.1, far: 10000 }}
      shadows={mode === 'sun'}
      gl={{ antialias: true, preserveDrawingBuffer: true }}
      style={{
        background: theme === 'light'
          ? 'linear-gradient(180deg, #b8cce4 0%, #cdd9e8 100%)'
          : 'linear-gradient(180deg, #060912 0%, #0a0e1a 100%)',
      }}
    >
      <ambientLight intensity={mode === 'sun' ? 0.25 : theme === 'light' ? 0.9 : 0.6} />
      {mode !== 'sun' && <directionalLight position={[100, 200, 100]} intensity={theme === 'light' ? 1.1 : 0.8} />}
      <Suspense fallback={null}>
        {/* Background projects (non-active) */}
        {bgProjects.map(bg => (
          <group key={bg.id} rotation={[0, (-northRotation * Math.PI) / 180, 0]}>
            <TerrainMeshBg terrain={bg.terrain} position={bg.offset} />
          </group>
        ))}

        {terrain && (
          <group rotation={[0, (-northRotation * Math.PI) / 180, 0]}>
            <TerrainMesh />
            {/* Contour overlay: luôn hiển thị khi bật toggle, hoặc khi mode=contour */}
            {(mode === 'contour' || showContourOverlay) && <ContourLines />}
            {mode === 'hydrology' && <FlowArrows />}
            {mode === 'features' && <FeatureMarkers />}
            {/* LanduseLayer tự kiểm tra: render khi mode='landuse' HOẶC showMassing3D */}
            <LanduseLayer />
            {/* MCALayer tự kiểm tra: render khi mode='mca' */}
            <MCALayer />
            {mode === 'sun' && <SunLight />}
            {mode === 'wind' && <WindParticlesWrapper />}
            {mode === 'viewshed' && <ViewpointMarker />}
            <OverlayLayerRenderer />
            <RoadsRender />
            {/* Mô phỏng ngập lụt 3D — plane bán trong suốt tại mực nước */}
            <FloodMesh />
            {/* Marker cao độ tại điểm click */}
            <ClickedPointMarker />
            {/* Cây hiện trạng — instanced, chỉ hiện khi toggle bật */}
            {showTrees && treesToRender.length > 0 && (
              <TreeInstances trees={treesToRender} />
            )}
            {showGrid && (
              <gridHelper
                args={[gridConfig.size, gridConfig.divisions, '#1f2937', '#1f2937']}
                position={[0, gridConfig.y, 0]}
              />
            )}
          </group>
        )}
        {!terrain && showGrid && (
          <gridHelper args={[200, 20, '#1f2937', '#1f2937']} position={[0, -0.01, 0]} />
        )}
      </Suspense>
      <AzimuthSync />
      <AutoFit />
      <CameraPreset />
      <SceneCapturer />
      <SceneTweener />
      <OrbitControls makeDefault enableDamping dampingFactor={0.08} />
    </Canvas>
  );
}
