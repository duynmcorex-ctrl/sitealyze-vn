import DxfParser from 'dxf-parser';
import { detectVN2000Zone, vn2000ToLatLon, latLonToVN2000, type VN2000Options } from '../coord/vn2000';

// ── ACI (AutoCAD Color Index) palette ─────────────────────────────────────────
const ACI: Record<number, string> = {
  1: '#FF0000', 2: '#FFFF00', 3: '#00FF00', 4: '#00FFFF',
  5: '#0000FF', 6: '#FF00FF', 7: '#F0F0F0', 8: '#808080', 9: '#C0C0C0',
  10: '#FF4040', 11: '#FF8080', 12: '#BF0000', 13: '#BF6060', 14: '#800000', 15: '#804040',
  20: '#FF8040', 21: '#FFB080', 22: '#BF5F00', 23: '#BF8F60', 24: '#804000', 25: '#806040',
  30: '#FFBF00', 31: '#FFDF80', 32: '#BF8F00', 33: '#BFAF60', 34: '#806000', 35: '#807040',
  40: '#FFFF00', 41: '#FFFF80', 42: '#BFBF00', 43: '#BFBF60', 44: '#808000', 45: '#808040',
  50: '#BFFF00', 51: '#DFFF80', 52: '#80BF00', 53: '#A0BF60', 54: '#608000', 55: '#708040',
  60: '#80FF00', 61: '#C0FF80', 62: '#40BF00', 63: '#80BF60', 64: '#408000', 65: '#608040',
  70: '#40FF00', 71: '#A0FF80', 72: '#00BF00', 73: '#60BF60', 74: '#008000', 75: '#408040',
  80: '#00FF40', 81: '#80FF9F', 82: '#00BF30', 83: '#60BF80', 84: '#008020', 85: '#408050',
  90: '#00FF80', 91: '#80FFBF', 92: '#00BF60', 93: '#60BFA0', 94: '#008040', 95: '#408060',
  100: '#00FFBF', 101: '#80FFDF', 102: '#00BF90', 103: '#60BFC0', 104: '#008060', 105: '#408070',
  110: '#00FFFF', 111: '#80FFFF', 112: '#00BFBF', 113: '#60BFBF', 114: '#008080', 115: '#408080',
  120: '#00BFFF', 121: '#80DFFF', 122: '#0090BF', 123: '#60B0BF', 124: '#006080', 125: '#407080',
  130: '#0080FF', 131: '#80C0FF', 132: '#0060BF', 133: '#6090BF', 134: '#004080', 135: '#406080',
  140: '#0040FF', 141: '#80A0FF', 142: '#0030BF', 143: '#6070BF', 144: '#002080', 145: '#405080',
  150: '#0000FF', 151: '#8080FF', 152: '#0000BF', 153: '#6060BF', 154: '#000080', 155: '#404080',
  160: '#4000FF', 161: '#A080FF', 162: '#3000BF', 163: '#7060BF', 164: '#200080', 165: '#504080',
  170: '#8000FF', 171: '#C080FF', 172: '#6000BF', 173: '#9060BF', 174: '#400080', 175: '#604080',
  180: '#BF00FF', 181: '#DF80FF', 182: '#9000BF', 183: '#B060BF', 184: '#600080', 185: '#704080',
  190: '#FF00FF', 191: '#FF80FF', 192: '#BF00BF', 193: '#BF60BF', 194: '#800080', 195: '#804080',
  200: '#FF00BF', 201: '#FF80DF', 202: '#BF0090', 203: '#BF60B0', 204: '#800060', 205: '#804070',
  210: '#FF0080', 211: '#FF80C0', 212: '#BF0060', 213: '#BF6090', 214: '#800040', 215: '#804060',
  220: '#FF0040', 221: '#FF80A0', 222: '#BF0030', 223: '#BF6070', 224: '#800020', 225: '#804050',
  250: '#333333', 251: '#505050', 252: '#696969', 253: '#828282', 254: '#BEBEBE', 255: '#F0F0F0',
};

