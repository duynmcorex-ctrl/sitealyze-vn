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

/**
 * Đọc KMZ (ZIP) và cố trích KML XML.
 * Chiến lược:
 *   a) Tìm chuỗi XML bắt đầu từ "<?xml" hoặc "<kml" trong binary blob
 *      (nhiều KMZ lưu KML dưới dạng STORED = không nén).
 *   b) Nếu không tìm được, trả về null (yêu cầu user dùng KML).
 */
export function extractKmlFromKmz(buffer: ArrayBuffer): string | null {
  const bytes = new Uint8Array(buffer);
  const text = new TextDecoder('utf-8', { fatal: false }).decode(bytes);

  // Tìm block XML KML
  const xmlStart = text.search(/<\?xml|<kml[\s>]/i);
  if (xmlStart < 0) return null;

  const kmlEnd = text.lastIndexOf('</kml>');
  if (kmlEnd < 0) {
    // Có thể không có closing tag — trả về từ đầu đến hết
    return text.slice(xmlStart);
  }
  return text.slice(xmlStart, kmlEnd + '</kml>'.length);
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
    const xml = extractKmlFromKmz(buffer);
    if (!xml) return null;
    return parseKmlText(xml);
  }

  return null;
}
