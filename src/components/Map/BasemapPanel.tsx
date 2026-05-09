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
import { School, Hospital, Building2, ShoppingBag, Droplets, X, Layers, RefreshCw, Mountain, Box } from 'lucide-react';

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

  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef       = useRef<maplibregl.Map | null>(null);
  const markersRef   = useRef<maplibregl.Marker[]>([]);

  const [activePoi, setActivePoi] = useState<Set<string>>(new Set());
  const [poiLoading, setPoiLoading] = useState<Set<string>>(new Set());
  const [showRoads, setShowRoads]   = useState(true);
  const [mapReady, setMapReady]     = useState(false);
  const [baseStyle, setBaseStyle]   = useState<'satellite' | 'map'>('satellite');
  const [pitch, setPitch]           = useState(0);
  const [terrain3D, setTerrain3D]   = useState(false);

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
    if (!terrain) return;

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

  // Toggle base style (satellite / map)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    map.setLayoutProperty('satellite-tiles', 'visibility', baseStyle === 'satellite' ? 'visible' : 'none');
  }, [baseStyle, mapReady]);

  // Đồng bộ pitch slider với map.pitch
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    map.easeTo({ pitch, duration: 300 });
  }, [pitch, mapReady]);

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

  if (!terrain) {
    return (
      <div className="flex-1 flex items-center justify-center bg-bg-dark">
        <p className="text-slate-500 text-sm">Tải file CAD trước để xem bản đồ địa lý</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full relative">
      {/* ── Toolbar ── */}
      <div className="flex items-center gap-2 px-3 py-2 bg-bg-panel border-b border-white/10 shrink-0 flex-wrap">
        {/* Base style toggle */}
        <div className="flex rounded overflow-hidden border border-white/15 text-[10px] font-bold">
          <button
            onClick={() => setBaseStyle('satellite')}
            className={`px-2 py-1 transition ${baseStyle === 'satellite' ? 'bg-accent-teal text-bg-dark' : 'text-slate-400 hover:text-slate-200'}`}
          >
            Vệ tinh
          </button>
          <button
            onClick={() => setBaseStyle('map')}
            className={`px-2 py-1 transition ${baseStyle === 'map' ? 'bg-accent-teal text-bg-dark' : 'text-slate-400 hover:text-slate-200'}`}
          >
            Bản đồ
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

      {/* Chú thích khu đất */}
      <div className="absolute bottom-8 left-3 z-10 flex items-center gap-2 px-2 py-1 rounded-md
                      bg-bg-dark/80 backdrop-blur border border-white/10 text-[10px] pointer-events-none">
        <span className="w-5 h-0.5 rounded" style={{ background: '#00E5CC', border: '1px dashed #00E5CC' }} />
        <span className="text-slate-300">Ranh giới khu đất</span>
        <span className="text-slate-600 ml-1">·</span>
        <span className="text-slate-400">Bán kính POI ~3 km</span>
      </div>
    </div>
  );
}
