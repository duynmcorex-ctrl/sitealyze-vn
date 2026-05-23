/**
 * WindParticlesV2.tsx — Mô phỏng gió phong cách Windy.com
 *
 * Khác biệt so với V1:
 *   • Velocity streak: mỗi hạt = 1 đường ngắn theo hướng gió (LineSegment)
 *     + 1 điểm sáng ở đầu (Points) → trông như các dòng chảy của Windy
 *   • Màu theo tốc độ: dùng Windy color palette (xanh nhạt → xanh lá → cam → tím)
 *     thay vì màu đơn sắc #7dd3fc của V1
 *   • Địa hình ảnh hưởng tốc độ: slope dot wind direction → speed multiplier
 *     (gió nhanh hơn ở sườn xuôi gió, chậm hơn ở sườn ngược gió)
 *   • Vòng đời hạt: fade in / fade out theo age → tái sinh ngẫu nhiên
 *   • AdditiveBlending: hạt chồng nhau tạo hiệu ứng phát sáng
 *
 * Kỹ thuật từ MD-wind-visualization-guide.md:
 *   - Windy color scale (Section 5) — 18 stops 0-104kt
 *   - Particle lifetime + respawn (Section 2.1)
 *   - Speed multiplier via terrain slope (custom enhancement)
 *   - Velocity streak = "fade trail" approximation (Section 9.5)
 */

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useSiteStore } from '../../store/useSiteStore';
import { sampleHeight } from '../../lib/analysis/wind';
import type { Heightmap } from '../../lib/types';

// ── Windy color palette (speed in kt → [R,G,B] 0-255) ─────────────────────────
const WINDY_STOPS: [number, [number, number, number]][] = [
  [0,   [98,  113, 183]],
  [1,   [57,   97, 159]],
  [3,   [74,  148, 169]],
  [5,   [77,  141, 123]],
  [7,   [83,  165,  83]],
  [9,   [53,  159,  53]],
  [11,  [167, 157,  81]],
  [13,  [159, 127,  58]],
  [15,  [161, 108,  92]],
  [17,  [129,  58,  78]],
  [19,  [175,  80, 136]],
  [21,  [117,  74, 147]],
  [24,  [109,  97, 163]],
  [27,  [68,  105, 141]],
  [36,  [125,  68, 165]],
  [46,  [231, 215, 215]],
  [77,  [205, 202, 112]],
  [104, [128, 128, 128]],
];

/** Chuyển tốc độ m/s → màu [r,g,b] trong [0..1] theo Windy palette */
function windyRGB(speedMs: number): [number, number, number] {
  const kt = speedMs * 1.94384;
  for (let i = 1; i < WINDY_STOPS.length; i++) {
    if (kt <= WINDY_STOPS[i][0]) {
      const t =
        (kt - WINDY_STOPS[i - 1][0]) /
        (WINDY_STOPS[i][0] - WINDY_STOPS[i - 1][0]);
      const [r0, g0, b0] = WINDY_STOPS[i - 1][1];
      const [r1, g1, b1] = WINDY_STOPS[i][1];
      return [
        (r0 + t * (r1 - r0)) / 255,
        (g0 + t * (g1 - g0)) / 255,
        (b0 + t * (b1 - b0)) / 255,
      ];
    }
  }
  return [128 / 255, 128 / 255, 128 / 255];
}

// ── Terrain slope → wind speed multiplier ─────────────────────────────────────
/**
 * Tính hệ số tốc độ gió dựa theo độ dốc địa hình tại điểm (wx, wz).
 * Gió xuôi dốc → nhanh hơn; ngược dốc → chậm hơn.
 * Return: 0.3..2.0 (1.0 = địa hình phẳng)
 */
