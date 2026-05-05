import Delaunator from 'delaunator';
import type { ContourPolyline } from '../types';

export interface TIN {
  vertices: Float64Array; // [x,y,z, x,y,z, ...]
  triangles: Uint32Array;
}

// Lấy mẫu thưa các polyline để giảm số đỉnh khi quá dày
function densifyContour(line: ContourPolyline, minSpacing: number): { x: number; y: number; z: number }[] {
  const out: { x: number; y: number; z: number }[] = [];
  let lastX = NaN;
  let lastY = NaN;
  for (const p of line.points) {
    if (out.length === 0) {
      out.push({ x: p.x, y: p.y, z: line.elevation });
      lastX = p.x; lastY = p.y;
      continue;
    }
    const dx = p.x - lastX;
    const dy = p.y - lastY;
    if (Math.hypot(dx, dy) >= minSpacing) {
      out.push({ x: p.x, y: p.y, z: line.elevation });
      lastX = p.x; lastY = p.y;
    }
  }
  return out;
}

export function buildTIN(contours: ContourPolyline[], targetVertexCount = 80000): TIN {
  // Ước lượng minSpacing để không vượt quá targetVertexCount
  let totalPoints = 0;
  for (const c of contours) totalPoints += c.points.length;

  let minSpacing = 0;
  if (totalPoints > targetVertexCount) {
    // Tính bbox để dùng diện tích → spacing
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const c of contours) for (const p of c.points) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
    const diag = Math.hypot(maxX - minX, maxY - minY);
    minSpacing = diag / Math.sqrt(targetVertexCount * 4);
  }

  const points: { x: number; y: number; z: number }[] = [];
  for (const c of contours) {
    if (minSpacing > 0) {
      points.push(...densifyContour(c, minSpacing));
    } else {
      for (const p of c.points) points.push({ x: p.x, y: p.y, z: c.elevation });
    }
  }

  if (points.length < 3) {
    throw new Error('Không đủ điểm để tam giác hóa.');
  }

  const coords = new Float64Array(points.length * 2);
  for (let i = 0; i < points.length; i++) {
    coords[i * 2] = points[i].x;
    coords[i * 2 + 1] = points[i].y;
  }

  const del = new Delaunator(coords);
  const triangles = new Uint32Array(del.triangles);

  const vertices = new Float64Array(points.length * 3);
  for (let i = 0; i < points.length; i++) {
    vertices[i * 3] = points[i].x;
    vertices[i * 3 + 1] = points[i].y;
    vertices[i * 3 + 2] = points[i].z;
  }

  return { vertices, triangles };
}
