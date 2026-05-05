import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useSiteStore } from '../../store/useSiteStore';
import { sampleHeight } from '../../lib/analysis/wind';

const PARTICLE_COUNT = 1500;

export function WindParticles() {
  const terrain = useSiteStore((s) => s.terrain);
  const env = useSiteStore((s) => s.env);
  const ref = useRef<THREE.Points>(null);

  const { positions, velocities, geometry } = useMemo(() => {
    if (!terrain) return { positions: null, velocities: null, geometry: null };
    const hm = terrain.heightmap;
    const w = hm.width * hm.cellSize;
    const h = hm.height * hm.cellSize;
    const positions = new Float32Array(PARTICLE_COUNT * 3);
    const velocities = new Float32Array(PARTICLE_COUNT * 3);
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      positions[i * 3] = (Math.random() - 0.5) * w;
      positions[i * 3 + 1] = hm.maxZ + 5 + Math.random() * 10;
      positions[i * 3 + 2] = (Math.random() - 0.5) * h;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    return { positions, velocities, geometry };
  }, [terrain]);

  useFrame((_, delta) => {
    if (!terrain || !positions || !velocities || !geometry) return;
    const hm = terrain.heightmap;
    const w = hm.width * hm.cellSize;
    const h = hm.height * hm.cellSize;
    // northRotation áp dụng ở group cha; giữ wind ở local space
    const rad = (env.windDirection + 180) * Math.PI / 180;
    const baseSpeed = env.windSpeed * 30;
    const dx = Math.sin(rad) * baseSpeed;
    const dz = -Math.cos(rad) * baseSpeed;

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const idx = i * 3;
      // Sample terrain height và đẩy hạt lên trên địa hình
      const tz = sampleHeight(hm, positions[idx], positions[idx + 2]);
      const targetY = tz + 4;
      positions[idx] += dx * delta;
      positions[idx + 2] += dz * delta;
      positions[idx + 1] += (targetY - positions[idx + 1]) * 0.1;

      // Wrap when out of bounds
      if (positions[idx] > w / 2) positions[idx] = -w / 2;
      if (positions[idx] < -w / 2) positions[idx] = w / 2;
      if (positions[idx + 2] > h / 2) positions[idx + 2] = -h / 2;
      if (positions[idx + 2] < -h / 2) positions[idx + 2] = h / 2;
    }
    (geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  });

  if (!geometry) return null;
  return (
    <points ref={ref} geometry={geometry}>
      <pointsMaterial color="#7dd3fc" size={1.4} sizeAttenuation transparent opacity={0.85} />
    </points>
  );
}
