/**
 * detectBoundary.ts — Thu thập tất cả closed polyline trong DXF làm CANDIDATE
 * cho user chọn manual qua dropdown.
 *
 * KHÔNG auto-pick nữa (round trước chọn sai → terrain bị clip thành dải hẹp).
 * UI sẽ render dropdown: user thấy list candidate kèm area + layer name + flag
 * "có thể là boundary" → tự chọn.
 *
 * Closed detection robust theo 4 cách:
 *  1. ent.shape === true (LWPOLYLINE flag 70 bit 1)
 *  2. ent.closed === true (POLYLINE alt flag)
 *  3. Endpoints trùng (auto-close)
 *  4. Layer name match BOUNDARY_LAYER_RE (cho phép open polyline khi user
 *     đặt tên layer rõ là ranh giới)
 */
import { polygonArea, polygonBBox } from '../util/pointInPolygon';

/* eslint-disable @typescript-eslint/no-explicit-any */

const BOUNDARY_LAYER_RE = /^(ranh|ranh.?gioi|boundary|h.?limit|gioi.?han|du.?an|khu.?vuc|project.?boundary|site.?boundary|duong.?bao)$/i;

interface DxfEntity {
  type?: string;
  layer?: string;
  shape?: boolean;
  vertices?: { x: number; y: number; z?: number }[];
}

interface Point2D { x: number; y: number; }

export interface BoundaryCandidate {
  /** Polyline points (closed) — đã đảm bảo có ≥ 3 vertex */
  polygon: Point2D[];
  /** Layer name của entity gốc */
  layer: string;
  /** Diện tích (m²) — Shoelace */
  area: number;
  /** Aspect ratio max/min của bbox — > 4 nghĩa polyline mỏng dài */
  aspectRatio: number;
  /** % so với area của bbox tổng */
  pctOfBbox: number;
  /** Kiểu detect closed */
  closedKind: 'flag-shape' | 'flag-closed' | 'endpoints' | 'forced-open';
  /** True nếu likely boundary: match regex name HOẶC area > 40% bbox + aspect tốt */
  isLikelyBoundary: boolean;
}

/**
 * Thu thập tất cả closed polyline làm candidate boundary.
 * Sort: likely first (regex match → area desc), rồi tới area desc.
 */
export function collectBoundaryCandidates(
  entities: DxfEntity[],
  dxfBounds: { minX: number; minY: number; maxX: number; maxY: number },
): BoundaryCandidate[] {
  const bboxArea = (dxfBounds.maxX - dxfBounds.minX) * (dxfBounds.maxY - dxfBounds.minY);
  const candidates: BoundaryCandidate[] = [];
  let totalPolylines = 0;

  for (const ent of entities) {
    const type = (ent.type || '').toUpperCase();
    if (type !== 'LWPOLYLINE' && type !== 'POLYLINE') continue;
    totalPolylines++;
    const layer = ent.layer ?? '0';

    const verts = ent.vertices ?? [];
    if (verts.length < 3) continue;
    const polygon: Point2D[] = [];
    for (const v of verts) {
      if (typeof v.x === 'number' && typeof v.y === 'number') {
        polygon.push({ x: v.x, y: v.y });
      }
    }
    if (polygon.length < 3) continue;

    // Detect closed
    const flagShape = (ent as any).shape === true;
    const flagClosed = (ent as any).closed === true;
    const layerIsBoundary = BOUNDARY_LAYER_RE.test(layer);
    const first = polygon[0];
    const last = polygon[polygon.length - 1];
    const bb0 = polygonBBox(polygon);
    const diag0 = Math.hypot(bb0.maxX - bb0.minX, bb0.maxY - bb0.minY);
    const endpointsClose = Math.hypot(first.x - last.x, first.y - last.y) < diag0 * 0.02;

    let closedKind: BoundaryCandidate['closedKind'] | null = null;
    if (flagShape) closedKind = 'flag-shape';
    else if (flagClosed) closedKind = 'flag-closed';
    else if (endpointsClose) closedKind = 'endpoints';
    else if (layerIsBoundary) closedKind = 'forced-open';
    else continue;

    const area = polygonArea(polygon);
    if (area <= 0) continue;
    const w = bb0.maxX - bb0.minX;
    const h = bb0.maxY - bb0.minY;
    const aspectRatio = w > 0 && h > 0 ? Math.max(w / h, h / w) : Infinity;
    const pctOfBbox = bboxArea > 0 ? (area / bboxArea) * 100 : 0;

    // isLikelyBoundary: match layer name regex HOẶC area ≥ 40% bbox với aspect ≤ 4
    const isLikelyBoundary = layerIsBoundary || (pctOfBbox >= 40 && aspectRatio <= 4);

    candidates.push({
      polygon,
      layer,
      area,
      aspectRatio,
      pctOfBbox,
      closedKind,
      isLikelyBoundary,
    });
  }

  // Sort: likely first (likely=true sort by area desc), unlikely after (area desc)
  candidates.sort((a, b) => {
    if (a.isLikelyBoundary !== b.isLikelyBoundary) return a.isLikelyBoundary ? -1 : 1;
    return b.area - a.area;
  });

  console.log(
    `[boundaryCandidates] Scanned ${totalPolylines} polylines → ${candidates.length} closed candidates ` +
    `(${candidates.filter(c => c.isLikelyBoundary).length} likely boundary)`
  );
  if (candidates.length > 0) {
    const top5 = candidates.slice(0, 5);
    for (const c of top5) {
      console.log(
        `  ${c.isLikelyBoundary ? '★' : ' '} layer="${c.layer}", area=${c.area.toFixed(0)}m² ` +
        `(${c.pctOfBbox.toFixed(1)}% bbox), aspect=${c.aspectRatio.toFixed(2)}, closed=${c.closedKind}`
      );
    }
  }

  return candidates;
}

/**
 * Helper: chọn boundary mặc định khi parse xong (không UI).
 * Trả về index của candidate "likely boundary" lớn nhất, hoặc -1 nếu không có.
 * UI có thể auto-select index này (user vẫn override được).
 */
export function pickDefaultBoundaryIndex(candidates: BoundaryCandidate[]): number {
  if (candidates.length === 0) return -1;
  const likely = candidates.filter(c => c.isLikelyBoundary);
  if (likely.length === 0) return -1;
  // candidates đã sort, likely[0] là phần tử đầu mảng
  return candidates.indexOf(likely[0]);
}