export function aciToHex(n: number): string {
  if (ACI[n]) return ACI[n];
  // Fallback: hue wheel for unmapped indices
  const hue = Math.round(((n - 10) / 240) * 360) % 360;
  return `hsl(${hue},70%,55%)`;
}

export function trueColorToHex(rgb: number): string {
  return '#' + (rgb & 0xFFFFFF).toString(16).padStart(6, '0');
}

// ── Tessellation helpers ───────────────────────────────────────────────────────

/** Tessellate ARC/CIRCLE (angles in degrees, CCW positive) */
function tessArc(
  cx: number, cy: number, r: number,
  startDeg: number, endDeg: number,
): { x: number; y: number }[] {
  let total = endDeg - startDeg;
  if (total <= 0) total += 360;
  const steps = Math.max(4, Math.ceil(total / 2.5)); // ~2.5° per step → smooth
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i <= steps; i++) {
    const a = (startDeg + (total * i) / steps) * (Math.PI / 180);
    pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
  }
  return pts;
}

/**
 * Tessellate the arc segment described by a LWPOLYLINE bulge value.
 * bulge = tan(θ/4) where θ is the signed arc angle (CCW positive).
 */
function tessArcBulge(
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  bulge: number,
): { x: number; y: number }[] {
  if (Math.abs(bulge) < 1e-6) return [p1, p2];

  const dx = p2.x - p1.x, dy = p2.y - p1.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist < 1e-10) return [p1, p2];

  // Included angle (signed: positive = CCW)
  const alpha = 4 * Math.atan(bulge);
  // Radius (signed; use abs for coordinate math)
  const radius = (dist / 2) / Math.sin(alpha / 2);

  // Centre point via rotation: rotate midpoint-to-P1 vector by (π/2 − α/2)
  const betaAngle = Math.atan2(dy, dx) + Math.PI / 2 - alpha / 2;
  const cx = p1.x + radius * Math.cos(betaAngle);
  const cy2 = p1.y + radius * Math.sin(betaAngle);
  const r = Math.abs(radius);

  const startA = Math.atan2(p1.y - cy2, p1.x - cx);
  const steps = Math.max(4, Math.ceil(Math.abs(alpha) * (180 / Math.PI) / 2.5));

  const result: { x: number; y: number }[] = [];
  for (let i = 0; i <= steps; i++) {
    const a = startA + alpha * (i / steps);
    result.push({ x: cx + r * Math.cos(a), y: cy2 + r * Math.sin(a) });
  }
  return result;
}

// ── Tree layer detection ───────────────────────────────────────────────────────
/** Layer name pattern: nhận dạng layer cây hiện trạng */
const TREE_LAYER_RE = /(^|[_\-\s])(CAY|CX|TREE|TREET|VEGETATION|CAYXANH|CAY_HT|CAY_HH|GREEN|XANH|THONG|PINE|VEG|FOREST|RUNG|THUC[_\-\s]?VAT)([_\-\s]|$)/i;

export function isTreeLayer(layerName: string): boolean {
  return TREE_LAYER_RE.test(layerName);
}

/** Block name pattern: nhận dạng BLOCK INSERT tree */
const TREE_BLOCK_RE = /(tree|cay|conifer|deciduous|pine|thong|palm|coconut|bush|shrub)/i;

export function isTreeBlock(blockName: string | undefined): boolean {
  if (!blockName) return false;
  return TREE_BLOCK_RE.test(blockName);
}

/** Content pattern: TEXT có nội dung tên cây — phạm vi rộng các loại cây phổ biến VN */
const TREE_TEXT_RE = /(thông|pine|bàng|sấu|phượng|xà cừ|bằng lăng|cây\s|tree|cây\s*ăn|cây\s*xanh|cây\s*cổ|cây\s*to|cây\s*bụi|me|sao|dầu|xoan|keo|bạch đàn|gioi|tràm|đào|cau|dừa|cọ)/i;

/** Trả về true nếu TEXT entity nên được coi là cây — dựa trên layer HOẶC content.
 *  Logic broader (round 2):
 *   - Layer match TREE_LAYER_RE → mọi TEXT trên layer đó = cây
 *   - Content match TREE_TEXT_RE (tên loại cây)
 *   - Content rất ngắn (1-3 chars) và có ký tự non-ASCII (CAD font symbol)
 *   - Content single non-ASCII char (ký hiệu cây từ SHX font)
 */