function terrainMult(
  hm: Heightmap,
  wx: number, wz: number,
  windDx: number, windDz: number,
): number {
  const cx = (hm.width * hm.cellSize) / 2;
  const cy = (hm.height * hm.cellSize) / 2;
  const c = Math.round((wx + cx) / hm.cellSize);
  const r = Math.round((cy - wz) / hm.cellSize);
  if (c < 1 || c >= hm.width - 1 || r < 1 || r >= hm.height - 1) return 1;

  const hL = hm.data[r * hm.width + (c - 1)];
  const hR = hm.data[r * hm.width + (c + 1)];
  const hU = hm.data[(r - 1) * hm.width + c]; // row-1 → higher DXF Y → lower Three.js Z
  const hD = hm.data[(r + 1) * hm.width + c];
  if (!isFinite(hL + hR + hU + hD)) return 1;

  // Gradient trong Three.js world space
  const slopeX = (hR - hL) / (2 * hm.cellSize);
  const slopeZ = (hD - hU) / (2 * hm.cellSize);
  const wMag = Math.sqrt(windDx * windDx + windDz * windDz);
  if (wMag < 1e-6) return 1;

  // dot(wind, -slope) > 0 → wind flowing downhill → accelerate
  const dot = -(slopeX * windDx + slopeZ * windDz) / wMag;
  return Math.max(0.3, Math.min(2.0, 1.0 + dot * 0.8));
}

// ── Constants ─────────────────────────────────────────────────────────────────
const N = 4000;       // số hạt
const TRAIL_T = 0.55; // thời gian "đuôi" (giây) — streak dài ở gió nhanh, ngắn ở gió chậm
const H_OFF = 4;      // cao độ trên bề mặt địa hình (m)

// ── Simulation state shape ────────────────────────────────────────────────────
interface Sim {
  px: Float32Array; py: Float32Array; pz: Float32Array;
  age: Float32Array; maxAge: Float32Array;
  W: number; H: number;
  hm: Heightmap;
}

