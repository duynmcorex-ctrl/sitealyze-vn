import { useState, useMemo } from 'react';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { useSiteStore } from '../../store/useSiteStore';
import { connectPeaksMST } from '../../lib/analysis/features';

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

// ── Đường sống núi: nối các đỉnh đã phát hiện bằng MST ──────────────────────
function RidgeLines({
  segments,
}: {
  segments: { a: { x: number; y: number; z: number }; b: { x: number; y: number; z: number } }[];
}) {
  const lineObjects = useMemo(() => {
    return segments.map(s => {
      const pts = [
        new THREE.Vector3(s.a.x, s.a.y + 1.5, s.a.z),
        new THREE.Vector3(s.b.x, s.b.y + 1.5, s.b.z),
      ];
      const geom = new THREE.BufferGeometry().setFromPoints(pts);
      const mat  = new THREE.LineBasicMaterial({
        color: '#fb923c',
        linewidth: 2,
        opacity: 0.9,
        transparent: true,
      });
      return new THREE.Line(geom, mat);
    });
  }, [segments]);

  return (
    <group>
      {lineObjects.map((obj, i) => (
        <primitive key={i} object={obj} />
      ))}
    </group>
  );
}

// ── Component chính ───────────────────────────────────────────────────────────
export function FeatureMarkers() {
  const analysis        = useSiteStore((s) => s.analysis);
  const terrain         = useSiteStore((s) => s.terrain);
  const showAllPeaks    = useSiteStore((s) => s.showAllPeakElevations);
  const showRidgeLines  = useSiteStore((s) => s.showRidgeLines);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);

  const hm    = terrain?.heightmap;
  const scale = hm ? Math.max(hm.cellSize * 1.5, 5) : 6;

  // Sắp xếp peaks theo cao độ giảm dần để đánh rank
  const peaks = analysis.features?.peaks ?? [];
  const pits  = analysis.features?.pits  ?? [];

  const rankedPeaks = peaks
    .map((p, i) => ({ ...p, origIdx: i }))
    .sort((a, b) => b.y - a.y)
    .map((p, rank) => ({ ...p, rank: rank + 1 }))
    .sort((a, b) => a.origIdx - b.origIdx);

  // Đường sống núi: nối các đỉnh bằng MST + check terrain continuity
  // - maxLinkDistance: giới hạn khoảng cách 2D (tránh nối quá xa)
  // - hm: cho phép sample heightmap dọc line → reject nếu cắt qua thung lũng
  const ridgeSegments = useMemo(() => {
    if (!hm || peaks.length < 2) return [];
    const sceneSize = Math.max(hm.width, hm.height) * hm.cellSize;
    return connectPeaksMST(peaks, sceneSize * 0.35, hm);
  }, [hm, peaks]);

  if (!analysis.features) return null;

  return (
    <group>
      {/* Đường sống núi nối các đỉnh */}
      {showRidgeLines && <RidgeLines segments={ridgeSegments} />}

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
