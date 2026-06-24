/**
 * sunExposure.ts — Phân tích số giờ nắng trực tiếp mỗi điểm trên terrain trong 1 ngày
 * (ngày đại diện của tháng đang chọn), có tính bóng đổ địa hình (terrain self-shadow).
 *
 * Thuật toán: với mỗi giờ ban ngày được sample, tính vector mặt trời (computeSunPosition),
 * rồi ray-march từ mỗi cell theo hướng NGƯỢC với tia nắng (từ điểm hướng ra xa, lên cao
 * theo độ dốc tia nắng) — nếu gặp địa hình nào cao hơn độ cao tia nắng tại khoảng cách đó
 * → cell bị che (không có nắng trực tiếp giờ đó).
 *
 * Phân loại theo % NGÀY ban đó (không dùng giờ tuyệt đối) vì độ dài ngày thay đổi theo
 * tháng/vĩ độ — 1 cell có nắng 6h trong ngày 11h (mùa đông) "nắng nhiều" hơn cell có nắng
 * 6h trong ngày 13h (mùa hè).
 */

import type { Heightmap } from '../types';
import { computeSunPosition } from './sun';

export interface SunExposureData {
  /** Số giờ nắng trực tiếp ước tính mỗi cell (0..maxPossibleHours) */
  hours: Float32Array;
  /** 0 = không nắng (<30% ngày), 1 = vừa (30-70%), 2 = nhiều (>=70%) */
  classes: Uint8Array;
  /** Các giờ đã sample trong ngày (vd [6,8,10,12,14,16,18]) */
  sampledHours: number[];
  /** Tổng số giờ ban ngày ước tính (độ dài ngày) của tháng đang chọn */
  maxPossibleHours: number;
  /** % diện tích theo lớp (trong vùng mask hợp lệ) */
  classArea: { low: number; medium: number; high: number };
  /** Giờ nắng trung bình toàn khu đất */
  meanHours: number;
}

const SAMPLE_INTERVAL_H = 2; // sample mỗi 2h trong ngày — đủ chính xác, giữ chi phí thấp

export function computeSunExposure(
  hm: Heightmap,
  latitudeDeg: number,
  month: number,
  northRotationDeg: number,
): SunExposureData {
  const { width, height, cellSize, data, mask } = hm;
  const n = width * height;
  const hours = new Float32Array(n);
  const classes = new Uint8Array(n);

  // ── 1. Tìm các giờ ban ngày (altitude > 0), sample mỗi SAMPLE_INTERVAL_H ──
  const daylightSamples: { hour: number; vx: number; vy: number; vz: number }[] = [];
  for (let h = 0; h <= 23; h += SAMPLE_INTERVAL_H) {
    const sun = computeSunPosition(month, h, latitudeDeg, 105, northRotationDeg);
    if (sun.altitude > 0.02) {
      daylightSamples.push({ hour: h, vx: sun.vector[0], vy: sun.vector[1], vz: sun.vector[2] });
    }
  }
  const maxPossibleHours = daylightSamples.length * SAMPLE_INTERVAL_H;
  if (daylightSamples.length === 0 || maxPossibleHours === 0) {
    return {
      hours, classes, sampledHours: [], maxPossibleHours: 0,
      classArea: { low: 100, medium: 0, high: 0 }, meanHours: 0,
    };
  }

  // ── 2. Cấu hình ray-march (cap chi phí tính) ──
  const cx = (width * cellSize) / 2;
  const cy = (height * cellSize) / 2;
  const diag = Math.sqrt((width * cellSize) ** 2 + (height * cellSize) ** 2);
  const maxDist = Math.min(diag * 0.5, 800);
  const STEPS = 30;
  const marchStep = maxDist / STEPS;

  let validCount = 0;
  let sumHours = 0;
  const lowThresh = maxPossibleHours * 0.3;
  const highThresh = maxPossibleHours * 0.7;

  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const idx = row * width + col;
      if (mask && !mask[idx]) continue;
      const z0 = data[idx];
      if (!Number.isFinite(z0)) continue;

      const wx = col * cellSize - cx;
      const wz = -(row * cellSize - cy);

      let sunSamples = 0;
      for (const { vx, vy, vz } of daylightSamples) {
        const horiz = Math.sqrt(vx * vx + vz * vz);
        if (horiz < 1e-6) { sunSamples++; continue; } // mặt trời gần như đỉnh đầu — luôn sáng
        const dirX = vx / horiz, dirZ = vz / horiz;
        const riseRatio = vy / horiz; // độ tăng cao của tia nắng theo khoảng cách ngang

        let shadowed = false;
        for (let d = marchStep; d <= maxDist; d += marchStep) {
          const sx = wx + dirX * d;
          const sz = wz + dirZ * d;
          const sc = Math.round((sx + cx) / cellSize);
          const sr = Math.round((cy - sz) / cellSize);
          if (sc < 0 || sc >= width || sr < 0 || sr >= height) break; // ra khỏi vùng — không gì cản
          const sZ = data[sr * width + sc];
          if (!Number.isFinite(sZ)) continue;
          const rayHeightAtD = z0 + d * riseRatio;
          if (sZ > rayHeightAtD + 0.5) { shadowed = true; break; }
        }
        if (!shadowed) sunSamples++;
      }

      const estHours = sunSamples * SAMPLE_INTERVAL_H;
      hours[idx] = estHours;
      classes[idx] = estHours >= highThresh ? 2 : estHours >= lowThresh ? 1 : 0;

      validCount++;
      sumHours += estHours;
    }
  }

  let low = 0, medium = 0, high = 0;
  for (let i = 0; i < n; i++) {
    if (mask && !mask[i]) continue;
    if (!Number.isFinite(data[i])) continue;
    if (classes[i] === 0) low++;
    else if (classes[i] === 1) medium++;
    else high++;
  }
  const total = Math.max(1, validCount);

  return {
    hours, classes,
    sampledHours: daylightSamples.map((s) => s.hour),
    maxPossibleHours,
    classArea: {
      low: (low / total) * 100,
      medium: (medium / total) * 100,
      high: (high / total) * 100,
    },
    meanHours: validCount > 0 ? sumHours / validCount : 0,
  };
}
