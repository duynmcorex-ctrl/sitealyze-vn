/**
 * BasemapPanel.tsx
 * 2D basemap panel: ESRI Satellite + OSM roads + POI toggles
 *
 * Tiles:
 *  - ESRI World Imagery (ảnh vệ tinh, free, no key)
 *  - OpenFreeMap vector tiles (đường + nhãn, free, no key)
 *  - OSM Overpass API (POI: trường, BV, UBND, chợ, sông)
 *
 * Parcel boundary: convert terrain.bounds (VN2000) → lat/lon → GeoJSON polygon
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useSiteStore } from '../../store/useSiteStore';
import { detectVN2000Zone, vn2000ToLatLon } from '../../lib/coord/vn2000';
import type { VN2000Options } from '../../lib/coord/vn2000';
import { School, Hospital, Building2, ShoppingBag, Droplets, X, Layers, RefreshCw, Mountain, Box, Palette, Waves, MapPin, Check, Undo2, Ban } from 'lucide-react';
import { buildElevationHeatmapDataURL, buildFloodDataURL, getElevHeatmapColor } from '../../lib/render/elevationHeatmapImage';
import { buildTerrainFromBoundary } from '../../lib/dem/buildDemTerrain';

// ── OSM POI layer definitions ──────────────────────────────────────────────
interface PoiLayer {
  id: string;
  label: string;
  overpassQuery: string; // template, {bbox} = S,W,N,E
  color: string;
  icon: React.ReactNode;
  markerEmoji: string;
}

const POI_LAYERS: PoiLayer[] = [
  {
    id: 'schools',
    label: 'Trường học',
    overpassQuery: `[out:json][timeout:20];(node["amenity"~"school|kindergarten|college|university"]({bbox});way["amenity"~"school|kindergarten|college|university"]({bbox}););out center;`,
    color: '#4ADE80',
    icon: <School size={12} />,
    markerEmoji: '🏫',
  },
  {
    id: 'health',
    label: 'Y tế',
    overpassQuery: `[out:json][timeout:20];(node["amenity"~"hospital|clinic|health_post|doctors"]({bbox});way["amenity"~"hospital|clinic"]({bbox}););out center;`,
    color: '#F87171',
    icon: <Hospital size={12} />,
    markerEmoji: '🏥',
  },
  {
    id: 'government',
    label: 'Hành chính',
    overpassQuery: `[out:json][timeout:20];(node["office"~"government|administrative"]["name"]({bbox});way["office"~"government|administrative"]["name"]({bbox}););out center;`,
    color: '#60A5FA',
    icon: <Building2 size={12} />,
    markerEmoji: '🏛️',
  },
  {
    id: 'market',
    label: 'Chợ / TT TM',
    overpassQuery: `[out:json][timeout:20];(node["amenity"~"marketplace|supermarket"]["name"]({bbox});way["amenity"~"marketplace|supermarket"]["name"]({bbox}););out center;`,
    color: '#FBBF24',
    icon: <ShoppingBag size={12} />,
    markerEmoji: '🛒',
  },
  {
    id: 'water',
    label: 'Sông / Hồ',
    overpassQuery: `[out:json][timeout:20];(node["natural"~"water|spring"]["name"]({bbox});way["waterway"~"river|stream"]["name"]({bbox});relation["natural"="water"]["name"]({bbox}););out center;`,
    color: '#38BDF8',
    icon: <Droplets size={12} />,
    markerEmoji: '💧',
  },
];

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Convert VN2000 bounds → 4 lat/lon corners của khu đất.
 *
 * 2 strategies:
 *   1. File CAD giữ tọa độ VN2000 thật → detectVN2000Zone() ra zone → vn2000ToLatLon()
 *   2. File re-center 0,0 (rất phổ biến VN) → fallback: dùng `geoCenter` (tâm tỉnh
 *      đã chọn thủ công) làm tâm khu đất, offset 4 corner theo kích thước thực
 *      bằng phép xấp xỉ (1° lat ≈ 111000m, 1° lon ≈ 111000m × cos(lat)).
 */
function boundsToLatLonPolygon(
  bounds: { minX: number; minY: number; maxX: number; maxY: number },
  geoCenter?: { lat: number; lon: number } | null,
): [number, number][] | null {
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cy = (bounds.minY + bounds.maxY) / 2;

  // ── Strategy 1: file giữ tọa độ VN2000 thật ──
  const zone = detectVN2000Zone(cx, cy);
  if (zone) {
    const opts: VN2000Options = { centralMeridian: zone.centralMeridian, k0: zone.k0 };
    return [
      [bounds.minX, bounds.minY],
      [bounds.maxX, bounds.minY],
      [bounds.maxX, bounds.maxY],
      [bounds.minX, bounds.maxY],
      [bounds.minX, bounds.minY],
    ].map(([e, n]) => {
      const { lat, lon } = vn2000ToLatLon(e, n, opts);
      return [lon, lat] as [number, number];
    });
  }

  // ── Strategy 2: file re-center 0,0 → fallback dùng geoCenter ──
  if (!geoCenter) return null;
  const widthM  = bounds.maxX - bounds.minX;
  const heightM = bounds.maxY - bounds.minY;
  // Tránh polygon quá nhỏ/lớn vô nghĩa
  if (widthM < 1 || heightM < 1 || widthM > 100000 || heightM > 100000) return null;

  const METERS_PER_DEG_LAT = 111_000;
  const metersPerDegLon = 111_000 * Math.cos(geoCenter.lat * Math.PI / 180);
  const halfDLat = (heightM / 2) / METERS_PER_DEG_LAT;
  const halfDLon = (widthM  / 2) / metersPerDegLon;

  // 4 corner xung quanh geoCenter
  return [
    [geoCenter.lon - halfDLon, geoCenter.lat - halfDLat],
    [geoCenter.lon + halfDLon, geoCenter.lat - halfDLat],
    [geoCenter.lon + halfDLon, geoCenter.lat + halfDLat],
    [geoCenter.lon - halfDLon, geoCenter.lat + halfDLat],
    [geoCenter.lon - halfDLon, geoCenter.lat - halfDLat],
  ];
}

