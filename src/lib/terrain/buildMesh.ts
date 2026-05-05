import type { Heightmap } from '../types';

export interface MeshBuffers {
  positions: Float32Array;
  indices: Uint32Array;
  normals: Float32Array;
}

// Build BufferGeometry data từ heightmap đều - mỗi cell 2 tam giác.
// Flip Z để DXF North (maxY) → Three.js -Z (nhất quán hướng Bắc).
// Dùng mask để bỏ các quad hoàn toàn nằm ngoài vùng địa hình thực sự.
export function buildMeshFromHeightmap(hm: Heightmap, centerXY = true): MeshBuffers {
  const { width, height, cellSize, data, origin, mask } = hm;
  const cx = centerXY ? (width * cellSize) / 2 : 0;
  const cy = centerXY ? (height * cellSize) / 2 : 0;

  const vertCount = width * height;
  const positions = new Float32Array(vertCount * 3);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const zVal = data[i];
      // Map sang Three.js: X horizontal, Y up, Z = -(DXF-Y) để bắc hướng -Z
      positions[i * 3]     = (centerXY ? x * cellSize - cx  : origin.x + x * cellSize);
      positions[i * 3 + 1] = zVal;
      positions[i * 3 + 2] = (centerXY ? -(y * cellSize - cy) : -(origin.y + y * cellSize));
    }
  }

  // Chỉ tạo quad nơi ít nhất 1 trong 4 đỉnh đã được rasterize thực sự
  const maxTri = (width - 1) * (height - 1) * 2;
  const indices = new Uint32Array(maxTri * 3);
  let p = 0;
  for (let y = 0; y < height - 1; y++) {
    for (let x = 0; x < width - 1; x++) {
      const a = y * width + x;
      const b = a + 1;
      const c = a + width;
      const d = c + 1;
      // Bỏ quad nếu cả 4 đỉnh đều là vùng lấp rỗng (nền ngoài terrain)
      if (mask && !mask[a] && !mask[b] && !mask[c] && !mask[d]) continue;
      indices[p++] = a; indices[p++] = c; indices[p++] = b;
      indices[p++] = b; indices[p++] = c; indices[p++] = d;
    }
  }

  const usedIndices = indices.slice(0, p);
  const normals = computeNormals(positions, usedIndices);
  return { positions, indices: usedIndices, normals };
}

function computeNormals(positions: Float32Array, indices: Uint32Array): Float32Array {
  const normals = new Float32Array(positions.length);
  for (let i = 0; i < indices.length; i += 3) {
    const ia = indices[i] * 3;
    const ib = indices[i + 1] * 3;
    const ic = indices[i + 2] * 3;
    const ax = positions[ia], ay = positions[ia + 1], az = positions[ia + 2];
    const bx = positions[ib], by = positions[ib + 1], bz = positions[ib + 2];
    const cx = positions[ic], cy = positions[ic + 1], cz = positions[ic + 2];
    const ux = bx - ax, uy = by - ay, uz = bz - az;
    const vx = cx - ax, vy = cy - ay, vz = cz - az;
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    normals[ia] += nx; normals[ia + 1] += ny; normals[ia + 2] += nz;
    normals[ib] += nx; normals[ib + 1] += ny; normals[ib + 2] += nz;
    normals[ic] += nx; normals[ic + 1] += ny; normals[ic + 2] += nz;
  }
  for (let i = 0; i < normals.length; i += 3) {
    const x = normals[i], y = normals[i + 1], z = normals[i + 2];
    const len = Math.hypot(x, y, z) || 1;
    normals[i] = x / len;
    normals[i + 1] = y / len;
    normals[i + 2] = z / len;
  }
  return normals;
}