export function isTreeText(layerName: string, textContent: string): boolean {
  if (isTreeLayer(layerName)) return true;
  if (!textContent || textContent.length === 0) return false;
  const t = textContent.trim();
  // Ký hiệu cây CAD: 1-3 char, có non-ASCII (Á, ♣, glyph từ TREE.shx)
  if (t.length <= 3 && /[^\x20-\x7E]/.test(t)) return true;
  // Vietnamese tree keywords
  return TREE_TEXT_RE.test(t);
}

// ── Group types ────────────────────────────────────────────────────────────────

export interface OverlayGroup {
  layerName: string;
  /** CSS hex colour from DXF layer/entity */
  color: string;
  polylines: { x: number; y: number }[][];
  /**
   * Circles trong layer (chỉ có khi layer được nhận dạng là tree layer).
   * Lưu dạng thô trước khi convert world-space.
   */
  circles?: { x: number; y: number; r: number }[];
  /** Vị trí tất cả TEXT/MTEXT entity trên layer này — để user có thể manually
   *  mark layer là tree và dùng các vị trí TEXT làm vị trí cây. */
  textPositions?: { x: number; y: number; content: string }[];
  /** Stats: số entity gốc theo type (chẩn đoán) */
  entityCounts?: { polyline: number; circle: number; text: number; insert: number };
}

// ── Main parser ───────────────────────────────────────────────────────────────

const SKIP_TYPES = new Set([
  'ATTDEF', 'ATTRIB',
  'DIMENSION', 'HATCH', 'SOLID', 'IMAGE',
  'POINT', 'XLINE', 'RAY', 'LEADER', 'TOLERANCE',
  'VIEWPORT', 'WIPEOUT',
  // NOTE: TEXT/MTEXT giờ được xử lý cho tree detection (xem code dưới)
  // NOTE: INSERT giờ được xử lý cho tree detection, không skip hoàn toàn
]);

