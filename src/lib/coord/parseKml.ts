/**
 * parseKml.ts
 * Parse KML / KMZ files để trích toạ độ địa lý trung tâm dự án.
 *
 * KML: file XML thuần tuý, tìm <LookAt> hoặc <Point> <coordinates> hoặc center bbox
 * KMZ: ZIP file chứa doc.kml — nhiều trường hợp Google Earth export KML không nén
 *       (compression method 0) → tìm raw XML trong binary blob.
 */

export interface KmlLocation {
  lat: number;
  lon: number;
  label?: string;
}

/**
 * Parse từ chuỗi KML XML: trả về toạ độ tâm dự án.
 */
export function parseKmlText(xml: string): KmlLocation | null {
  try {
    const doc = new DOMParser().parseFromString(xml, 'application/xml');

    // 1. <LookAt> — toạ độ view camera (thường là tâm dự án)
    const lookAt = doc.querySelector('LookAt');
    if (lookAt) {
      const lon = parseFloat(lookAt.querySelector('longitude')?.textContent ?? '');
      const lat = parseFloat(lookAt.querySelector('latitude')?.textContent ?? '');
      if (isFinite(lon) && isFinite(lat)) return { lat, lon };
    }

    // 2. <Camera> — tương tự LookAt
    const camera = doc.querySelector('Camera');
    if (camera) {
      const lon = parseFloat(camera.querySelector('longitude')?.textContent ?? '');
      const lat = parseFloat(camera.querySelector('latitude')?.textContent ?? '');
      if (isFinite(lon) && isFinite(lat)) return { lat, lon };
    }

    // 3. <Point> <coordinates>lon,lat,alt</coordinates>
    const pointCoord = doc.querySelector('Point coordinates');
    if (pointCoord) {
      const parts = (pointCoord.textContent ?? '').trim().split(',');
      if (parts.length >= 2) {
        const lon = parseFloat(parts[0]);
        const lat = parseFloat(parts[1]);
        if (isFinite(lon) && isFinite(lat)) return { lat, lon };
      }
    }

    // 4. <coordinates> (LineString, Polygon...) — lấy centroid từ bbox
    const allCoords = doc.querySelectorAll('coordinates');
    if (allCoords.length > 0) {
      let minLat = Infinity, maxLat = -Infinity;
      let minLon = Infinity, maxLon = -Infinity;
      allCoords.forEach((el) => {
        const pairs = (el.textContent ?? '').trim().split(/\s+/);
        for (const pair of pairs) {
          const p = pair.split(',');
          if (p.length >= 2) {
            const lon = parseFloat(p[0]);
            const lat = parseFloat(p[1]);
            if (isFinite(lon) && isFinite(lat)) {
              if (lat < minLat) minLat = lat;
              if (lat > maxLat) maxLat = lat;
              if (lon < minLon) minLon = lon;
              if (lon > maxLon) maxLon = lon;
            }
          }
        }
      });
      if (isFinite(minLat)) {
        return { lat: (minLat + maxLat) / 2, lon: (minLon + maxLon) / 2 };
      }
    }
  } catch {
    // ignore
  }
  return null;
}

/** Inflate raw DEFLATE data bằng Web Streams API (DecompressionStream — Chrome/Edge 80+, Firefox 113+, Safari 16.4+) */
async function inflateRawDeflate(data: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream('deflate-raw');
  const input = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(data);
      controller.close();
    },
  });
  // Cast: lib.dom.d.ts kiểu DecompressionStream.writable là WritableStream<BufferSource>,
  // generic không khớp chặt với ReadableStream<Uint8Array> tuỳ phiên bản TS — runtime API chuẩn, an toàn.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const buf = await new Response((input as any).pipeThrough(ds)).arrayBuffer();
  return new Uint8Array(buf);
}

const ZIP_LOCAL_FILE_HEADER_SIG = 0x04034b50;

/**
 * Đọc KMZ (ZIP) và trích KML XML bằng cách parse ZIP local file header trực tiếp
 * (không cần thư viện ngoài — dùng DecompressionStream built-in cho deflate).
 *
 * Hỗ trợ cả 2 trường hợp:
 *   - compression method 0 (STORED — không nén)
 *   - compression method 8 (DEFLATE — phổ biến nhất, Google Earth Pro mặc định nén khi Save As)
 *
 * Giới hạn: không hỗ trợ ZIP dùng "data descriptor" (streaming, hiếm gặp ở KMZ tĩnh).
 */
