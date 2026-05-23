/**
 * MCALayer.tsx — Render kết quả Quỹ đất XD V2 (GIS-MCA).
 *
 * Mỗi cell trong Grid 20×20m hiển thị 1 plane mỏng màu theo lớp Y:
 *  - Y=0 (Không thuận lợi): đỏ #7f1d1d
 *  - Y=1 (Ít thuận lợi):    cam #fb923c
 *  - Y=2 (Thuận lợi):       xanh #15803d
 *
 * Drape lên mặt terrain (dùng meanZ của ô). Hover hiển thị 9 điểm X1-X9 + Y + vetoReason.
 * Chỉ render khi mode === 'mca'.
 */
import { useMemo, useState } from 'react';
import * as THREE from 'three';
import { Html } from '@react-three/drei';
import { useSiteStore } from '../../store/useSiteStore';
import { MCA_CLASSES, MCA_CRITERIA_LABELS } from '../../lib/analysis/mca';
import type { MCACell } from '../../lib/types';

/** Convert DXF (x,y) → Three.js world (x, z negated), centered ở terrain bounds */
function dxfToWorld(
  dx: number, dy: number,
  bounds: { minX: number; maxX: number; minY: number; maxY: number },
): { x: number; z: number } {
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cy = (bounds.minY + bounds.maxY) / 2;
  return { x: dx - cx, z: -(dy - cy) };
}

export function MCALayer() {
  const mode    = useSiteStore((s) => s.mode);
  const terrain = useSiteStore((s) => s.terrain);
  const mca     = useSiteStore((s) => s.mca);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  // Build geometry per cell — InstancedMesh không tiện vì color khác nhau theo Y
  // → dùng 3 group (1 cho mỗi Y class), mỗi group là InstancedMesh
  const instancedGroups = useMemo(() => {
    if (!mca || !terrain) return null;
    const GRID = mca.gridSize;
    const groups: { color: string; matrices: THREE.Matrix4[]; cellIdx: number[] }[] = [
      { color: MCA_CLASSES[0].color, matrices: [], cellIdx: [] },
      { color: MCA_CLASSES[1].color, matrices: [], cellIdx: [] },
      { color: MCA_CLASSES[2].color, matrices: [], cellIdx: [] },
    ];
    for (const cell of mca.cells) {
      const w = dxfToWorld(cell.centerX, cell.centerY, terrain.bounds);
      const m = new THREE.Matrix4();
      // Plane mặc định nằm phẳng XY (drei plane); ta cần XZ → rotateX(-π/2)
      // Position: drape lên mặt terrain bằng cell.meanZ + offset nhỏ
      const yWorld = cell.meanZ + 0.5;
      m.compose(
        new THREE.Vector3(w.x, yWorld, w.z),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0)),
        new THREE.Vector3(GRID * 0.97, GRID * 0.97, 1), // 0.97 = chừa khe nhỏ giữa ô
      );
      groups[cell.classY].matrices.push(m);
      groups[cell.classY].cellIdx.push(cell.i);
    }
    return groups;
  }, [mca, terrain]);

  // Tìm cell hover
  const hoveredCell = useMemo<MCACell | null>(() => {
    if (hoveredIdx === null || !mca) return null;
    return mca.cells.find(c => c.i === hoveredIdx) ?? null;
  }, [hoveredIdx, mca]);

  const hoveredWorld = useMemo(() => {
    if (!hoveredCell || !terrain) return null;
    const w = dxfToWorld(hoveredCell.centerX, hoveredCell.centerY, terrain.bounds);
    return new THREE.Vector3(w.x, hoveredCell.meanZ + 5, w.z);
  }, [hoveredCell, terrain]);

  if (mode !== 'mca' || !mca || !instancedGroups || !terrain) return null;

  return (
    <group>
      {instancedGroups.map((grp, gi) => {
        if (grp.matrices.length === 0) return null;
        return (
          <InstancedCells
            key={gi}
            matrices={grp.matrices}
            color={grp.color}
            cellIndices={grp.cellIdx}
            isHovered={(idx) => idx === hoveredIdx}
            onHover={(idx) => setHoveredIdx(idx)}
            onUnhover={() => setHoveredIdx(null)}
          />
        );
      })}

      {/* Tooltip cho cell đang hover */}
      {hoveredCell && hoveredWorld && (
        <Html position={hoveredWorld} center distanceFactor={40}>
          <div
            style={{
              background: 'rgba(15, 23, 42, 0.96)',
              border: `1px solid ${MCA_CLASSES[hoveredCell.classY].color}aa`,
              padding: '10px 12px',
              borderRadius: 6,
              color: '#e2e8f0',
              fontSize: 11,
              fontFamily: 'system-ui, sans-serif',
              minWidth: 220,
              pointerEvents: 'none',
              boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
            }}
          >
            <div style={{
              fontWeight: 700, fontSize: 12, marginBottom: 6,
              color: MCA_CLASSES[hoveredCell.classY].color,
            }}>
              Y={hoveredCell.classY} · {MCA_CLASSES[hoveredCell.classY].label}
              <span style={{ float: 'right', color: '#94a3b8', fontWeight: 400 }}>
                {hoveredCell.score.toFixed(0)}/100
              </span>
            </div>
            <div style={{
              display: 'grid', gridTemplateColumns: '1fr auto',
              rowGap: 2, columnGap: 8, fontSize: 10,
            }}>
              {MCA_CRITERIA_LABELS.map(({ key, label }) => {
                const v = hoveredCell[key];
                const color = v >= 7 ? '#86efac' : v >= 4 ? '#fcd34d' : '#fca5a5';
                return (
                  <>
                    <div key={`${key}-l`} style={{ color: '#94a3b8' }}>
                      <b style={{ color: '#e2e8f0' }}>{key.toUpperCase()}</b> {label}
                    </div>
                    <div key={`${key}-v`} style={{ color, fontWeight: 600, textAlign: 'right' }}>
                      {v.toFixed(0)}/10
                    </div>
                  </>
                );
              })}
            </div>
            {hoveredCell.vetoReason && (
              <div style={{
                marginTop: 6, paddingTop: 6, borderTop: '1px solid rgba(255,255,255,0.1)',
                color: '#fca5a5', fontSize: 10,
              }}>
                ⚠ {hoveredCell.vetoReason}
              </div>
            )}
            <div style={{
              marginTop: 6, fontSize: 9, color: '#64748b', fontFamily: 'monospace',
            }}>
              Z={hoveredCell.meanZ.toFixed(1)}m · Ô {mca.gridSize}×{mca.gridSize}m
            </div>
          </div>
        </Html>
      )}
    </group>
  );
}