/** Parse overlay DXF → groups per CAD layer with original colours */
export function parseOverlayDxfGroups(text: string): OverlayGroup[] {
  const parser = new DxfParser();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dxf = parser.parseSync(text) as { entities: any[]; tables?: any } | null;
  if (!dxf?.entities) return [];

  // ── Collect layer colours from LAYER table ─────────────────────────────────
  const layerColors: Record<string, string> = {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const layerTable = (dxf.tables as any)?.layer?.layers as Record<string, any> | undefined;
  if (layerTable) {
    for (const [name, info] of Object.entries(layerTable)) {
      if (typeof info.trueColor === 'number' && info.trueColor > 0) {
        layerColors[name] = trueColorToHex(info.trueColor);
      } else {
        const ci = Math.abs(info.color ?? info.colorIndex ?? 0);
        if (ci > 0 && ci < 256) layerColors[name] = aciToHex(ci);
      }
    }
  }

  // ── Helper: resolve entity colour ─────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function entityColor(ent: any, layer: string): string {
    if (typeof ent.trueColor === 'number' && ent.trueColor > 0) {
      return trueColorToHex(ent.trueColor);
    }
    const ci = ent.colorIndex ?? ent.color;
    // 0=BYBLOCK, 256=BYLAYER → fall through to layer colour
    if (typeof ci === 'number' && ci > 0 && ci < 256) return aciToHex(ci);
    return layerColors[layer] ?? '#AAAAAA';
  }

  // ── Accumulate polylines per CAD layer ────────────────────────────────────
  const groups = new Map<string, {
    color: string;
    polys: { x: number; y: number }[][];
    circles: { x: number; y: number; r: number }[];
    texts: { x: number; y: number; content: string }[];
    counts: { polyline: number; circle: number; text: number; insert: number };
  }>();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function getGroup(layerName: string, color: string) {
    if (!groups.has(layerName)) {
      groups.set(layerName, {
        color, polys: [], circles: [], texts: [],
        counts: { polyline: 0, circle: 0, text: 0, insert: 0 },
      });
    }
    return groups.get(layerName)!;
  }

  for (const ent of dxf.entities) {
    const type = (ent.type ?? '').toUpperCase();

    // INSERT — đọc vị trí gốc như một điểm cây nếu:
    //   1. Layer là tree layer, HOẶC
    //   2. Block name (ent.name) match TREE_BLOCK_RE (vd block "TREE_01", "CAY_THONG")
    if (type === 'INSERT') {
      const layer = ent.layer ?? '0';
      const blockName: string | undefined = ent.name;
      const isFromTreeLayer = isTreeLayer(layer);
      const isFromTreeBlock = isTreeBlock(blockName);
      if (typeof ent.position?.x === 'number') {
        const color = entityColor(ent, layer);
        const targetLayer = isFromTreeLayer ? layer
                          : isFromTreeBlock ? `CAY_BLOCK_${(blockName ?? 'AUTO').toUpperCase()}`
                          : layer;
        const g = getGroup(targetLayer, color);
        g.counts.insert++;
        if (isFromTreeLayer || isFromTreeBlock) {
          const r = Math.abs(ent.xScale ?? ent.yScale ?? 3);
          g.circles.push({ x: ent.position.x, y: ent.position.y, r: r > 0.1 ? r : 3 });
        }
      }
      continue;
    }

    // TEXT/MTEXT — lưu MỌI vị trí TEXT (để user có thể manual-tag layer = tree).
    // Nếu match tree pattern → push vào circles để auto-detect; còn lại lưu vào texts.
    if (type === 'TEXT' || type === 'MTEXT') {
      const layer = ent.layer ?? '0';
      const pos = ent.position ?? ent.startPoint ?? ent.insertionPoint;
      const txt = ent.text ?? ent.string ?? '';
      if (pos && typeof pos.x === 'number') {
        const color = entityColor(ent, layer);
        const isTree = isTreeText(layer, txt);
        const targetLayer = isTree
          ? (isTreeLayer(layer) ? layer : 'CAY_TEXT_AUTO')
          : layer;
        const g = getGroup(targetLayer, color);
        g.counts.text++;
        // Lưu MỌI vị trí TEXT vào g.texts (regardless of detection)
        g.texts.push({ x: pos.x, y: pos.y, content: String(txt).slice(0, 30) });
        // Nếu là tree → cũng push vào circles để auto-render
        if (isTree) {
          g.circles.push({ x: pos.x, y: pos.y, r: 3 });
        }
      }
      continue;
    }

    if (SKIP_TYPES.has(type)) continue;

    const layer = ent.layer ?? '0';
    const color = entityColor(ent, layer);
    const g = getGroup(layer, color);

    // ── LWPOLYLINE / POLYLINE (with bulge arc support) ─────────────────────
    if (type === 'LWPOLYLINE' || type === 'POLYLINE') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const verts: any[] = ent.vertices ?? [];
      if (verts.length < 2) continue;

      // Build tessellated point list respecting bulge on each vertex
      const pts: { x: number; y: number }[] = [{ x: verts[0].x, y: verts[0].y }];

      for (let i = 0; i < verts.length - 1; i++) {
        const v = verts[i], vn = verts[i + 1];
        if (typeof v.x !== 'number' || typeof v.y !== 'number') continue;
        if (typeof vn.x !== 'number' || typeof vn.y !== 'number') continue;

        const bulge: number = v.bulge ?? 0;
        if (Math.abs(bulge) > 1e-6) {
          // Arc segment: tessellate, skip first point (= v, already in pts)
          const arcPts = tessArcBulge({ x: v.x, y: v.y }, { x: vn.x, y: vn.y }, bulge);
          pts.push(...arcPts.slice(1));
        } else {
          pts.push({ x: vn.x, y: vn.y });
        }
      }

      // Close the polyline if flagged
      if (ent.shape === true && verts.length >= 3) {
        const vLast = verts[verts.length - 1];
        const vFirst = verts[0];
        if (typeof vLast.x === 'number' && typeof vFirst.x === 'number') {
          const bulge: number = vLast.bulge ?? 0;
          if (Math.abs(bulge) > 1e-6) {
            const arcPts = tessArcBulge(
              { x: vLast.x, y: vLast.y },
              { x: vFirst.x, y: vFirst.y },
              bulge,
            );
            pts.push(...arcPts.slice(1));
          } else {
            pts.push({ x: vFirst.x, y: vFirst.y });
          }
        }
      }

      if (pts.length >= 2) { g.polys.push(pts); g.counts.polyline++; }

    // ── LINE ──────────────────────────────────────────────────────────────
    } else if (type === 'LINE' && ent.start && ent.end) {
      if (typeof ent.start.x === 'number' && typeof ent.end.x === 'number') {
        g.polys.push([
          { x: ent.start.x, y: ent.start.y },
          { x: ent.end.x, y: ent.end.y },
        ]);
        g.counts.polyline++;
      }

    // ── ARC ───────────────────────────────────────────────────────────────
    } else if (type === 'ARC' && ent.center && typeof ent.radius === 'number') {
      const pts = tessArc(
        ent.center.x, ent.center.y, ent.radius,
        ent.startAngle ?? 0, ent.endAngle ?? 360,
      );
      if (pts.length >= 2) { g.polys.push(pts); g.counts.polyline++; }

    // ── CIRCLE ────────────────────────────────────────────────────────────
    } else if (type === 'CIRCLE' && ent.center && typeof ent.radius === 'number') {
      g.counts.circle++;
      // Nếu layer là tree → lưu circle data riêng (để render dạng 3D instanced tree)
      // Vẫn tessellate polyline để hiển thị outline nếu user muốn
      if (isTreeLayer(layer)) {
        g.circles.push({ x: ent.center.x, y: ent.center.y, r: ent.radius });
      }
      const pts = tessArc(ent.center.x, ent.center.y, ent.radius, 0, 360);
      pts.push({ ...pts[0] }); // close
      if (pts.length >= 2) g.polys.push(pts);

    // ── SPLINE ────────────────────────────────────────────────────────────
    } else if (type === 'SPLINE') {
      // Prefer fit points (spline passes through them); fall back to control points
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const candidates: any[] =
        ent.fitPoints?.length >= 2 ? ent.fitPoints : (ent.controlPoints ?? []);
      const pts = candidates
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .filter((p: any) => typeof p.x === 'number' && typeof p.y === 'number')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((p: any) => ({ x: p.x as number, y: p.y as number }));
      if (pts.length >= 2) g.polys.push(pts);

    // ── ELLIPSE ───────────────────────────────────────────────────────────
    } else if (type === 'ELLIPSE' && ent.center && ent.majorAxisEndPoint) {
      const { center, majorAxisEndPoint, axisRatio = 1 } = ent;
      const majorLen = Math.sqrt(
        majorAxisEndPoint.x ** 2 + majorAxisEndPoint.y ** 2,
      );
      if (majorLen < 1e-10) continue;
      const majorAngle = Math.atan2(majorAxisEndPoint.y, majorAxisEndPoint.x);
      const minorLen = majorLen * axisRatio;
      const startParam = (ent.startAngle ?? 0) * (180 / Math.PI);
      const endParam = (ent.endAngle ?? Math.PI * 2) * (180 / Math.PI);
      const totalDeg = endParam > startParam ? endParam - startParam : endParam - startParam + 360;
      const steps = Math.max(8, Math.ceil(totalDeg / 2.5));
      const pts: { x: number; y: number }[] = [];
      for (let i = 0; i <= steps; i++) {
        const t = (startParam + (totalDeg * i) / steps) * (Math.PI / 180);
        const ex = majorLen * Math.cos(t);
        const ey = minorLen * Math.sin(t);
        // Rotate by major axis angle
        pts.push({
          x: center.x + ex * Math.cos(majorAngle) - ey * Math.sin(majorAngle),
          y: center.y + ex * Math.sin(majorAngle) + ey * Math.cos(majorAngle),
        });
      }
      if (pts.length >= 2) g.polys.push(pts);
    }
  }

  return Array.from(groups.entries())
    .filter(([, v]) => v.polys.length > 0 || v.circles.length > 0 || v.texts.length > 0)
    .map(([layerName, { color, polys, circles, texts, counts }]) => ({
      layerName,
      color,
      polylines: polys,
      ...(circles.length > 0 ? { circles } : {}),
      ...(texts.length > 0 ? { textPositions: texts } : {}),
      entityCounts: counts,
    }));
}