export async function extractKmlFromKmz(buffer: ArrayBuffer): Promise<string | null> {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  let offset = 0;

  while (offset + 30 <= bytes.length) {
    const sig = view.getUint32(offset, true);
    if (sig !== ZIP_LOCAL_FILE_HEADER_SIG) break; // hết entry tuần tự (gặp central directory)

    const compMethod = view.getUint16(offset + 8, true);
    const compSize   = view.getUint32(offset + 18, true);
    const nameLen    = view.getUint16(offset + 26, true);
    const extraLen   = view.getUint16(offset + 28, true);

    const nameStart = offset + 30;
    const name = new TextDecoder('utf-8').decode(bytes.slice(nameStart, nameStart + nameLen));
    const dataStart = nameStart + nameLen + extraLen;
    const dataEnd = dataStart + compSize;

    if (/\.kml$/i.test(name)) {
      const raw = bytes.slice(dataStart, Math.min(dataEnd, bytes.length));
      try {
        if (compMethod === 0) {
          return new TextDecoder('utf-8', { fatal: false }).decode(raw);
        }
        if (compMethod === 8) {
          const inflated = await inflateRawDeflate(raw);
          return new TextDecoder('utf-8', { fatal: false }).decode(inflated);
        }
        console.warn(`[extractKmlFromKmz] Compression method ${compMethod} không hỗ trợ cho "${name}".`);
      } catch (e) {
        console.warn(`[extractKmlFromKmz] Giải nén "${name}" lỗi:`, e);
      }
      return null;
    }

    offset = dataEnd;
  }

  // Fallback cuối: thử tìm raw XML trong blob (trường hợp ZIP header bất thường)
  const text = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  const xmlStart = text.search(/<\?xml|<kml[\s>]/i);
  if (xmlStart < 0) return null;
  const kmlEnd = text.lastIndexOf('</kml>');
  return kmlEnd < 0 ? text.slice(xmlStart) : text.slice(xmlStart, kmlEnd + '</kml>'.length);
}

/** Diện tích xấp xỉ (Shoelace, đơn vị độ² — chỉ dùng để SO SÁNH, không phải m²) */
function approxArea(pts: { lat: number; lon: number }[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p1 = pts[i], p2 = pts[(i + 1) % pts.length];
    a += p1.lon * p2.lat - p2.lon * p1.lat;
  }
  return Math.abs(a) / 2;
}

interface KmlCandidate {
  points: { lat: number; lon: number }[];
  name: string;
  area: number;
  isPolygon: boolean;
}

/** Tên Placemark/folder gợi ý đây là ranh giới dự án (ưu tiên chọn) */
const BOUNDARY_NAME_RE = /(ranh\s*gi[ớo]i|boundary|khu\s*v[ựu]c|du\s*an|d[ựu]\s*[áa]n)/i;
/** Tên gợi ý đây là vùng LOẠI TRỪ / bên ngoài ranh giới — không được ưu tiên dù match BOUNDARY_NAME_RE */
const EXCLUDE_NAME_RE = /(ngo[àa]i|lo[aạ]i\s*tr[ừu]|kh[oô]ng\s*thu[oộ]c|exclude|outside)/i;

/**
 * Trích polygon ranh giới từ KML XML.
 *
 * KML từ Google Earth Pro thường có NHIỀU Placemark (đường, ranh giới, ghi chú...).
 * Quét TOÀN BỘ Placemark, gom mọi Polygon/LineString khép kín ≥3 điểm thành candidate,
 * rồi chọn theo thứ tự ưu tiên:
 *   1. Tên Placemark/folder chứa từ khoá "ranh giới"/"khu vực"/"dự án"
 *   2. Polygon (ưu tiên hơn LineString — đường line hay là tuyến giao thông, không phải ranh giới)
 *   3. Diện tích lớn nhất (ranh giới khu đất thường là hình lớn nhất trong file)
 */