/** Parse Overpass JSON → GeoJSON FeatureCollection of points */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function overpassToGeoJSON(data: any): GeoJSON.FeatureCollection {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const features: GeoJSON.Feature[] = (data.elements ?? []).map((el: any) => {
    const lat = el.lat ?? el.center?.lat;
    const lon = el.lon ?? el.center?.lon;
    if (!lat || !lon) return null;
    return {
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [lon, lat] },
      properties: { name: el.tags?.name ?? el.tags?.['name:vi'] ?? 'Không tên', ...el.tags },
    };
  }).filter(Boolean);
  return { type: 'FeatureCollection', features };
}

// ── Component ──────────────────────────────────────────────────────────────

export function BasemapPanel({ onClose }: { onClose: () => void }) {
  const terrain = useSiteStore((s) => s.terrain);
  const geo     = useSiteStore((s) => s.geo);

  const gisDrawMode      = useSiteStore((s) => s.gisDrawMode);
  const gisDrawPoints    = useSiteStore((s) => s.gisDrawPoints);
  const addGisDrawPoint  = useSiteStore((s) => s.addGisDrawPoint);
  const undoGisDrawPoint = useSiteStore((s) => s.undoGisDrawPoint);
  const cancelGisDraw    = useSiteStore((s) => s.cancelGisDraw);
  const setTerrain       = useSiteStore((s) => s.setTerrain);
  const setLoading       = useSiteStore((s) => s.setLoading);
  const setError         = useSiteStore((s) => s.setError);
  const computeForMode   = useSiteStore((s) => s.computeForMode);
  const mode             = useSiteStore((s) => s.mode);
  const [genBusy, setGenBusy] = useState(false);
  const [genMsg, setGenMsg]   = useState('');

  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef       = useRef<maplibregl.Map | null>(null);
  const markersRef   = useRef<maplibregl.Marker[]>([]);

  const [activePoi, setActivePoi] = useState<Set<string>>(new Set());
  const [poiLoading, setPoiLoading] = useState<Set<string>>(new Set());
  const [showRoads, setShowRoads]   = useState(true);
  const [mapReady, setMapReady]     = useState(false);
  const [baseStyle, setBaseStyle]   = useState<'satellite' | 'topo' | 'carto'>('satellite');
  const [pitch, setPitch]           = useState(0);
  const [terrain3D, setTerrain3D]   = useState(false);
  const [showElevHeatmap, setShowElevHeatmap] = useState(false);
  const [showFlood, setShowFlood]   = useState(false);
  const [waterLevel, setWaterLevel] = useState<number>(0);
  const popupRef = useRef<maplibregl.Popup | null>(null);

  // Init waterLevel = minZ của terrain (để slider bắt đầu ở đáy terrain)
  useEffect(() => {
    if (terrain && waterLevel === 0) setWaterLevel(Math.round(terrain.heightmap.minZ));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [terrain]);

  // Tính bbox cho Overpass (±3km quanh trung tâm khu đất)
  const overpassBbox = geo
    ? `${(geo.lat - 0.027).toFixed(5)},${(geo.lon - 0.027).toFixed(5)},${(geo.lat + 0.027).toFixed(5)},${(geo.lon + 0.027).toFixed(5)}`
    : null;

  // Xoá markers cũ của 1 layer
  const clearMarkers = useCallback((layerId: string) => {
    markersRef.current = markersRef.current.filter((m) => {
      if ((m as maplibregl.Marker & { _layerId?: string })._layerId === layerId) {
        m.remove();
        return false;
      }
      return true;
    });
  }, []);

  // Khởi tạo map
  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;

    // Nếu chưa có geo (file re-center về 0,0), center về trung tâm VN
    const lat = geo?.lat ?? 16.0;
    const lon = geo?.lon ?? 106.0;
    const zoom = geo ? 14 : 6;

    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: {
        version: 8,
        glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
        sources: {
          'esri-satellite': {
            type: 'raster',
            tiles: [
              'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
            ],
            tileSize: 256,
            attribution: '© Esri, Maxar, Earthstar Geographics',
            maxzoom: 19,
          },
          'osm-roads': {
            type: 'vector',
            url: 'https://tiles.openfreemap.org/planet',
            attribution: '© OpenFreeMap contributors, © OpenStreetMap contributors',
          },
          // ── OpenTopoMap (bản đồ địa hình có đường đồng mức, free) ──
          'opentopomap': {
            type: 'raster',
            tiles: [
              'https://tile.opentopomap.org/{z}/{x}/{y}.png',
            ],
            tileSize: 256,
            attribution: '© OpenTopoMap (CC-BY-SA), © OpenStreetMap contributors',
            maxzoom: 17,
          },
          // ── Carto Light (bản đồ nền sáng, phù hợp overlay cao độ/ngập) ──
          'carto-light': {
            type: 'raster',
            tiles: [
              'https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
              'https://b.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
              'https://c.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
            ],
            tileSize: 256,
            attribution: '© CARTO, © OpenStreetMap contributors',
            maxzoom: 19,
          },
          // ── DEM cho địa hình 3D (AWS Open Data, không cần API key) ──
          'terrain-dem': {
            type: 'raster-dem',
            tiles: [
              'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png',
            ],
            encoding: 'terrarium',
            tileSize: 256,
            maxzoom: 14,
            attribution: '© Mapzen / AWS Open Data',
          },
        },
        layers: [
          {
            id: 'satellite-tiles',
            type: 'raster',
            source: 'esri-satellite',
            minzoom: 0,
            maxzoom: 22,
            layout: { visibility: 'visible' },
          },
          {
            id: 'opentopomap-tiles',
            type: 'raster',
            source: 'opentopomap',
            minzoom: 0,
            maxzoom: 22,
            layout: { visibility: 'none' },
          },
          {
            id: 'carto-tiles',
            type: 'raster',
            source: 'carto-light',
            minzoom: 0,
            maxzoom: 22,
            layout: { visibility: 'none' },
          },
        ],
        // Sky atmosphere cho cảm giác Earth-like khi nghiêng (sky không có trong types,
        // dùng spec extension qua sky property của style)
        sky: {
          'sky-color': '#7AB3D9',
          'horizon-color': '#FFCBA8',
          'fog-color': '#9DB7C9',
          'sky-horizon-blend': 0.5,
        },
      },
      center: [lon, lat],
      zoom,
      pitch: 0,
      bearing: 0,
      maxPitch: 75,
      attributionControl: false,
    });

    map.addControl(new maplibregl.NavigationControl(), 'top-right');
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');

    map.on('load', () => {
      // OSM roads layer
      map.addLayer({
        id: 'roads-line',
        type: 'line',
        source: 'osm-roads',
        'source-layer': 'transportation',
        layout: { 'line-join': 'round', 'line-cap': 'round', visibility: 'visible' },
        paint: {
          'line-color': ['match', ['get', 'class'],
            ['motorway', 'trunk'], '#FF8800',
            ['primary', 'secondary'], '#FFCC00',
            ['residential', 'tertiary'], '#FFFFFF',
            '#AAAAAA',
          ],
          'line-width': ['match', ['get', 'class'],
            ['motorway', 'trunk'], 3,
            ['primary', 'secondary'], 2,
            1.2,
          ],
          'line-opacity': 0.8,
        },
      });

      // Parcel boundary — fallback dùng geo (nếu user đã chọn tỉnh) khi VN2000 fail
      const parcelCoords = terrain
        ? boundsToLatLonPolygon(terrain.bounds, geo ? { lat: geo.lat, lon: geo.lon } : null)
        : null;
      if (parcelCoords) {
        map.addSource('parcel', {
          type: 'geojson',
          data: {
            type: 'Feature',
            geometry: { type: 'Polygon', coordinates: [parcelCoords] },
            properties: {},
          },
        });
        map.addLayer({
          id: 'parcel-fill',
          type: 'fill',
          source: 'parcel',
          paint: { 'fill-color': '#00E5CC', 'fill-opacity': 0.12 },
        });
        map.addLayer({
          id: 'parcel-outline',
          type: 'line',
          source: 'parcel',
          paint: { 'line-color': '#00E5CC', 'line-width': 2.5, 'line-dasharray': [4, 2] },
        });

        // Center marker (chỉ khi có geo thật)
        if (geo) {
          new maplibregl.Marker({ color: '#00E5CC' })
            .setLngLat([lon, lat])
            .setPopup(new maplibregl.Popup({ closeOnClick: false }).setHTML(
              `<div style="font-size:12px"><b>${geo.province}</b><br>${geo.lat.toFixed(4)}°N, ${geo.lon.toFixed(4)}°E</div>`,
            ))
            .addTo(map);
        }
      }

      setMapReady(true);
    });

    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [terrain, geo]);

  // Khi geo thay đổi (user chọn tỉnh thủ công) → fly map đến vị trí đó
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !geo) return;
    map.flyTo({ center: [geo.lon, geo.lat], zoom: 14, duration: 1200 });

    // Thêm/cập nhật parcel boundary nếu có terrain (fallback geo nếu VN2000 fail)
    if (terrain) {
      const coords = boundsToLatLonPolygon(terrain.bounds, { lat: geo.lat, lon: geo.lon });
      if (coords) {
        const geojsonData: GeoJSON.Feature = {
          type: 'Feature',
          geometry: { type: 'Polygon', coordinates: [coords] },
          properties: {},
        };
        if (map.getSource('parcel')) {
          (map.getSource('parcel') as maplibregl.GeoJSONSource).setData(geojsonData);
        } else {
          map.addSource('parcel', { type: 'geojson', data: geojsonData });
          map.addLayer({ id: 'parcel-fill', type: 'fill', source: 'parcel',
            paint: { 'fill-color': '#00E5CC', 'fill-opacity': 0.12 } });
          map.addLayer({ id: 'parcel-outline', type: 'line', source: 'parcel',
            paint: { 'line-color': '#00E5CC', 'line-width': 2.5, 'line-dasharray': [4, 2] } });
        }
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geo?.lat, geo?.lon, mapReady]);

  // Toggle roads
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    map.setLayoutProperty('roads-line', 'visibility', showRoads ? 'visible' : 'none');
  }, [showRoads, mapReady]);

  // Toggle base style (satellite / topo / carto)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const visMap: Record<string, 'satellite' | 'topo' | 'carto'> = {
      'satellite-tiles': 'satellite',
      'opentopomap-tiles': 'topo',
      'carto-tiles': 'carto',
    };
    Object.entries(visMap).forEach(([layerId, style]) => {
      if (map.getLayer(layerId)) {
        map.setLayoutProperty(layerId, 'visibility', baseStyle === style ? 'visible' : 'none');
      }
    });
  }, [baseStyle, mapReady]);

  // Grayscale base tiles khi bật Elevation Heatmap (theo guide Section 4: topographic-map.com style)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const saturation = showElevHeatmap ? -1 : 0;
    ['satellite-tiles', 'opentopomap-tiles', 'carto-tiles'].forEach(id => {
      if (map.getLayer(id)) {
        map.setPaintProperty(id, 'raster-saturation', saturation);
      }
    });
  }, [showElevHeatmap, mapReady]);

  // Đồng bộ pitch slider với map.pitch
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    map.easeTo({ pitch, duration: 300 });
  }, [pitch, mapReady]);

  // ── Toggle Elevation Heatmap overlay (tô màu cao độ kiểu topographic-map.com) ──
  // Tạo ảnh canvas từ heightmap → MapLibre image source → raster layer opacity 0.55
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !terrain) return;

    const SRC = 'elev-heatmap-src';
    const LYR = 'elev-heatmap-layer';
    const cleanup = () => {
      if (map.getLayer(LYR))  map.removeLayer(LYR);
      if (map.getSource(SRC)) map.removeSource(SRC);
    };

    if (!showElevHeatmap) {
      cleanup();
      return;
    }

    // Tính 4 góc của khu đất theo lat/lon (reuse logic parcel boundary)
    const coords = boundsToLatLonPolygon(
      terrain.bounds,
      geo ? { lat: geo.lat, lon: geo.lon } : null,
    );
    if (!coords || coords.length < 5) return;

    // boundsToLatLonPolygon trả 5 điểm theo thứ tự: SW, SE, NE, NW, SW(close)
    // MapLibre ImageSource cần coordinates theo: TL, TR, BR, BL
    // → TL=NW=coords[3], TR=NE=coords[2], BR=SE=coords[1], BL=SW=coords[0]
    const imgCoords: [
      [number, number], [number, number], [number, number], [number, number],
    ] = [coords[3], coords[2], coords[1], coords[0]];

    const url = buildElevationHeatmapDataURL(terrain.heightmap);
    if (!url) return;

    cleanup(); // re-create để chắc chắn không trùng
    map.addSource(SRC, { type: 'image', url, coordinates: imgCoords });
    // Chèn dưới roads-line (nếu có) để đường vẫn nổi trên heatmap
    const beforeId = map.getLayer('roads-line') ? 'roads-line' : undefined;
    map.addLayer({
      id: LYR,
      type: 'raster',
      source: SRC,
      paint: { 'raster-opacity': 0.55, 'raster-fade-duration': 0 },
    }, beforeId);

    return cleanup;
  }, [showElevHeatmap, mapReady, terrain, geo]);

  // ── Flood simulation overlay (floodmap.net style) ──────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !terrain) return;
    const SRC = 'flood-src', LYR = 'flood-layer';
    const cleanup = () => {
      if (map.getLayer(LYR))  map.removeLayer(LYR);
      if (map.getSource(SRC)) map.removeSource(SRC);
    };
    if (!showFlood) { cleanup(); return; }

    const coords = boundsToLatLonPolygon(terrain.bounds, geo ? { lat: geo.lat, lon: geo.lon } : null);
    if (!coords || coords.length < 5) return;
    const imgCoords: [[number,number],[number,number],[number,number],[number,number]] =
      [coords[3], coords[2], coords[1], coords[0]];

    const url = buildFloodDataURL(terrain.heightmap, waterLevel);
    if (!url) return;
    cleanup();
    map.addSource(SRC, { type: 'image', url, coordinates: imgCoords });
    const beforeId = map.getLayer('roads-line') ? 'roads-line' : undefined;
    map.addLayer({ id: LYR, type: 'raster', source: SRC,
      paint: { 'raster-opacity': 1, 'raster-fade-duration': 0 },
    }, beforeId);
    return cleanup;
  }, [showFlood, waterLevel, mapReady, terrain, geo]);

  // ── Click-to-show-elevation (dùng heightmap data, không cần API ngoài) ─────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !terrain) return;
    const hm = terrain.heightmap;

    const onClick = (e: maplibregl.MapMouseEvent) => {
      if (gisDrawMode) return; // đang vẽ ranh giới — không hiện popup cao độ
      // Chỉ show khi 1 trong 2 overlay đang bật
      if (!showElevHeatmap && !showFlood) return;

      const { lat, lng } = e.lngLat;
      const coords = boundsToLatLonPolygon(terrain.bounds, geo ? { lat: geo.lat, lon: geo.lon } : null);
      if (!coords || coords.length < 5) return;

      // coords: [SW, SE, NE, NW, SW] → SW=coords[0], NE=coords[2]
      const lonMin = coords[0][0], latMin = coords[0][1];
      const lonMax = coords[2][0], latMax = coords[2][1];

      // Tính vị trí tương đối trong heightmap (0..1)
      const fx = (lng - lonMin) / (lonMax - lonMin);
      const fy = (lat - latMin) / (latMax - latMin);
      if (fx < 0 || fx > 1 || fy < 0 || fy > 1) return;

      const px = Math.floor(fx * hm.width);
      const py = Math.floor(fy * hm.height);  // py=0 là minY (bottom)
      const idx = py * hm.width + px;
      const z = hm.data[idx];
      if (!Number.isFinite(z)) return;

      const depthM = showFlood ? Math.max(0, waterLevel - z) : null;

      if (popupRef.current) popupRef.current.remove();
      popupRef.current = new maplibregl.Popup({ closeOnClick: true, maxWidth: '200px' })
        .setLngLat(e.lngLat)
        .setHTML(`
          <div style="font-size:12px;line-height:1.6">
            <b>Cao độ địa hình</b><br>
            <span style="font-size:18px;font-weight:700;color:#00E5CC">${z.toFixed(1)} m</span>
            ${depthM !== null && depthM > 0
              ? `<br><span style="color:#3B82F6">💧 Độ sâu ngập: <b>${depthM.toFixed(1)} m</b></span>`
              : (showFlood ? `<br><span style="color:#22C55E">✓ Trên mực nước (khô)</span>` : '')}
            <br><span style="font-size:10px;color:#888">${lat.toFixed(5)}°N, ${lng.toFixed(5)}°E</span>
          </div>`)
        .addTo(map);
    };

    map.on('click', onClick);
    return () => { map.off('click', onClick); };
  }, [showElevHeatmap, showFlood, waterLevel, mapReady, terrain, geo, gisDrawMode]);

  // ── Vẽ ranh giới Google Earth: click thêm điểm khi gisDrawMode bật ──────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !gisDrawMode) return;

    const onDrawClick = (e: maplibregl.MapMouseEvent) => {
      addGisDrawPoint({ lat: e.lngLat.lat, lon: e.lngLat.lng });
    };
    map.on('click', onDrawClick);
    map.getCanvas().style.cursor = 'crosshair';
    return () => {
      map.off('click', onDrawClick);
      map.getCanvas().style.cursor = '';
    };
  }, [gisDrawMode, mapReady, addGisDrawPoint]);

  // ── Render polygon ranh giới đang vẽ (GeoJSON line + fill + điểm) ───────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const SRC = 'gis-draw-src';
    const FILL = 'gis-draw-fill', LINE = 'gis-draw-line', PTS = 'gis-draw-points';
    const cleanup = () => {
      [FILL, LINE, PTS].forEach((id) => { if (map.getLayer(id)) map.removeLayer(id); });
      if (map.getSource(SRC)) map.removeSource(SRC);
    };
    if (!gisDrawMode || gisDrawPoints.length === 0) { cleanup(); return; }

    const ring = gisDrawPoints.map((p) => [p.lon, p.lat] as [number, number]);
    const closedRing = gisDrawPoints.length >= 3 ? [...ring, ring[0]] : ring;

    const features: GeoJSON.Feature[] = [
      { type: 'Feature', geometry: { type: 'LineString', coordinates: closedRing }, properties: {} },
      { type: 'Feature', geometry: { type: 'MultiPoint', coordinates: ring }, properties: {} },
    ];
    if (gisDrawPoints.length >= 3) {
      features.push({ type: 'Feature', geometry: { type: 'Polygon', coordinates: [closedRing] }, properties: {} });
    }
    const geojson: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features };

    if (map.getSource(SRC)) {
      (map.getSource(SRC) as maplibregl.GeoJSONSource).setData(geojson);
    } else {
      map.addSource(SRC, { type: 'geojson', data: geojson });
      map.addLayer({ id: FILL, type: 'fill', source: SRC, filter: ['==', '$type', 'Polygon'],
        paint: { 'fill-color': '#FBBF24', 'fill-opacity': 0.15 } });
      map.addLayer({ id: LINE, type: 'line', source: SRC, filter: ['==', '$type', 'LineString'],
        paint: { 'line-color': '#FBBF24', 'line-width': 2.5 } });
      map.addLayer({ id: PTS, type: 'circle', source: SRC, filter: ['==', '$type', 'Point'],
        paint: { 'circle-radius': 4, 'circle-color': '#FBBF24', 'circle-stroke-color': '#000', 'circle-stroke-width': 1 } });
    }
    return cleanup;
  }, [gisDrawMode, gisDrawPoints, mapReady]);

  /** Sinh terrain DEM từ polygon lat/lon (dùng chung cho draw-on-map và KML upload) */
  const generateFromBoundary = useCallback(async (points: { lat: number; lon: number }[]) => {
    setGenBusy(true);
    setError(null);
    try {
      const result = await buildTerrainFromBoundary(points, {
        onProgress: (msg) => setGenMsg(msg),
      });
      setTerrain(result);
      computeForMode(mode);
      cancelGisDraw();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Lỗi không xác định khi tạo địa hình từ ranh giới.');
    } finally {
      setGenBusy(false);
      setGenMsg('');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Toggle địa hình 3D (DEM exaggeration) - bật/tắt source terrain
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    if (terrain3D) {
      // Bật terrain — exaggeration 1.4 cho thấy rõ núi
      map.setTerrain({ source: 'terrain-dem', exaggeration: 1.4 });
    } else {
      map.setTerrain(null);
    }
  }, [terrain3D, mapReady]);

  // Fetch & render POI layer
  const togglePoi = useCallback(async (layer: PoiLayer) => {
    const map = mapRef.current;
    if (!map || !overpassBbox) return;

    const isActive = activePoi.has(layer.id);
    if (isActive) {
      // Tắt → xoá markers
      clearMarkers(layer.id);
      setActivePoi((s) => { const n = new Set(s); n.delete(layer.id); return n; });
      return;
    }

    // Bật → fetch Overpass
    setPoiLoading((s) => new Set(s).add(layer.id));
    try {
      const q = layer.overpassQuery.replace(/\{bbox\}/g, overpassBbox);
      const res = await fetch(`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(q)}`);
      if (!res.ok) throw new Error('Overpass error');
      const data = await res.json();
      const gj = overpassToGeoJSON(data);

      // Thêm markers
      gj.features.forEach((f) => {
        if (f.geometry.type !== 'Point') return;
        const [lng, lat] = (f.geometry as GeoJSON.Point).coordinates;
        const name = f.properties?.name ?? '';

        const el = document.createElement('div');
        el.style.cssText = `font-size:18px;cursor:pointer;filter:drop-shadow(0 1px 2px #000a)`;
        el.textContent = layer.markerEmoji;

        const popup = new maplibregl.Popup({ offset: 16, closeOnClick: false })
          .setHTML(`<div style="font-size:11px;max-width:140px"><b>${layer.label}</b><br>${name}</div>`);

        const marker = new maplibregl.Marker({ element: el })
          .setLngLat([lng, lat])
          .setPopup(popup)
          .addTo(map);

        (marker as maplibregl.Marker & { _layerId?: string })._layerId = layer.id;
        markersRef.current.push(marker);
      });

      setActivePoi((s) => new Set(s).add(layer.id));
    } catch (e) {
      console.warn('POI fetch failed:', e);
    } finally {
      setPoiLoading((s) => { const n = new Set(s); n.delete(layer.id); return n; });
    }
  }, [activePoi, overpassBbox, clearMarkers]);

  return (
    <div className="flex flex-col h-full relative">
      {/* ── Draw-boundary toolbar (chỉ hiện khi gisDrawMode bật) ── */}
      {gisDrawMode && (
        <div className="flex items-center gap-2 px-3 py-2 bg-amber-500/10 border-b border-amber-400/30 shrink-0 flex-wrap">
          <MapPin size={13} className="text-amber-400" />
          <span className="text-[11px] text-amber-300 font-semibold">
            Click bản đồ để vẽ ranh giới — {gisDrawPoints.length} điểm
          </span>
          <button
            onClick={undoGisDrawPoint}
            disabled={gisDrawPoints.length === 0 || genBusy}
            className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold border
                       border-white/15 text-slate-300 hover:bg-white/5 disabled:opacity-40 transition"
          >
            <Undo2 size={10} /> Xoá điểm cuối
          </button>
          <button
            onClick={() => generateFromBoundary(gisDrawPoints)}
            disabled={gisDrawPoints.length < 3 || genBusy}
            className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold border
                       border-accent-teal/50 bg-accent-teal/15 text-accent-teal hover:bg-accent-teal/25
                       disabled:opacity-40 transition"
          >
            <Check size={10} /> Hoàn tất & Tạo địa hình
          </button>
          <button
            onClick={cancelGisDraw}
            disabled={genBusy}
            className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold border
                       border-red-400/40 text-red-300 hover:bg-red-500/10 disabled:opacity-40 transition ml-auto"
          >
            <Ban size={10} /> Hủy vẽ
          </button>
        </div>
      )}

      {/* ── Toolbar ── */}
      <div className="flex items-center gap-2 px-3 py-2 bg-bg-panel border-b border-white/10 shrink-0 flex-wrap">
        {/* Base style toggle — 3 options */}
        <div className="flex rounded overflow-hidden border border-white/15 text-[10px] font-bold">
          <button
            onClick={() => setBaseStyle('satellite')}
            title="Ảnh vệ tinh ESRI World Imagery"
            className={`px-2 py-1 transition ${baseStyle === 'satellite' ? 'bg-accent-teal text-bg-dark' : 'text-slate-400 hover:text-slate-200'}`}
          >
            🛰 Vệ tinh
          </button>
          <button
            onClick={() => setBaseStyle('topo')}
            title="Bản đồ địa hình OpenTopoMap — có đường đồng mức"
            className={`px-2 py-1 transition border-l border-white/10 ${baseStyle === 'topo' ? 'bg-accent-teal text-bg-dark' : 'text-slate-400 hover:text-slate-200'}`}
          >
            🗺 Địa hình
          </button>
          <button
            onClick={() => setBaseStyle('carto')}
            title="Bản đồ nền sáng Carto Light — phù hợp overlay cao độ"
            className={`px-2 py-1 transition border-l border-white/10 ${baseStyle === 'carto' ? 'bg-accent-teal text-bg-dark' : 'text-slate-400 hover:text-slate-200'}`}
          >
            🗾 Bản đồ
          </button>
        </div>

        {/* Roads toggle */}
        <button
          onClick={() => setShowRoads((v) => !v)}
          className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold border transition
            ${showRoads ? 'bg-yellow-400/15 border-yellow-400/40 text-yellow-300' : 'border-white/15 text-slate-500 hover:text-slate-300'}`}
        >
          <Layers size={10} /> Đường
        </button>

        {/* ── 3D controls ── */}
        <button
          onClick={() => setTerrain3D((v) => !v)}
          title={terrain3D ? 'Tắt địa hình 3D' : 'Bật địa hình 3D (Mapzen DEM)'}
          className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold border transition
            ${terrain3D ? 'bg-purple-400/15 border-purple-400/40 text-purple-300' : 'border-white/15 text-slate-500 hover:text-slate-300'}`}
        >
          <Mountain size={10} /> Núi 3D
        </button>

        {/* Elevation Heatmap toggle — tô màu cao độ từ heightmap của file CAD */}
        <button
          onClick={() => setShowElevHeatmap((v) => !v)}
          title={showElevHeatmap
            ? 'Tắt lớp tô màu cao độ'
            : 'Bật lớp tô màu cao độ (gradient HSV rainbow theo Z của địa hình)'}
          className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold border transition
            ${showElevHeatmap
              ? 'bg-cyan-400/15 border-cyan-400/40 text-cyan-300'
              : 'border-white/15 text-slate-500 hover:text-slate-300'}`}
        >
          <Palette size={10} /> Cao độ
        </button>

        {/* Flood simulation toggle (floodmap.net style) */}
        <button
          onClick={() => setShowFlood((v) => !v)}
          title={showFlood ? 'Tắt mô phỏng ngập lụt' : 'Mô phỏng ngập lụt — kéo slider chọn mực nước'}
          className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold border transition
            ${showFlood
              ? 'bg-blue-400/15 border-blue-400/40 text-blue-300'
              : 'border-white/15 text-slate-500 hover:text-slate-300'}`}
        >
          <Waves size={10} /> Ngập lụt
        </button>

        {/* Water level slider — chỉ hiện khi flood đang bật */}
        {showFlood && terrain && (
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded border border-blue-400/30 bg-blue-500/10">
            <Waves size={10} className="text-blue-400" />
            <input
              type="range"
              min={Math.round(terrain.heightmap.minZ)}
              max={Math.round(terrain.heightmap.maxZ)}
              step={1}
              value={waterLevel}
              onChange={(e) => setWaterLevel(Number(e.target.value))}
              className="w-24 h-1 accent-blue-400"
              title={`Mực nước: ${waterLevel} m`}
            />
            <span className="text-[9px] text-blue-300 font-mono w-12 text-right shrink-0">{waterLevel} m</span>
          </div>
        )}

        {/* Pitch slider — chỉ hiện khi đã bật map ready */}
        {mapReady && (
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded border border-white/15">
            <Box size={10} className="text-slate-400" />
            <input
              type="range"
              min={0} max={75} step={1}
              value={pitch}
              onChange={(e) => setPitch(Number(e.target.value))}
              className="w-20 h-1 accent-accent-teal"
              title={`Nghiêng ${pitch}°`}
            />
            <span className="text-[9px] text-slate-400 font-mono w-7 text-right">{pitch}°</span>
            {pitch > 0 && (
              <button
                onClick={() => { setPitch(0); mapRef.current?.easeTo({ bearing: 0, duration: 300 }); }}
                title="Reset 2D"
                className="text-[9px] text-slate-500 hover:text-accent-teal"
              >
                ↺
              </button>
            )}
          </div>
        )}

        {/* POI toggles */}
        {POI_LAYERS.map((layer) => (
          <button
            key={layer.id}
            onClick={() => togglePoi(layer)}
            disabled={poiLoading.has(layer.id) || !geo}
            title={!geo ? 'Chọn tỉnh trước để load POI' : layer.label}
            className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold border transition
              ${activePoi.has(layer.id)
                ? 'border-current text-white'
                : 'border-white/15 text-slate-500 hover:text-slate-300'}`}
            style={activePoi.has(layer.id) ? { color: layer.color, borderColor: layer.color + '66', background: layer.color + '1A' } : {}}
          >
            {poiLoading.has(layer.id) ? <RefreshCw size={10} className="animate-spin" /> : layer.icon}
            {layer.label}
          </button>
        ))}

        {/* Location chip */}
        <div className="ml-auto flex items-center gap-1.5 text-[10px] shrink-0">
          {geo ? (
            <>
              <span className="text-accent-teal font-semibold">
                {geo.province.replace('Tỉnh ', '').replace('TP. ', '').replace('Thủ đô ', '')}
              </span>
              <span className="text-slate-600">·</span>
              <span className="text-slate-400">{geo.lat.toFixed(3)}°N {geo.lon.toFixed(3)}°E</span>
            </>
          ) : (
            <span className="text-amber-400/80">⚠ Chọn tỉnh bên phải để neo bản đồ đúng khu đất</span>
          )}
        </div>

        {/* Close */}
        <button onClick={onClose} className="text-slate-500 hover:text-slate-200 transition ml-1">
          <X size={15} />
        </button>
      </div>

      {/* ── Map container ── */}
      <div ref={mapContainer} className="flex-1 min-h-0" />

      {/* ── Loading overlay khi đang sinh terrain từ DEM ── */}
      {genBusy && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-bg-base/70 backdrop-blur-sm">
          <div className="px-6 py-4 panel rounded-lg flex items-center gap-3">
            <div className="w-3 h-3 rounded-full bg-accent-teal animate-pulse" />
            <span className="text-slate-200 text-sm">{genMsg || 'Đang tạo địa hình…'}</span>
          </div>
        </div>
      )}

      {/* ── Elevation legend (topographic-map.com style) — hiện khi showElevHeatmap ── */}
      {showElevHeatmap && terrain && (() => {
        const { minZ, maxZ } = terrain.heightmap;
        const steps = 20;
        return (
          <div className="absolute top-14 right-2 z-20 flex flex-col gap-0 rounded-md overflow-hidden
                          shadow-lg border border-white/15 select-none pointer-events-none text-[9px]"
               style={{ background: 'rgba(16,24,36,0.88)' }}>
            <div className="px-2 py-1 text-center text-slate-400 font-bold border-b border-white/10 text-[9px]">Cao độ (m)</div>
            {Array.from({ length: steps + 1 }, (_, i) => {
              const t = 1 - i / steps; // top=max, bottom=min
              const z = minZ + t * (maxZ - minZ);
              const [r, g, b] = getElevHeatmapColor(t);
              const textColor = t > 0.35 && t < 0.75 ? '#000' : '#fff';
              return (
                <div key={i}
                     style={{ background: `rgba(${r},${g},${b},0.85)`, color: textColor }}
                     className="px-2 py-[1.5px] font-mono text-right w-16">
                  {z.toFixed(0)}
                </div>
              );
            })}
          </div>
        );
      })()}

      {/* ── Flood legend ── */}
      {showFlood && (
        <div className="absolute top-14 right-2 z-20 rounded-md px-2 py-1.5 text-[9.5px]
                        bg-bg-dark/90 border border-blue-400/30 pointer-events-none shadow-lg">
          <div className="text-blue-300 font-bold mb-1">💧 Mực nước: {waterLevel} m</div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded" style={{background:'rgba(0,100,220,0.7)'}} />
            <span className="text-slate-400">Vùng ngập</span>
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="w-3 h-3 rounded" style={{background:'rgba(0,60,180,0.9)'}} />
            <span className="text-slate-400">Ngập sâu</span>
          </div>
          <div className="text-slate-600 mt-1 text-[8.5px]">Click bản đồ → xem độ sâu</div>
        </div>
      )}

      {/* Gợi ý click khi overlay bật */}
      {(showElevHeatmap || showFlood) && (
        <div className="absolute bottom-14 left-1/2 -translate-x-1/2 z-20 px-3 py-1 rounded-full
                        bg-bg-dark/80 border border-white/10 text-[9px] text-slate-400 pointer-events-none
                        backdrop-blur">
          🖱 Click vào bản đồ để xem cao độ tại điểm
        </div>
      )}

      {/* Chú thích khu đất — chỉ hiện khi đã có terrain (DXF hoặc DEM) */}
      {terrain && !gisDrawMode && (
        <div className="absolute bottom-8 left-3 z-10 flex items-center gap-2 px-2 py-1 rounded-md
                        bg-bg-dark/80 backdrop-blur border border-white/10 text-[10px] pointer-events-none">
          <span className="w-5 h-0.5 rounded" style={{ background: '#00E5CC', border: '1px dashed #00E5CC' }} />
          <span className="text-slate-300">Ranh giới khu đất</span>
          <span className="text-slate-600 ml-1">·</span>
          <span className="text-slate-400">Bán kính POI ~3 km</span>
        </div>
      )}

      {/* Gợi ý khi chưa có terrain và không ở chế độ vẽ — hướng dẫn cách bắt đầu */}
      {!terrain && !gisDrawMode && (
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10 px-3 py-1.5 rounded-md
                        bg-bg-dark/85 backdrop-blur border border-white/10 text-[10.5px] text-slate-300 pointer-events-none">
          Chưa có địa hình — dùng nút <b className="text-amber-300">"Vẽ ranh giới trên bản đồ"</b> hoặc
          {' '}<b className="text-amber-300">"Tải KML/KMZ ranh giới"</b> ở Sidebar mục Quản lý dự án
        </div>
      )}
    </div>
  );
}