// ── Backward-compat flat interface ────────────────────────────────────────────

export interface OverlayPolyline {
  points: { x: number; y: number }[];
  layer?: string;
}

/** Legacy flat parse (used internally) */
export function parseOverlayDxf(text: string): OverlayPolyline[] {
  const groups = parseOverlayDxfGroups(text);
  return groups.flatMap((g) =>
    g.polylines.map((pts) => ({ points: pts, layer: g.layerName })),
  );
}

// ── World-space conversion ────────────────────────────────────────────────────

type SampleResult =
  | { kind: 'hit'; h: number }        // inside TIN coverage — real terrain height
  | { kind: 'outside'; }              // outside TIN coverage (mask=0) but inside bbox
  | { kind: 'outOfBounds' };          // outside heightmap bbox entirely

/**
 * Bilinear height sample from heightmap with three-way result:
 *
 * • `hit`         — point is inside real TIN coverage (mask=1). Use h.
 * • `outside`     — point is inside the heightmap bbox but mask=0 (dilation /
 *                   exterior-fill cell). The terrain was not rasterized here.
 *                   Caller should continue the polyline at the last valid height
 *                   so roads outside TIN don't plunge to a wedge Z.
 * • `outOfBounds` — point is outside the heightmap bbox entirely.
 *                   Caller should cut the polyline here.
 *
 * This three-way distinction prevents two failure modes:
 *   1) Deep "V" dives: clamping to edge cells whose Z came from exterior fill
 *      could be minZ (~36 m) while on-terrain Z is ~72 m → 36-m apparent dive.
 *   2) Disappearing roads: rejecting all mask=0 points removes road segments
 *      that lie outside (but adjacent to) the terrain cluster.
 */