export function parseKmlPolygon(xml: string): { lat: number; lon: number }[] | null {
  try {
    const doc = new DOMParser().parseFromString(xml, 'application/xml');

    function coordsFrom(el: Element | null): { lat: number; lon: number }[] | null {
      if (!el) return null;
      const pairs = (el.textContent ?? '').trim().split(/\s+/);
      const pts: { lat: number; lon: number }[] = [];
      for (const pair of pairs) {
        const p = pair.split(',');
        if (p.length >= 2) {
          const lon = parseFloat(p[0]);
          const lat = parseFloat(p[1]);
          if (isFinite(lon) && isFinite(lat)) pts.push({ lat, lon });
        }
      }
      return pts.length >= 3 ? pts : null;
    }

    const candidates: KmlCandidate[] = [];
    const placemarks = Array.from(doc.querySelectorAll('Placemark'));
    // Fallback: file không có <Placemark> bao ngoài (hiếm) — coi cả document là 1 placemark
    const scopes: (Element | Document)[] = placemarks.length > 0 ? placemarks : [doc];

    for (const scope of scopes) {
      const name = (scope instanceof Element
        ? scope.querySelector('name')?.textContent?.trim()
        : undefined) ?? '';

      // Polygon trước (kể cả nằm trong MultiGeometry)
      const polyCoordEls = scope.querySelectorAll('Polygon outerBoundaryIs LinearRing coordinates');
      let foundPolygon = false;
      polyCoordEls.forEach((el) => {
        const pts = coordsFrom(el);
        if (pts) {
          candidates.push({ points: pts, name, area: approxArea(pts), isPolygon: true });
          foundPolygon = true;
        }
      });
      if (foundPolygon) continue; // placemark này đã có polygon hợp lệ, không cần xét LineString

      // LineString khép (path vẽ ranh giới không đóng thành Polygon)
      const lineCoordEls = scope.querySelectorAll('LineString coordinates');
      lineCoordEls.forEach((el) => {
        const pts = coordsFrom(el);
        if (pts) candidates.push({ points: pts, name, area: approxArea(pts), isPolygon: false });
      });
    }

    if (candidates.length === 0) {
      console.warn(
        `[parseKmlPolygon] Không tìm thấy Polygon/LineString ≥3 điểm trong ${placemarks.length} Placemark. ` +
        `File có thể chỉ chứa Point/marker, hoặc geometry dùng tag không chuẩn KML.`,
      );
      return null;
    }

    console.log(
      `[parseKmlPolygon] Tìm thấy ${candidates.length} candidate: ` +
      candidates.map(c => `"${c.name || '(không tên)'}" ${c.isPolygon ? 'Polygon' : 'LineString'} ${c.points.length}pt`).join(', '),
    );

    // 1. Ưu tiên tên khớp từ khoá ranh giới — NHƯNG loại trừ tên kiểu
    //    "NGOÀI RANH GIỚI..." (vùng loại trừ) cũng match regex ranh giới, dễ bị chọn nhầm
    const named = candidates.find(
      (c) => BOUNDARY_NAME_RE.test(c.name) && !EXCLUDE_NAME_RE.test(c.name),
    );
    if (named) return named.points;

    // 2. Chọn diện tích lớn nhất, KHÔNG phân biệt Polygon/LineString.
    //    Lý do: nhiều file CAD-to-KML (CAD Earth, Civil3D…) xuất ranh giới thật dưới dạng
    //    LineString (path), trong khi vài Polygon nhỏ chỉ là label/marker góc — nếu ưu tiên
    //    "isPolygon" sẽ chọn nhầm object bé thay vì LineString lớn chứa ranh giới thật.
    const nonExcluded = candidates.filter((c) => !EXCLUDE_NAME_RE.test(c.name));
    const pool = nonExcluded.length > 0 ? nonExcluded : candidates;
    pool.sort((a, b) => b.area - a.area);
    return pool[0].points;
  } catch (e) {
    console.warn('[parseKmlPolygon] Parse lỗi:', e);
  }
  return null;
}

/**
 * Entry point: nhận File (KML hoặc KMZ) và trả về polygon ranh giới (lat/lon).
 */
export async function parseBoundaryFile(file: File): Promise<{ lat: number; lon: number }[] | null> {
  const isKmz = /\.kmz$/i.test(file.name);
  const isKml = /\.kml$/i.test(file.name);

  if (isKml) {
    const text = await file.text();
    return parseKmlPolygon(text);
  }
  if (isKmz) {
    const buffer = await file.arrayBuffer();
    const xml = await extractKmlFromKmz(buffer);
    if (!xml) return null;
    return parseKmlPolygon(xml);
  }
  return null;
}

/**
 * Entry point: nhận File (KML hoặc KMZ) và trả về vị trí.
 */
export async function parseLocationFile(file: File): Promise<KmlLocation | null> {
  const isKmz = /\.kmz$/i.test(file.name);
  const isKml = /\.kml$/i.test(file.name);

  if (isKml) {
    const text = await file.text();
    return parseKmlText(text);
  }

  if (isKmz) {
    const buffer = await file.arrayBuffer();
    const xml = await extractKmlFromKmz(buffer);
    if (!xml) return null;
    return parseKmlText(xml);
  }

  return null;
}