// ── InstancedMesh helper ─────────────────────────────────────────────────────

interface InstancedCellsProps {
  matrices: THREE.Matrix4[];
  color: string;
  cellIndices: number[];
  isHovered: (idx: number) => boolean;
  onHover: (idx: number) => void;
  onUnhover: () => void;
}

function InstancedCells({ matrices, color, cellIndices, onHover, onUnhover }: InstancedCellsProps) {
  return (
    <instancedMesh
      ref={(m) => { if (m) updateInstances(m, matrices); }}
      args={[undefined, undefined, matrices.length]}
      onPointerMove={(e) => {
        e.stopPropagation();
        const inst = e.instanceId;
        if (typeof inst === 'number' && inst < cellIndices.length) {
          onHover(cellIndices[inst]);
        }
      }}
      onPointerOut={() => onUnhover()}
    >
      <planeGeometry args={[1, 1]} />
      <meshStandardMaterial
        color={color}
        transparent
        opacity={0.7}
        side={THREE.DoubleSide}
        roughness={0.85}
        metalness={0}
      />
    </instancedMesh>
  );
}

function updateInstances(mesh: THREE.InstancedMesh, matrices: THREE.Matrix4[]) {
  for (let i = 0; i < matrices.length; i++) {
    mesh.setMatrixAt(i, matrices[i]);
  }
  mesh.instanceMatrix.needsUpdate = true;
}