function sampleHeight(
  px: number, py: number,
  bounds: { minX: number; minY: number; maxX: number; maxY: number },
  hm: { width: number; height: number; cellSize: number; data: Float32Array; mask?: Uint8Array },
): SampleResult {
  const fx = (px - bounds.minX) / hm.cellSize;
  const fy = (py - bounds.minY) / hm.cellSize;
  if (fx < 0 || fx > hm.width - 1 || fy < 0 || fy > hm.height - 1) {
    return { kind: 'outOfBounds' };
  }
  const c0 = Math.floor(fx);
  const r0 = Math.floor(fy);
  const c1 = Math.min(hm.width - 1, c0 + 1);
  const r1 = Math.min(hm.height - 1, r0 + 1);
  const i00 = r0 * hm.width + c0;
  const i01 = r0 * hm.width + c1;
  const i10 = r1 * hm.width + c0;
  const i11 = r1 * hm.width + c1;
  // If mask exists, require all 4 bilinear-interpolation neighbors to be in
  // real TIN coverage. If any is mask=0 (fill/dilation), report 'outside' so
  // the caller can extend at the last-known TIN height instead of sampling a
  // potentially wrong wedge value.
  if (hm.mask) {
    if (!hm.mask[i00] || !hm.mask[i01] || !hm.mask[i10] || !hm.mask[i11]) {
      return { kind: 'outside' };
    }
  }
  const tx = fx - c0, ty = fy - r0;
  const h =
    hm.data[i00] * (1 - tx) * (1 - ty) +
    hm.data[i01] * tx * (1 - ty) +
    hm.data[i10] * (1 - tx) * ty +
    hm.data[i11] * tx * ty;
  return Number.isFinite(h) ? { kind: 'hit', h } : { kind: 'outside' };
}

