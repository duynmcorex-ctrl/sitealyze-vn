import { useState, useMemo } from 'react';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { useSiteStore } from '../../store/useSiteStore';
import { traceRidgePolylines } from '../../lib/analysis/features';

// ── Google-Maps style pin ─────────────────────────────────────────────────────
function PeakPin({
  x, y, z,
  elevation,
  showLabel,
  showAllLabels,
  rank,          // 1 = cao nhất, 2, 3... để đánh số
  onClick,
}: {
  x: number; y: number; z: number;
  elevation: number;
  showLabel: boolean;
  showAllLabels: boolean;
  rank: number;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const active = showLabel || showAllLabels;

  // Màu pin: đỉnh cao nhất = vàng, còn lại đỏ, khi hover/active → sáng hơn
  const pinColor  = rank === 1 ? '#f59e0b' : '#ef4444';
  const pinActive = active  ? (rank === 1 ? '#fde68a' : '#fca5a5') : pinColor;
  const pinFinal  = hovered ? pinActive : (active ? pinActive : pinColor);

  return (
    // Đặt Html ở vị trí đỉnh + lên một chút để pin point chạm đúng đỉnh
    <Html
      position={[x, y, z]}
      center
      distanceFactor={180}
      zIndexRange={[50, 0]}
      style={{ pointerEvents: 'none' }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          pointerEvents: 'auto',
          userSelect: 'none',
          cursor: 'pointer',
          transform: 'translateY(-50%)',   // dịch lên để điểm mũi kim nằm đúng vị trí đỉnh
        }}
        onClick={(e) => { e.stopPropagation(); onClick(); }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {/* ── Label cao độ (hiện khi active) ── */}
        {active && (
          <div style={{
            background: 'rgba(8, 10, 20, 0.92)',
            border: `1.5px solid ${pinFinal}`,
            borderRadius: 7,
            padding: '5px 12px',
            marginBottom: 6,
            color: pinFinal,
            fontSize: 18,
            fontWeight: 800,
            fontFamily: '"Courier New", monospace',
            whiteSpace: 'nowrap',
            letterSpacing: '0.03em',
            boxShadow: `0 2px 10px rgba(0,0,0,0.6), 0 0 8px ${pinFinal}44`,
            lineHeight: 1.3,
            textAlign: 'center',
          }}>
            {elevation.toFixed(1)} m
          </div>
        )}

        {/* ── Pin SVG (Google Maps style teardrop) ── */}
        <svg
          viewBox="0 0 32 44"
          width={active ? 36 : hovered ? 34 : 30}
          height={active ? 50 : hovered ? 47 : 41}
          style={{
            filter: `drop-shadow(0 3px 5px rgba(0,0,0,0.55))`,
            transition: 'width 0.15s, height 0.15s',
          }}
        >
          {/* Thân pin (teardrop) */}
          <path
            d="M16 1C8.27 1 2 7.27 2 15c0 5.5 3.2 10.3 7.8 14.2L16 43l6.2-13.8C26.8 25.3 30 20.5 30 15 30 7.27 23.73 1 16 1z"
            fill={pinFinal}
            stroke="white"
            strokeWidth="1.5"
          />
          {/* Vòng trắng bên trong */}
          <circle cx="16" cy="14" r="6.5" fill="white" opacity="0.95" />
          {/* Số thứ tự đỉnh */}
          <text
            x="16" y="18"
            textAnchor="middle"
            fontSize="8"
            fontWeight="900"
            fontFamily="Arial, sans-serif"
            fill={pinFinal}
          >
            {rank}
          </text>
        </svg>
      </div>
    </Html>
  );
}

// ── Marker đáy thung lũng (nhỏ, không click) ─────────────────────────────────
function PitMarker({ x, y, z, scale }: { x: number; y: number; z: number; scale: number }) {
  return (
    <mesh position={[x, y - scale * 0.4, z]} rotation={[Math.PI, 0, 0]}>
      <coneGeometry args={[scale * 0.45, scale * 1.0, 6]} />
      <meshStandardMaterial color="#3b82f6" emissive="#3b82f6" emissiveIntensity={0.4} />
    </mesh>
  );
}

// ── Đường sống núi từ ridge mask ─────────────────────────────────────────────
function RidgeLines({ polylines }: { polylines: { x: number; y: number; z: number }[][] }) {
  const segments = useMemo(() => {
    const geoms: THREE.BufferGeometry[] = [];
    for (const pl of polylines) {
      if (pl.length < 2) continue;
      const pts = pl.map((p) => new THREE.Vector3(p.x, p.y + 0.5, p.z));
      const geom = new THREE.BufferGeometry().setFromPoints(pts);
      geoms.push(geom);
    }
    return geoms;
  }, [polylines]);

  return (
    <group>
      {segments.map((geom, i) => (
        <primitive key={i} object={new THREE.Line(geom, new THREE.LineBasicMaterial({ color: '#fb923c', opacity: 0.75, transparent: true }))} />
      ))}
    </group>
  );
}

// ── Component chính ───────────────────────────────────────────────────────────
export function FeatureMarkers() {
  const analysis      = useSiteStore((s) => s.analysis);
  const terrain       = useSiteStore((s) => s.terrain);
  const showAllPeaks  = useSiteStore((s) => s.showAllPeakElevations);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);

  if (!analysis.features) return null;

  const hm    = terrain?.heightmap;
  const scale = hm ? Math.max(hm.cellSize * 1.5, 5) : 6;

  // Sắp xếp peaks theo cao độ giảm dần để đánh rank
  const { peaks, pits, ridges } = analysis.features;
  const rankedPeaks = peaks
    .map((p, i) => ({ ...p, origIdx: i }))
    .sort((a, b) => b.y - a.y)
    .map((p, rank) => ({ ...p, rank: rank + 1 }))
    // Sắp lại theo origIdx để selectedIdx khớp
    .sort((a, b) => a.origIdx - b.origIdx);

  // Tracing ridge polylines — chỉ khi có heightmap
  const ridgePolylines = useMemo(
    () => hm ? traceRidgePolylines(ridges, hm) : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [hm, ridges],
  );

  return (
    <group>
      {/* Đường sống núi */}
      <RidgeLines polylines={ridgePolylines} />

      {rankedPeaks.map((p) => (
        <PeakPin
          key={`peak-${p.origIdx}`}
          x={p.x} y={p.y} z={p.z}
          elevation={p.y}
          showLabel={selectedIdx === p.origIdx}
          showAllLabels={showAllPeaks}
          rank={p.rank}
          onClick={() => setSelectedIdx(selectedIdx === p.origIdx ? null : p.origIdx)}
        />
      ))}

      {pits.map((p, i) => (
        <PitMarker key={`pit-${i}`} x={p.x} y={p.y} z={p.z} scale={scale} />
      ))}
    </group>
  );
}