// ── Component ─────────────────────────────────────────────────────────────────
export function WindParticlesV2() {
  const terrain = useSiteStore((s) => s.terrain);
  const env     = useSiteStore((s) => s.env);

  const lineRef = useRef<THREE.LineSegments>(null);
  const dotRef  = useRef<THREE.Points>(null);
  const simRef  = useRef<Sim | null>(null);

  // ── Tạo geometry 1 lần khi terrain load ────────────────────────────────────
  const { lineGeo, dotGeo } = useMemo(() => {
    if (!terrain) return { lineGeo: null, dotGeo: null };

    const hm = terrain.heightmap;
    const W = hm.width * hm.cellSize;
    const H = hm.height * hm.cellSize;

    // Khởi tạo simulation state
    const px = new Float32Array(N);
    const py = new Float32Array(N);
    const pz = new Float32Array(N);
    const age = new Float32Array(N);
    const maxAge = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      px[i] = (Math.random() - 0.5) * W;
      pz[i] = (Math.random() - 0.5) * H;
      py[i] = sampleHeight(hm, px[i], pz[i]) + H_OFF;
      maxAge[i] = 1.5 + Math.random() * 3.0;  // 1.5–4.5s vòng đời
      age[i] = Math.random() * maxAge[i];      // trải đều, không bùng nổ cùng lúc
    }
    simRef.current = { px, py, pz, age, maxAge, W, H, hm };

    // LineSegments: N đoạn, mỗi đoạn 2 đỉnh [tail, head]
    const linePos = new Float32Array(N * 2 * 3);
    const lineCol = new Float32Array(N * 2 * 3); // premultiplied alpha via brightness
    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute('position', new THREE.BufferAttribute(linePos, 3));
    lineGeo.setAttribute('color',    new THREE.BufferAttribute(lineCol, 3));

    // Points: N đỉnh đầu hạt (sáng hơn streak)
    const dotPos = new Float32Array(N * 3);
    const dotCol = new Float32Array(N * 3);
    const dotGeo = new THREE.BufferGeometry();
    dotGeo.setAttribute('position', new THREE.BufferAttribute(dotPos, 3));
    dotGeo.setAttribute('color',    new THREE.BufferAttribute(dotCol, 3));

    return { lineGeo, dotGeo };
  }, [terrain]);

  // ── Cập nhật mỗi frame ──────────────────────────────────────────────────────
  useFrame((_, dt) => {
    if (!terrain || !simRef.current || !lineGeo || !dotGeo) return;

    const sim = simRef.current;
    const { px, py, pz, age, maxAge, W, H, hm } = sim;

    // Wind direction → unit vector (Three.js XZ)
    const rad = (env.windDirection + 180 - env.northRotation) * Math.PI / 180;
    const windDx = Math.sin(rad);
    const windDz = -Math.cos(rad);
    const baseSpeedMs = Math.max(0.2, env.windSpeed);

    const linePos = (lineGeo.attributes.position as THREE.BufferAttribute).array as Float32Array;
    const lineCol = (lineGeo.attributes.color    as THREE.BufferAttribute).array as Float32Array;
    const dotPos  = (dotGeo.attributes.position  as THREE.BufferAttribute).array as Float32Array;
    const dotCol  = (dotGeo.attributes.color     as THREE.BufferAttribute).array as Float32Array;

    const cappedDt = Math.min(dt, 0.05); // cap để tránh vọt khi tab không active

    for (let i = 0; i < N; i++) {
      // Tăng tuổi → respawn nếu quá già
      age[i] += cappedDt;
      if (age[i] > maxAge[i]) {
        px[i]    = (Math.random() - 0.5) * W;
        pz[i]    = (Math.random() - 0.5) * H;
        py[i]    = sampleHeight(hm, px[i], pz[i]) + H_OFF;
        age[i]   = 0;
        maxAge[i] = 1.5 + Math.random() * 3.0;
      }

      // Tốc độ cục bộ (địa hình ảnh hưởng)
      const mult       = terrainMult(hm, px[i], pz[i], windDx, windDz);
      const localSpeed = baseSpeedMs * mult;

      // Di chuyển
      px[i] += windDx * localSpeed * cappedDt;
      pz[i] += windDz * localSpeed * cappedDt;

      // Wrap khi ra ngoài biên
      if (px[i] >  W / 2) px[i] -= W;
      if (px[i] < -W / 2) px[i] += W;
      if (pz[i] >  H / 2) pz[i] -= H;
      if (pz[i] < -H / 2) pz[i] += H;

      // Bám địa hình (làm mượt)
      const targetY = sampleHeight(hm, px[i], pz[i]) + H_OFF;
      py[i] += (targetY - py[i]) * 0.12;

      // Fade alpha: sin(π·t)^0.5 → đỉnh ở giữa vòng đời, mờ ở đầu/cuối
      const t     = age[i] / maxAge[i];
      const alpha = Math.sqrt(Math.max(0, Math.sin(Math.PI * t)));

      // Màu theo tốc độ
      const [r, g, b] = windyRGB(localSpeed);

      // Tail position: lùi theo hướng gió × trail length
      const trailDist = localSpeed * TRAIL_T;
      const tx = px[i] - windDx * trailDist;
      const tz = pz[i] - windDz * trailDist;
      const ty = sampleHeight(hm, tx, tz) + H_OFF;

      // LineSegments buffer [tail, head] per particle
      // Premultiplied brightness: tail dim (×0.2), head bright (×0.85)
      const li = i * 6;
      linePos[li + 0] = tx;    linePos[li + 1] = ty;    linePos[li + 2] = tz;
      linePos[li + 3] = px[i]; linePos[li + 4] = py[i]; linePos[li + 5] = pz[i];
      const dimA  = 0.2 * alpha;
      const fullA = 0.85 * alpha;
      lineCol[li + 0] = r * dimA;  lineCol[li + 1] = g * dimA;  lineCol[li + 2] = b * dimA;
      lineCol[li + 3] = r * fullA; lineCol[li + 4] = g * fullA; lineCol[li + 5] = b * fullA;

      // Points (leading dot) — sáng nhất
      const di = i * 3;
      dotPos[di + 0] = px[i]; dotPos[di + 1] = py[i]; dotPos[di + 2] = pz[i];
      dotCol[di + 0] = r * alpha;
      dotCol[di + 1] = g * alpha;
      dotCol[di + 2] = b * alpha;
    }

    (lineGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (lineGeo.attributes.color    as THREE.BufferAttribute).needsUpdate = true;
    (dotGeo.attributes.position  as THREE.BufferAttribute).needsUpdate = true;
    (dotGeo.attributes.color     as THREE.BufferAttribute).needsUpdate = true;
  });

  if (!lineGeo || !dotGeo) return null;

  return (
    <group name="wind-v2">
      {/* Velocity streaks */}
      <lineSegments ref={lineRef} geometry={lineGeo}>
        <lineBasicMaterial
          vertexColors
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          transparent
        />
      </lineSegments>

      {/* Leading-edge dots — sáng hơn streak */}
      <points ref={dotRef} geometry={dotGeo}>
        <pointsMaterial
          vertexColors
          size={1.6}
          sizeAttenuation
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          transparent
        />
      </points>
    </group>
  );
}