/** Densify a 2-D polyline so no segment exceeds maxDist */
function densify(
  pts: { x: number; y: number }[],
  maxDist: number,
): { x: number; y: number }[] {
  if (maxDist <= 0 || pts.length < 2) return pts;
  const result: { x: number; y: number }[] = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const dx = pts[i].x - pts[i - 1].x;
    const dy = pts[i].y - pts[i - 1].y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > maxDist) {
      const n = Math.ceil(dist / maxDist);
      for (let j = 1; j < n; j++) {
        result.push({ x: pts[i - 1].x + (dx * j) / n, y: pts[i - 1].y + (dy * j) / n });
      }
    }
    result.push(pts[i]);
  }
  return result;
}

/**
 * Convert 2-D overlay polylines from DXF world coords → Three.js world space,
 * draping each point onto the terrain heightmap (bilinear + densified).
 *
 * Rule (user-specified):
 *   • Z=0 file (flat terrain): all objects stay visible at flat ground level.
 *   • Z>0 file (real terrain): objects ON terrain drape onto 3D surface;
 *     objects OUTSIDE terrain remain visible at the last known terrain edge
 *     height (or terrain floor if the polyline never crossed terrain at all).
 *   → NEVER cut / hide any polyline — all base-map objects must be preserved.
 */
export function overlayToWorldSpace(
  polylines: OverlayPolyline[],
  bounds: { minX: number; maxX: number; minY: number; maxY: number },
  heightmap: { width: number; height: number; cellSize: number; data: Float32Array; mask?: Uint8Array; minZ?: number; maxZ?: number },
  elevationOffset = 2,
): { x: number; y: number; z: number }[][] {
  const cx = (bounds.maxX + bounds.minX) / 2;
  const cy = (bounds.maxY + bounds.minY) / 2;
  const maxGap = heightmap.cellSize * 0.75;
  // Terrain floor = minZ of heightmap (or 0 for flat files).
  // Used as fallback Y for polyline points that lie outside TIN coverage.
  const terrainFloor = heightmap.minZ ?? 0;

  const result: { x: number; y: number; z: number }[][] = [];
  for (const { points } of polylines) {
    const dense = densify(points, maxGap);
    const seg: { x: number; y: number; z: number }[] = [];

    // PRE-SCAN: tìm cao độ terrain đầu tiên có 'hit' trong polyline này.
    // Dùng làm fallback cho các điểm ĐẦU nằm ngoài TIN (lastValidH vẫn null lúc đó).
    // Tránh hiệu ứng "V-dive" — đường cắm từ terrainFloor vọt lên mặt terrain.
    // Polyline hoàn toàn ngoài terrain → firstValidH = null → dùng terrainFloor (giữ behavior cũ).
    let firstValidH: number | null = null;
    for (const p of dense) {
      const sr = sampleHeight(p.x, p.y, bounds, heightmap);
      if (sr.kind === 'hit') { firstValidH = sr.h; break; }
    }
    const leadFallback = firstValidH ?? terrainFloor;

    let lastValidH: number | null = null;   // last height from real TIN coverage

    for (const p of dense) {
      const sr = sampleHeight(p.x, p.y, bounds, heightmap);
      let h: number;
      if (sr.kind === 'hit') {
        // Inside real TIN coverage → drape normally, update running height
        lastValidH = sr.h;
        h = sr.h;
      } else {
        // Outside TIN (dilation/fill zone) OR outside heightmap bbox entirely.
        // - Trailing outside (lastValidH set): keep last terrain edge height → flat extension
        // - Leading outside (lastValidH null): use firstValidH so leading segment
        //   stays at terrain-entry elevation, not terrainFloor → no spike
        h = lastValidH ?? leadFallback;
      }
      seg.push({ x: p.x - cx, y: h + elevationOffset, z: -(p.y - cy) });
    }
    if (seg.length >= 2) result.push(seg);
  }
  return result;
}

/**
 * Convert raw DXF circles (tree crowns) → TreePoint[] trong Three.js world space.
 * Drape lên terrain heightmap giống overlay polylines.
 */
export function circlesToTreePoints(
  circles: { x: number; y: number; r: number }[],
  bounds: { minX: number; maxX: number; minY: number; maxY: number },
  hm: { width: number; height: number; cellSize: number; data: Float32Array; mask?: Uint8Array },
): import('../types').TreePoint[] {
  const cx = (bounds.maxX + bounds.minX) / 2;
  const cy = (bounds.maxY + bounds.minY) / 2;
  const out: import('../types').TreePoint[] = [];
  for (const { x, y, r } of circles) {
    const sr = sampleHeight(x, y, bounds, hm);
    if (sr.kind !== 'hit') continue;  // tree ngoài TIN/bounds → không có đất để đứng
    out.push({
      x: x - cx,
      y: sr.h,
      z: -(y - cy),
      crownRadius: r > 0.1 ? r : 3,
    });
  }
  return out;
}

/**
 * Nếu terrain hiện tại dựng từ ranh giới GGE/KML (có vn2000ProjOpts lưu sẵn zone đã chọn theo
 * centroid khu đất — xem buildTerrainFromBoundary), file DXF khảo sát thật add đè lên SAU ĐÓ có
 * thể dùng một zone VN2000 khác (vd Lâm Đồng dùng kinh tuyến 107°45' chính thức, không phải zone
 * "gần nhất theo khoảng cách"). 2 nguồn toạ độ khi đó lệch nhau dù cùng đại diện 1 vị trí thật.
 *
 * Hàm này: lấy 1 điểm đại diện trong group → đoán zone thật của nó bằng detectVN2000Zone() (có
 * elevation hint) → nếu khác zone terrain, reproject TOÀN BỘ điểm trong group (qua lat/lon) sang
 * đúng zone terrain trước khi gọi groupToWorldSpace — sửa lệch vị trí do khác zone chiếu.
 *
 * Không có tác dụng (trả về group gốc) nếu: group rỗng, không đoán được zone, hoặc zone đã khớp.
 */
export function reprojectGroupToTerrainZone(
  group: OverlayGroup,
  terrainProjOpts: VN2000Options,
  elevationHint?: number,
): OverlayGroup {
  const sample = group.polylines[0]?.[0] ?? group.circles?.[0] ?? group.textPositions?.[0];
  if (!sample) return group;

  const detected = detectVN2000Zone(sample.x, sample.y, { elevationHint });
  if (!detected) return group;

  const terrainMeridian = terrainProjOpts.centralMeridian ?? 105;
  const terrainK0 = terrainProjOpts.k0 ?? 0.9996;
  const sameZone =
    Math.abs(detected.centralMeridian - terrainMeridian) < 0.01 &&
    Math.abs(detected.k0 - terrainK0) < 0.0001;
  if (sameZone) return group;

  const fromOpts: VN2000Options = { centralMeridian: detected.centralMeridian, k0: detected.k0 };
  const reprojectPt = (p: { x: number; y: number }): { x: number; y: number } => {
    const { lat, lon } = vn2000ToLatLon(p.x, p.y, fromOpts);
    const { easting, northing } = latLonToVN2000(lat, lon, terrainProjOpts);
    return { x: easting, y: northing };
  };

  console.log(
    `[VN2000 overlay] DXF "${group.layerName}" dùng zone khác terrain (đoán: ${detected.label}, ` +
    `terrain: ${terrainMeridian}°) — tự reproject để khớp vị trí.`,
  );

  return {
    ...group,
    polylines: group.polylines.map((pts) => pts.map(reprojectPt)),
    circles: group.circles?.map((c) => ({ ...reprojectPt(c), r: c.r })),
    textPositions: group.textPositions?.map((t) => ({ ...reprojectPt(t), content: t.content })),
  };
}

/**
 * Convert an OverlayGroup's polylines to Three.js world space.
 */
export function groupToWorldSpace(
  group: OverlayGroup,
  bounds: { minX: number; maxX: number; minY: number; maxY: number },
  heightmap: { width: number; height: number; cellSize: number; data: Float32Array; mask?: Uint8Array; minZ?: number; maxZ?: number },
  elevationOffset = 2,
): { x: number; y: number; z: number }[][] {
  const polys: OverlayPolyline[] = group.polylines.map((pts) => ({ points: pts }));
  return overlayToWorldSpace(polys, bounds, heightmap, elevationOffset);
}
