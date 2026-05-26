// File: components/map/CityMap.tsx
'use client';

/**
 * CityMap — Mapbox GL JS 3D city engine.
 *
 * Features
 *  ─ Dark Mapbox base map
 *  ─ 3D building extrusions with depth-graded colour
 *  ─ Cinematic fly-in from altitude to street level
 *  ─ Temperature heatmap   (real Open-Meteo data, 14 district points)
 *  ─ Air-quality heatmap   (real Open-Meteo air quality data, 14 district points)
 *  ─ IoT sensor markers    (toggle)
 *  ─ Traffic congestion    (real Mapbox traffic-v1 tileset)
 *  ─ Custom dark popup on sensor click
 */

import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import type { LayerState, LayerId, SensorLocation } from '@/types/map';
import type { ExpressionSpecification, LayerSpecification } from 'mapbox-gl';
import { fetchTrafficCurrent, congestionColor, type BackendLocation } from '@/services/backendApi';

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? '';
 *  ─ Premium Mapbox styles  (dark / satellite-streets / navigation-night)
 *  ─ 3D building extrusions from Mapbox composite source
 *  ─ Cinematic fly-in animation on load
 *  ─ Temperature heatmap        (toggle)
 *  ─ Air-quality heatmap        (toggle)
 *  ─ IoT sensor markers         (toggle) + click popup
 *  ─ Traffic flow lines         (toggle)
 *  ─ Live weather radar tiles   (toggle) via RainViewer free API
 *  ─ Geocoding fly-to           (searchResult prop)
 *  ─ Driving directions route   (directionsRequest prop)
 *
 * Requires: NEXT_PUBLIC_MAPBOX_TOKEN in .env.local
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import type {
  LayerState, LayerId, MapStyle,
  SensorLocation, GeocoderResult, DirectionsRequest,
} from '@/types/map';
import { MAPBOX_STYLES } from '@/types/map';

// ── Mapbox token ──────────────────────────────────────────────────────────────
const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? '';
mapboxgl.accessToken = TOKEN;

// ── Constants ─────────────────────────────────────────────────────────────────
const BANGALORE: [number, number] = [77.5946, 12.9716];
const MAP_STYLE = 'mapbox://styles/mapbox/dark-v11';

// 14 Bangalore district sample coordinates for Open-Meteo fetches
const DISTRICT_POINTS = [
  { lat: 12.9342, lng: 77.6268 }, // Koramangala
  { lat: 12.9762, lng: 77.6033 }, // MG Road
  { lat: 12.9174, lng: 77.6226 }, // Silk Board
  { lat: 12.9591, lng: 77.6974 }, // Marathahalli
  { lat: 12.8458, lng: 77.6603 }, // Electronic City
  { lat: 13.0250, lng: 77.5500 }, // Yeshwanthpur
  { lat: 12.9250, lng: 77.5938 }, // Jayanagar
  { lat: 12.9716, lng: 77.5946 }, // City Centre
  { lat: 12.9010, lng: 77.6855 }, // Sarjapur
  { lat: 13.0358, lng: 77.5972 }, // Hebbal
  { lat: 13.1007, lng: 77.5963 }, // Yelahanka
  { lat: 12.9784, lng: 77.6408 }, // Indiranagar
  { lat: 12.9166, lng: 77.6101 }, // BTM Layout
  { lat: 12.9254, lng: 77.5468 }, // Banashankari
];

// ── Sensor data ───────────────────────────────────────────────────────────────
const SENSORS: SensorLocation[] = [
  { id: 's01', name: 'Koramangala Hub',  lat: 12.9342, lng: 77.6268, type: 'traffic', value: 87,  status: 'online'  },
  { id: 's02', name: 'MG Road Monitor', lat: 12.9762, lng: 77.6033, type: 'air',     value: 142, status: 'warning' },
  { id: 's03', name: 'Electronic City', lat: 12.8458, lng: 77.6603, type: 'smart',   value: 43,  status: 'online'  },
  { id: 's04', name: 'Whitefield IoT',  lat: 12.9698, lng: 77.7499, type: 'smart',   value: 92,  status: 'online'  },
  { id: 's05', name: 'Hebbal Node',     lat: 13.0358, lng: 77.5972, type: 'traffic', value: 78,  status: 'online'  },
  { id: 's06', name: 'Indiranagar AQI', lat: 12.9784, lng: 77.6408, type: 'air',     value: 156, status: 'warning' },
  { id: 's07', name: 'Silk Board',      lat: 12.9174, lng: 77.6226, type: 'traffic', value: 95,  status: 'warning' },
  { id: 's08', name: 'Bellandur Lake',  lat: 12.9305, lng: 77.6719, type: 'water',   value: 28,  status: 'online'  },
  { id: 's09', name: 'Yelahanka',       lat: 13.1007, lng: 77.5963, type: 'smart',   value: 15,  status: 'online'  },
  { id: 's10', name: 'Jayanagar',       lat: 12.9250, lng: 77.5938, type: 'air',     value: 89,  status: 'online'  },
  { id: 's11', name: 'BTM Layout',      lat: 12.9166, lng: 77.6101, type: 'traffic', value: 73,  status: 'online'  },
  { id: 's12', name: 'Marathahalli',    lat: 12.9591, lng: 77.6974, type: 'traffic', value: 88,  status: 'online'  },
  { id: 's13', name: 'Banashankari',    lat: 12.9254, lng: 77.5468, type: 'air',     value: 67,  status: 'online'  },
  { id: 's14', name: 'Rajajinagar',     lat: 12.9902, lng: 77.5509, type: 'smart',   value: 55,  status: 'online'  },
  { id: 's15', name: 'Yeshwanthpur',    lat: 13.0250, lng: 77.5500, type: 'traffic', value: 82,  status: 'online'  },
  { id: 's16', name: 'KR Puram',        lat: 13.0086, lng: 77.6938, type: 'traffic', value: 91,  status: 'warning' },
  { id: 's17', name: 'HSR Layout',      lat: 12.9116, lng: 77.6474, type: 'smart',   value: 61,  status: 'online'  },
  { id: 's18', name: 'Sarjapur Rd',     lat: 12.9010, lng: 77.6855, type: 'air',     value: 110, status: 'online'  },
];

// ── Real data fetchers (Open-Meteo, free, no key) ─────────────────────────────

async function fetchTemperatureHeatmap(): Promise<GeoJSON.FeatureCollection> {
  const results = await Promise.all(
    DISTRICT_POINTS.map(d =>
      fetch(
        `https://api.open-meteo.com/v1/forecast` +
        `?latitude=${d.lat}&longitude=${d.lng}` +
        `&current=temperature_2m&timezone=Asia%2FKolkata`,
      )
        .then(r => r.json())
        .then(j => ({ ...d, temp: j.current?.temperature_2m as number ?? 32 }))
        .catch(() => ({ ...d, temp: 32 })),
    ),
  );

  const temps = results.map(r => r.temp);
  const min   = Math.min(...temps);
  const max   = Math.max(...temps);
  const range = max - min || 1;

  return {
    type: 'FeatureCollection',
    features: results.map(r => ({
      type:     'Feature',
      geometry: { type: 'Point', coordinates: [r.lng, r.lat] },
      properties: {
        temperature: r.temp,
        weight:      (r.temp - min) / range,  // 0–1 normalised
      },
    })),
  };
}

async function fetchAqiHeatmap(): Promise<GeoJSON.FeatureCollection> {
  // /api/waqi fetches real CPCB ground-station AQI from WAQI for 10 Bangalore stations.
  const res = await fetch('/api/waqi');
  if (!res.ok) throw new Error('WAQI proxy error');

  const json     = await res.json();
  const stations = json.stations as Array<{ lat: number; lng: number; name: string; aqi: number }>;

  if (!stations?.length) throw new Error('No WAQI stations');

  const values = stations.map(s => s.aqi);
  const min    = Math.min(...values);
  const max    = Math.max(...values);
  const range  = max - min || 1;

  return {
    type: 'FeatureCollection',
    features: stations.map(s => ({
      type:     'Feature',
      geometry: { type: 'Point', coordinates: [s.lng, s.lat] },
      properties: { aqi: s.aqi, name: s.name, weight: (s.aqi - min) / range },
    })),
  };
}


// ── Empty GeoJSON placeholder (used while real data loads) ────────────────────

const EMPTY_FC: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

// ── Helper — first symbol layer id ───────────────────────────────────────────

function firstSymbolLayer(map: mapboxgl.Map): string | undefined {
  for (const layer of map.getStyle().layers ?? []) {
    if (layer.type === 'symbol') return layer.id;
  }
  return undefined;
}
const TRAFFIC_ROUTES: { name: string; intensity: number; coords: [number, number][] }[] = [
  { name: 'Outer Ring Road', intensity: 0.90, coords: [[77.6015,12.9343],[77.6174,12.9277],[77.6358,12.9284],[77.6504,12.9338],[77.6614,12.9447],[77.6698,12.9591],[77.6749,12.9698],[77.6719,12.9838],[77.6604,12.9968],[77.6442,13.0077]] },
  { name: 'Whitefield Rd',   intensity: 0.70, coords: [[77.6033,12.9762],[77.6199,12.9727],[77.6389,12.9699],[77.6622,12.9698],[77.6812,12.9700],[77.7099,12.9699],[77.7499,12.9698]] },
  { name: 'NH44 North',      intensity: 0.80, coords: [[77.5946,12.9716],[77.5946,13.0000],[77.5946,13.0500],[77.5972,13.0800],[77.5963,13.1007]] },
  { name: 'NH44 South',      intensity: 0.85, coords: [[77.5946,12.9716],[77.5946,12.9200],[77.5946,12.8700],[77.5946,12.8458]] },
  { name: 'Hosur Road',      intensity: 0.75, coords: [[77.5946,12.9716],[77.6050,12.9400],[77.6200,12.9100],[77.6350,12.8800],[77.6603,12.8458]] },
  { name: 'Tumkur Road',     intensity: 0.65, coords: [[77.5946,12.9716],[77.5750,13.0000],[77.5550,13.0300],[77.5300,13.0600]] },
  { name: 'MG Road',         intensity: 0.70, coords: [[77.5946,12.9716],[77.6033,12.9762],[77.6150,12.9780],[77.6350,12.9730]] },
  { name: 'Bannerghatta Rd', intensity: 0.60, coords: [[77.5946,12.9716],[77.5938,12.9250],[77.5900,12.8900],[77.5940,12.8600]] },
  { name: 'Airport Road',    intensity: 0.55, coords: [[77.6033,12.9762],[77.6112,12.9880],[77.6050,13.0100],[77.5990,13.0350],[77.5972,13.0500]] },
];

// ── Heatmap data generators ───────────────────────────────────────────────────
type Hotspot = { lat: number; lng: number; base: number; radius: number; count?: number };

function buildHeatmap(hotspots: Hotspot[], prop: string): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  for (const s of hotspots) {
    const n = s.count ?? 60;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = Math.sqrt(Math.random()) * s.radius;
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [s.lng + Math.cos(a) * d, s.lat + Math.sin(a) * d] },
        properties: { [prop]: s.base + (Math.random() - 0.5) * s.base * 0.12, weight: Math.max(0, 1 - d / s.radius * 0.6) },
      });
    }
  }
  return { type: 'FeatureCollection', features };
}

const TEMP_DATA = buildHeatmap([
  { lat: 12.9342, lng: 77.6268, base: 34, radius: 0.040 },
  { lat: 12.9762, lng: 77.6033, base: 33, radius: 0.030 },
  { lat: 12.9174, lng: 77.6226, base: 35, radius: 0.025 },
  { lat: 12.9591, lng: 77.6974, base: 33, radius: 0.040 },
  { lat: 12.8458, lng: 77.6603, base: 32, radius: 0.050 },
  { lat: 13.0250, lng: 77.5500, base: 31, radius: 0.040 },
  { lat: 12.9250, lng: 77.5938, base: 29, radius: 0.055 },
  { lat: 12.9716, lng: 77.5946, base: 32, radius: 0.060 },
], 'temperature');

const POLL_DATA = buildHeatmap([
  { lat: 12.9174, lng: 77.6226, base: 180, radius: 0.035 },
  { lat: 12.9762, lng: 77.6033, base: 155, radius: 0.025 },
  { lat: 12.9591, lng: 77.6974, base: 145, radius: 0.030 },
  { lat: 13.0358, lng: 77.5972, base: 130, radius: 0.040 },
  { lat: 12.9166, lng: 77.6101, base: 120, radius: 0.030 },
  { lat: 12.9784, lng: 77.6408, base: 135, radius: 0.025 },
  { lat: 12.9250, lng: 77.5938, base: 70,  radius: 0.055 },
  { lat: 13.1007, lng: 77.5963, base: 65,  radius: 0.040 },
  { lat: 12.8458, lng: 77.6603, base: 90,  radius: 0.050 },
], 'aqi');

const SENSOR_FC: GeoJSON.FeatureCollection = {
  type: 'FeatureCollection',
  features: SENSORS.map(s => ({
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [s.lng, s.lat] },
    properties: { id: s.id, name: s.name, type: s.type, value: s.value, status: s.status },
  })),
};

const TRAFFIC_FC: GeoJSON.FeatureCollection = {
  type: 'FeatureCollection',
  features: TRAFFIC_ROUTES.map(r => ({
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: r.coords },
    properties: { name: r.name, intensity: r.intensity },
  })),
};

// ── Layer group map ───────────────────────────────────────────────────────────
const LAYER_GROUPS: Record<LayerId, string[]> = {
  temperature: ['temperature-heat'],
  pollution:   ['pollution-heat'],
  sensors:     ['sensors-glow', 'sensors-dot', 'sensors-label'],
  traffic:     ['traffic-glow', 'traffic-line'],
  weather:     ['weather-radar'],
};

// ── Popup HTML ────────────────────────────────────────────────────────────────
function sensorHtml(p: Record<string, unknown>): string {
  const typeLabel: Record<string, string> = { traffic:'🚦 Traffic', air:'🌬 Air Quality', smart:'📡 Smart', water:'💧 Water' };
  const col = p.status === 'warning' ? '#FF7722' : p.status === 'offline' ? '#FF4444' : '#00EEFF';
  return `<div style="font-family:ui-monospace,'Space Mono',monospace;font-size:11px;color:#f0f0f2;min-width:170px">
    <div style="font-weight:600;color:#00EEFF;margin-bottom:6px;font-size:12px">${p.name}</div>
    <div style="opacity:.55;margin-bottom:8px;font-size:10px">${typeLabel[String(p.type)] ?? p.type}</div>
    <div style="display:flex;justify-content:space-between;align-items:center">
      <span style="opacity:.7">Value&nbsp;<b style="color:#fff">${p.value}</b></span>
      <span style="color:${col};font-size:9px;text-transform:uppercase;letter-spacing:.08em;border:1px solid ${col}40;border-radius:3px;padding:1px 5px">${p.status}</span>
    </div>
  </div>`;
}

// ── Component ─────────────────────────────────────────────────────────────────
interface CityMapProps {
  activeLayers:      LayerState;
  mapStyle:          MapStyle;
  searchResult:      GeocoderResult | null;
  directionsRequest: DirectionsRequest | null;
}

export default function CityMap({ activeLayers, mapStyle, searchResult, directionsRequest }: CityMapProps) {
  const containerRef    = useRef<HTMLDivElement>(null);
  const mapRef          = useRef<mapboxgl.Map | null>(null);
  const popupRef        = useRef<mapboxgl.Popup | null>(null);
  const markerRef       = useRef<mapboxgl.Marker | null>(null);
  const originMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const destMarkerRef   = useRef<mapboxgl.Marker | null>(null);
  const activeLayersRef = useRef(activeLayers);
  const [styleLoaded, setStyleLoaded] = useState(false);

  // Keep ref in sync
  activeLayersRef.current = activeLayers;

  // ── addAllLayers: called on every style load (initial + style switch) ───────
  const addAllLayers = useCallback((map: mapboxgl.Map) => {

    // ── 3D buildings (Mapbox composite source) ──────────────────────────────
    // Insert below the first label layer so labels remain on top
    let labelLayerId: string | undefined;
    for (const layer of map.getStyle().layers) {
      if (layer.type === 'symbol') { labelLayerId = layer.id; break; }
    }

    try {
      map.addLayer({
        id: '3d-buildings',
        source: 'composite',
        'source-layer': 'building',
        filter: ['==', 'extrude', 'true'],
        type: 'fill-extrusion',
        minzoom: 13,
        paint: {
          'fill-extrusion-color': [
            'interpolate', ['linear'], ['get', 'height'],
            0, '#0d1117', 40, '#131d2b', 100, '#1a2840', 250, '#1e3060',
          ],
          'fill-extrusion-height': ['interpolate', ['linear'], ['zoom'], 13, 0, 13.5, ['get', 'height']],
          'fill-extrusion-base':   ['interpolate', ['linear'], ['zoom'], 13, 0, 13.5, ['get', 'min_height']],
          'fill-extrusion-opacity': ['interpolate', ['linear'], ['zoom'], 13, 0, 14, 0.88],
        },
      }, labelLayerId);
    } catch { /* style may not have composite source (e.g. satellite) */ }

    // ── Temperature heatmap ─────────────────────────────────────────────────
    map.addSource('src-temperature', { type: 'geojson', data: TEMP_DATA });
    map.addLayer({
      id: 'temperature-heat', type: 'heatmap', source: 'src-temperature',
      paint: {
        'heatmap-weight':    ['get', 'weight'],
        'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 9, 1, 14, 3],
        'heatmap-radius':    ['interpolate', ['linear'], ['zoom'], 9, 22, 14, 44],
        'heatmap-opacity':   0.72,
        'heatmap-color': ['interpolate', ['linear'], ['heatmap-density'],
          0, 'rgba(0,0,0,0)', 0.15, 'rgba(0,100,220,0)',
          0.35, 'rgba(0,220,255,0.45)', 0.55, 'rgba(0,255,180,0.65)',
          0.75, 'rgba(255,200,0,0.75)', 0.9, 'rgba(255,80,0,0.85)',
          1, 'rgba(255,0,0,0.92)'],
      },
      layout: { visibility: 'none' },
    });

    // ── Pollution heatmap ───────────────────────────────────────────────────
    map.addSource('src-pollution', { type: 'geojson', data: POLL_DATA });
    map.addLayer({
      id: 'pollution-heat', type: 'heatmap', source: 'src-pollution',
      paint: {
        'heatmap-weight':    ['get', 'weight'],
        'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 9, 1, 14, 2.5],
        'heatmap-radius':    ['interpolate', ['linear'], ['zoom'], 9, 26, 14, 50],
        'heatmap-opacity':   0.68,
        'heatmap-color': ['interpolate', ['linear'], ['heatmap-density'],
          0, 'rgba(0,0,0,0)', 0.2, 'rgba(0,200,50,0)',
          0.4, 'rgba(100,200,0,0.45)', 0.6, 'rgba(220,200,0,0.65)',
          0.8, 'rgba(220,100,0,0.78)', 1, 'rgba(190,20,0,0.92)'],
      },
      layout: { visibility: 'none' },
    });

    // ── Smart sensors ───────────────────────────────────────────────────────
    const statusCol = ['match', ['get', 'status'], 'warning', '#FF7722', 'offline', '#FF4444', '#00EEFF'] as mapboxgl.Expression;
    map.addSource('src-sensors', { type: 'geojson', data: SENSOR_FC });
    map.addLayer({ id: 'sensors-glow',  type: 'circle', source: 'src-sensors', paint: { 'circle-radius': 20, 'circle-color': statusCol, 'circle-opacity': 0.12, 'circle-blur': 1.2 }, layout: { visibility: 'visible' } });
    map.addLayer({ id: 'sensors-dot',   type: 'circle', source: 'src-sensors', paint: { 'circle-radius': 6, 'circle-color': statusCol, 'circle-opacity': 0.92, 'circle-stroke-width': 1.5, 'circle-stroke-color': 'rgba(255,255,255,0.25)' }, layout: { visibility: 'visible' } });
    map.addLayer({ id: 'sensors-label', type: 'symbol', source: 'src-sensors', minzoom: 12,
      layout: { 'text-field': ['get', 'name'], 'text-size': 10, 'text-offset': [0, 1.3], 'text-anchor': 'top', visibility: 'visible' },
      paint:  { 'text-color': '#00EEFF', 'text-halo-color': 'rgba(0,0,0,0.95)', 'text-halo-width': 2 },
    });

function backendTrafficPopupHtml(loc: BackendLocation): string {
  const col = congestionColor(loc.congestion_level);
  const congStr = loc.congestion_level !== null ? `${loc.congestion_level.toFixed(0)}/100` : '—';
  const speedStr = loc.avg_speed_kmh !== null ? `${loc.avg_speed_kmh.toFixed(1)} km/h` : '—';
  const vehicleStr = loc.vehicle_count !== null ? loc.vehicle_count.toLocaleString('en-IN') : '—';
  const tsStr = loc.timestamp
    ? new Date(loc.timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
    : '—';
  return `
    <div style="
      font-family: ui-monospace, 'Space Mono', monospace;
      font-size: 11px; color: #f0f0f2; min-width: 180px;
    ">
      <div style="font-weight:600; color:${col}; margin-bottom:4px; font-size:12px;">
        ${loc.name}
      </div>
      <div style="opacity:0.45; margin-bottom:10px; font-size:9px; letter-spacing:0.15em; text-transform:uppercase;">
        Decision Engine · Backend
      </div>
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px 12px;">
        <div>
          <div style="opacity:0.4; font-size:8px; letter-spacing:0.2em; text-transform:uppercase; margin-bottom:2px;">Congestion</div>
          <div style="color:${col}; font-size:14px; font-weight:600;">${congStr}</div>
        </div>
        <div>
          <div style="opacity:0.4; font-size:8px; letter-spacing:0.2em; text-transform:uppercase; margin-bottom:2px;">Avg Speed</div>
          <div style="color:#f0f0f2; font-size:13px; font-weight:500;">${speedStr}</div>
        </div>
        <div>
          <div style="opacity:0.4; font-size:8px; letter-spacing:0.2em; text-transform:uppercase; margin-bottom:2px;">Vehicles</div>
          <div style="color:#f0f0f2; font-size:13px; font-weight:500;">${vehicleStr}</div>
        </div>
        <div>
          <div style="opacity:0.4; font-size:8px; letter-spacing:0.2em; text-transform:uppercase; margin-bottom:2px;">Updated</div>
          <div style="color:#f0f0f2; font-size:11px; opacity:0.6;">${tsStr}</div>
        </div>
      </div>
    </div>`;
}

function sensorPopupHtml(props: Record<string, unknown>): string {
  const typeLabel: Record<string, string> = {
    traffic: '🚦 Traffic', air: '🌬 Air Quality', smart: '📡 Smart', water: '💧 Water',
    // ── Traffic flow ────────────────────────────────────────────────────────
    const lineCol = ['interpolate', ['linear'], ['get', 'intensity'], 0, '#00EEFF', 0.5, '#00FF88', 0.8, '#FF7722', 1, '#FF3300'] as mapboxgl.Expression;
    map.addSource('src-traffic', { type: 'geojson', data: TRAFFIC_FC });
    map.addLayer({ id: 'traffic-glow', type: 'line', source: 'src-traffic', layout: { 'line-join': 'round', 'line-cap': 'round', visibility: 'visible' }, paint: { 'line-color': lineCol, 'line-width': 14, 'line-opacity': 0.14, 'line-blur': 5 } });
    map.addLayer({ id: 'traffic-line', type: 'line', source: 'src-traffic', layout: { 'line-join': 'round', 'line-cap': 'round', visibility: 'visible' }, paint: { 'line-color': lineCol, 'line-width': 2.5, 'line-opacity': 0.88 } });

    // ── Weather radar (RainViewer free API) ─────────────────────────────────
    // Fetch the latest available radar timestamp, then add as raster tiles
    fetch('https://api.rainviewer.com/public/weather-maps.json')
      .then(r => r.json())
      .then((data: { radar: { past: { time: number }[] } }) => {
        if (!mapRef.current) return;
        const ts = data.radar.past[data.radar.past.length - 1].time;
        if (mapRef.current.getSource('src-weather')) {
          // Already added on a previous style-load; skip
          return;
        }
        map.addSource('src-weather', {
          type:        'raster',
          tiles:       [`https://tilecache.rainviewer.com/v2/radar/${ts}/256/{z}/{x}/{y}/4/1_1.png`],
          tileSize:    256,
          attribution: '© RainViewer',
        });
        map.addLayer({
          id: 'weather-radar', type: 'raster', source: 'src-weather',
          paint: { 'raster-opacity': 0.65 },
          layout: { visibility: 'none' },
        });
        // Re-apply active layer visibility in case weather was toggled
        syncVisibility(map);
      })
      .catch(() => {/* offline — skip radar */});

    // ── Directions route placeholder ────────────────────────────────────────
    map.addSource('src-directions', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    });
    map.addLayer({ id: 'directions-casing', type: 'line', source: 'src-directions', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': '#FFFFFF', 'line-width': 8, 'line-opacity': 0.15 } });
    map.addLayer({ id: 'directions-line',   type: 'line', source: 'src-directions', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': '#00EEFF', 'line-width': 4, 'line-opacity': 0.9 } });

    // Apply current layer visibility state
    syncVisibility(map);
  }, []);

  // ── Sync visibility from ref ──────────────────────────────────────────────
  const syncVisibility = (map: mapboxgl.Map) => {
    for (const [id, visible] of Object.entries(activeLayersRef.current)) {
      for (const lyr of LAYER_GROUPS[id as LayerId] ?? []) {
        if (map.getLayer(lyr)) map.setLayoutProperty(lyr, 'visibility', visible ? 'visible' : 'none');
      }
    }
  };

// ── Component ─────────────────────────────────────────────────────────────────

interface CityMapProps {
  activeLayers: LayerState;
}

export default function CityMap({ activeLayers }: CityMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef       = useRef<mapboxgl.Map | null>(null);
  const popupRef     = useRef<mapboxgl.Popup | null>(null);
  const [loaded, setLoaded] = useState(false);

  // ── Initialise map (once) ──────────────────────────────────────────────────
  // ── Init map once ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    if (!TOKEN) {
      console.error('[CityMap] NEXT_PUBLIC_MAPBOX_TOKEN is not set.');
      return;
    }

    const map = new mapboxgl.Map({
      container:    containerRef.current,
      style:        MAP_STYLE,
      center:       BANGALORE,
      zoom:         9,
      pitch:        20,
      bearing:      0,
      antialias:    true,
      attributionControl: false,
    });

    map.addControl(
      new mapboxgl.AttributionControl({ compact: true }),
      'bottom-left',
    );
    map.addControl(
      new mapboxgl.NavigationControl({ visualizePitch: true }),
      'bottom-right',
    );
      container:  containerRef.current,
      style:      MAPBOX_STYLES.dark,
      center:     BANGALORE,
      zoom:       9,
      pitch:      20,
      bearing:    0,
      antialias:  true,
      attributionControl: false,
    });

    map.addControl(new mapboxgl.AttributionControl({ compact: true }), 'bottom-left');
    map.addControl(new mapboxgl.NavigationControl({ visualizePitch: true }), 'bottom-right');

    mapRef.current = map;
    let firstLoad = true;

    map.on('style.load', () => {
      addAllLayers(map);
      setStyleLoaded(s => !s); // trigger visibility sync

      if (firstLoad) {
        firstLoad = false;

        // Sensor popup
        map.on('click', 'sensors-dot', e => {
          if (!e.features?.[0]) return;
          const props = e.features[0].properties as Record<string, unknown>;
          const coord = (e.features[0].geometry as GeoJSON.Point).coordinates as [number, number];
          popupRef.current?.remove();
          popupRef.current = new mapboxgl.Popup({ offset: 12, closeButton: true, maxWidth: '240px', className: 'syncity-popup' })
            .setLngLat(coord).setHTML(sensorHtml(props)).addTo(map);
        });
        map.on('mouseenter', 'sensors-dot', () => { map.getCanvas().style.cursor = 'pointer'; });
        map.on('mouseleave', 'sensors-dot', () => { map.getCanvas().style.cursor = ''; });

    map.on('load', () => {
      const beforeId = firstSymbolLayer(map);

      // ── 3D buildings ───────────────────────────────────────────────────────
      try {
        const heightExpr: ExpressionSpecification = [
          'interpolate', ['linear'], ['zoom'],
          13,   0,
          13.5, ['coalesce', ['get', 'height'], 12],
        ];
        const baseExpr: ExpressionSpecification = [
          'interpolate', ['linear'], ['zoom'],
          13,   0,
          13.5, ['coalesce', ['get', 'min_height'], 0],
        ];
        const colourExpr: ExpressionSpecification = [
          'interpolate', ['linear'],
          ['coalesce', ['get', 'height'], 0],
          0,   '#fdf3c0',
          20,  '#f9e87a',
          60,  '#f5d84a',
          150, '#e8c62a',
        ];

        const buildingLayer: LayerSpecification = {
          id:             '3d-buildings',
          source:         'composite',
          'source-layer': 'building',
          filter:         ['==', 'extrude', 'true'],
          type:           'fill-extrusion',
          minzoom:        13,
          paint: {
            'fill-extrusion-color':   colourExpr,
            'fill-extrusion-height':  heightExpr,
            'fill-extrusion-base':    baseExpr,
            'fill-extrusion-opacity': [
              'interpolate', ['linear'], ['zoom'],
              13, 0, 14, 0.90,
            ] as ExpressionSpecification,
          },
        };

        map.addLayer(buildingLayer, beforeId);
      } catch (err) {
        console.warn('[CityMap] 3D buildings unavailable:', err);
      }

      // ── Temperature heatmap (starts empty, fills from Open-Meteo) ─────────
      map.addSource('src-temperature', { type: 'geojson', data: EMPTY_FC });
      map.addLayer({
        id:     'temperature-heat',
        type:   'heatmap',
        source: 'src-temperature',
        paint:  {
          'heatmap-weight':     ['interpolate', ['linear'], ['get', 'weight'], 0, 0.2, 1, 1] as ExpressionSpecification,
          'heatmap-intensity':  ['interpolate', ['linear'], ['zoom'], 9, 1.5, 14, 4] as ExpressionSpecification,
          'heatmap-radius':     ['interpolate', ['linear'], ['zoom'], 9, 80, 14, 160] as ExpressionSpecification,
          'heatmap-opacity':    0.78,
          'heatmap-color': [
            'interpolate', ['linear'], ['heatmap-density'],
            0,    'rgba(0,0,0,0)',
            0.15, 'rgba(0,100,220,0)',
            0.35, 'rgba(0,220,255,0.45)',
            0.55, 'rgba(0,255,180,0.65)',
            0.75, 'rgba(255,200,0,0.75)',
            0.90, 'rgba(255,80,0,0.85)',
            1,    'rgba(255,0,0,0.92)',
          ] as ExpressionSpecification,
        },
        layout: { visibility: 'none' },
      });

      // ── Air-quality heatmap (starts empty, fills from Open-Meteo) ─────────
      map.addSource('src-pollution', { type: 'geojson', data: EMPTY_FC });
      map.addLayer({
        id:     'pollution-heat',
        type:   'heatmap',
        source: 'src-pollution',
        paint: {
          'heatmap-weight':    ['interpolate', ['linear'], ['get', 'weight'], 0, 0.2, 1, 1] as ExpressionSpecification,
          'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 9, 1.5, 14, 3.5] as ExpressionSpecification,
          'heatmap-radius':    ['interpolate', ['linear'], ['zoom'], 9, 85, 14, 170] as ExpressionSpecification,
          'heatmap-opacity':   0.72,
          'heatmap-color': [
            'interpolate', ['linear'], ['heatmap-density'],
            0,   'rgba(0,0,0,0)',
            0.2, 'rgba(0,200,50,0)',
            0.4, 'rgba(100,200,0,0.45)',
            0.6, 'rgba(220,200,0,0.65)',
            0.8, 'rgba(220,100,0,0.78)',
            1,   'rgba(190,20,0,0.92)',
          ] as ExpressionSpecification,
        },
        layout: { visibility: 'none' },
      });

      // ── Fetch real data and populate heatmaps ─────────────────────────────
      const alive = { current: true };
      Promise.all([fetchTemperatureHeatmap(), fetchAqiHeatmap()]).then(([tempFC, aqiFC]) => {
        if (!alive.current || !mapRef.current) return;
        (map.getSource('src-temperature') as mapboxgl.GeoJSONSource)?.setData(tempFC);
        (map.getSource('src-pollution')   as mapboxgl.GeoJSONSource)?.setData(aqiFC);
      }).catch(err => console.warn('[CityMap] Heatmap fetch failed:', err));

      // ── Sensors ────────────────────────────────────────────────────────────
      const sensorFC: GeoJSON.FeatureCollection = {
        type: 'FeatureCollection',
        features: SENSORS.map(s => ({
          type:     'Feature',
          geometry: { type: 'Point', coordinates: [s.lng, s.lat] },
          properties: { id: s.id, name: s.name, type: s.type, value: s.value, status: s.status },
        })),
      };
      map.addSource('src-sensors', { type: 'geojson', data: sensorFC });

      const statusColorExpr: ExpressionSpecification = [
        'match', ['get', 'status'],
        'warning', '#FF7722',
        'offline',  '#FF4444',
        '#00EEFF',
      ];

      map.addLayer({
        id: 'sensors-glow', type: 'circle', source: 'src-sensors',
        paint: {
          'circle-radius':  20,
          'circle-color':   statusColorExpr,
          'circle-opacity': 0.12,
          'circle-blur':    1.2,
        },
        layout: { visibility: 'visible' },
      });

      map.addLayer({
        id: 'sensors-dot', type: 'circle', source: 'src-sensors',
        paint: {
          'circle-radius':        6,
          'circle-color':         statusColorExpr,
          'circle-opacity':       0.92,
          'circle-stroke-width':  1.5,
          'circle-stroke-color':  'rgba(255,255,255,0.25)',
        },
        layout: { visibility: 'visible' },
      });

      map.addLayer({
        id: 'sensors-label', type: 'symbol', source: 'src-sensors',
        minzoom: 12,
        layout: {
          'text-field':   ['get', 'name'] as ExpressionSpecification,
          'text-size':    10,
          'text-offset':  [0, 1.3],
          'text-anchor':  'top',
          'text-font':    ['Open Sans Regular', 'Arial Unicode MS Regular'],
          visibility:     'visible',
        },
        paint: {
          'text-color':       '#00EEFF',
          'text-halo-color':  'rgba(0,0,0,0.95)',
          'text-halo-width':  2,
        },
      });

      map.on('click', 'sensors-dot', e => {
        if (!e.features?.[0]) return;
        const props = e.features[0].properties as Record<string, unknown>;
        const coord = (e.features[0].geometry as GeoJSON.Point).coordinates as [number, number];
        popupRef.current?.remove();
        popupRef.current = new mapboxgl.Popup({
          offset: 12, closeButton: true, maxWidth: '240px', className: 'syncity-popup',
        })
          .setLngLat(coord)
          .setHTML(sensorPopupHtml(props))
          .addTo(map);
      });
      map.on('mouseenter', 'sensors-dot', () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', 'sensors-dot', () => { map.getCanvas().style.cursor = ''; });

      // ── Traffic congestion — real Mapbox traffic-v1 tileset ───────────────
      // Congestion values: 'low' | 'moderate' | 'heavy' | 'severe'
      map.addSource('mapbox-traffic', {
        type: 'vector',
        url:  'mapbox://mapbox.mapbox-traffic-v1',
      });

      const congestionColor: ExpressionSpecification = [
        'match', ['get', 'congestion'],
        'low',      '#00FF88',
        'moderate', '#FFCC00',
        'heavy',    '#FF7722',
        'severe',   '#FF2222',
        'rgba(0,238,255,0.3)',
      ];

      // Wide blur glow for heat-like feel
      map.addLayer({
        id:     'traffic-congestion-glow',
        type:   'line',
        source: 'mapbox-traffic',
        'source-layer': 'traffic',
        layout: { 'line-join': 'round', 'line-cap': 'round', visibility: 'visible' },
        paint: {
          'line-color':   congestionColor,
          'line-width':   ['interpolate', ['linear'], ['zoom'], 9, 6, 14, 18] as ExpressionSpecification,
          'line-blur':    5,
          'line-opacity': 0.22,
        },
      });

      // Core congestion line
      map.addLayer({
        id:     'traffic-congestion-line',
        type:   'line',
        source: 'mapbox-traffic',
        'source-layer': 'traffic',
        layout: { 'line-join': 'round', 'line-cap': 'round', visibility: 'visible' },
        paint: {
          'line-color':   congestionColor,
          'line-width':   ['interpolate', ['linear'], ['zoom'], 9, 1.5, 14, 4] as ExpressionSpecification,
          'line-opacity': 0.88,
        },
      });

      // ── Backend decision-engine traffic markers ────────────────────────────
      // Coloured circles for each location tracked by the FastAPI backend.
      // Falls back silently if the backend is offline.
      map.addSource('src-backend-traffic', { type: 'geojson', data: EMPTY_FC });

      const backendCongestionColor: ExpressionSpecification = [
        'interpolate', ['linear'],
        ['coalesce', ['get', 'congestion_level'], 0],
        0,  '#00FF88',
        35, '#FFCC00',
        60, '#FF7722',
        80, '#FF2222',
      ];

      // Outer glow
      map.addLayer({
        id: 'backend-traffic-glow', type: 'circle', source: 'src-backend-traffic',
        paint: {
          'circle-radius':  30,
          'circle-color':   backendCongestionColor,
          'circle-opacity': 0.13,
          'circle-blur':    1.8,
        },
        layout: { visibility: 'visible' },
      });

      // Core dot
      map.addLayer({
        id: 'backend-traffic-dot', type: 'circle', source: 'src-backend-traffic',
        paint: {
          'circle-radius':       9,
          'circle-color':        backendCongestionColor,
          'circle-opacity':      0.92,
          'circle-stroke-width': 2,
          'circle-stroke-color': 'rgba(255,255,255,0.25)',
        },
        layout: { visibility: 'visible' },
      });

      // Label (visible when zoomed in)
      map.addLayer({
        id: 'backend-traffic-label', type: 'symbol', source: 'src-backend-traffic',
        minzoom: 11,
        layout: {
          'text-field': [
            'concat',
            ['get', 'name'],
            '\n',
            ['concat', ['to-string', ['round', ['coalesce', ['get', 'congestion_level'], 0]]], '/100'],
          ] as ExpressionSpecification,
          'text-size':   9,
          'text-offset': [0, 1.6],
          'text-anchor': 'top',
          'text-font':   ['Open Sans Regular', 'Arial Unicode MS Regular'],
          'text-max-width': 8,
          visibility: 'visible',
        },
        paint: {
          'text-color':      backendCongestionColor,
          'text-halo-color': 'rgba(0,0,0,0.95)',
          'text-halo-width': 2,
        },
      });

      // Click popup for backend markers
      map.on('click', 'backend-traffic-dot', e => {
        if (!e.features?.[0]) return;
        const props = e.features[0].properties as BackendLocation & { congestion_level: number };
        const coord = (e.features[0].geometry as GeoJSON.Point).coordinates as [number, number];
        popupRef.current?.remove();
        popupRef.current = new mapboxgl.Popup({
          offset: 14, closeButton: true, maxWidth: '260px', className: 'syncity-popup',
        })
          .setLngLat(coord)
          .setHTML(backendTrafficPopupHtml(props))
          .addTo(map);
      });
      map.on('mouseenter', 'backend-traffic-dot', () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', 'backend-traffic-dot', () => { map.getCanvas().style.cursor = ''; });

      setLoaded(true);

      setTimeout(() => {
        map.flyTo({
          center: BANGALORE, zoom: 13.5, pitch: 62, bearing: 22,
          duration: 4800, essential: true, curve: 1.5,
        });
      }, 700);

      return () => { alive.current = false; };
        // Fly-in
        setTimeout(() => {
          map.flyTo({ center: BANGALORE, zoom: 13.5, pitch: 62, bearing: 22, duration: 4800, essential: true, curve: 1.5 });
        }, 700);
      }
    });

    return () => {
      popupRef.current?.remove();
      markerRef.current?.remove();
      originMarkerRef.current?.remove();
      destMarkerRef.current?.remove();
      map.remove();
      mapRef.current = null;
    };
  }, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Layer visibility ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current) return;
    syncVisibility(mapRef.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeLayers, styleLoaded]);

  // ── Map style switching ───────────────────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current) return;
    mapRef.current.setStyle(MAPBOX_STYLES[mapStyle], { diff: false });
  }, [mapStyle]);

  // ── Geocoded search result: fly + drop marker ─────────────────────────────
  useEffect(() => {
    if (!mapRef.current || !loaded) return;
    const map = mapRef.current;

    const layerGroups: Record<LayerId, string[]> = {
      temperature: ['temperature-heat'],
      pollution:   ['pollution-heat'],
      sensors:     ['sensors-glow', 'sensors-dot', 'sensors-label'],
      traffic:     ['traffic-congestion-glow', 'traffic-congestion-line', 'backend-traffic-glow', 'backend-traffic-dot', 'backend-traffic-label'],
    };

    for (const [id, visible] of Object.entries(activeLayers)) {
      for (const layerId of layerGroups[id as LayerId] ?? []) {
        if (map.getLayer(layerId)) {
          map.setLayoutProperty(layerId, 'visibility', visible ? 'visible' : 'none');
        }
      }
    }
  }, [activeLayers, loaded]);

  // ── Poll backend for live location traffic every 30 s ────────────────────
  useEffect(() => {
    if (!loaded) return;

    function toGeoJSON(locations: BackendLocation[]): GeoJSON.FeatureCollection {
      return {
        type: 'FeatureCollection',
        features: locations
          .filter(l => l.congestion_level !== null)
          .map(l => ({
            type:     'Feature',
            geometry: { type: 'Point', coordinates: [l.lng, l.lat] },
            properties: {
              location_id:     l.location_id,
              name:            l.name,
              congestion_level: l.congestion_level,
              vehicle_count:   l.vehicle_count,
              avg_speed_kmh:   l.avg_speed_kmh,
              aqi:             l.aqi,
              timestamp:       l.timestamp,
            },
          })),
      };
    }

    async function refresh() {
      const locations = await fetchTrafficCurrent();
      if (!mapRef.current || !locations.length) return;
      const src = mapRef.current.getSource('src-backend-traffic') as mapboxgl.GeoJSONSource | undefined;
      src?.setData(toGeoJSON(locations));
    }

    refresh();
    const id = setInterval(refresh, 30_000);
    return () => clearInterval(id);
  }, [loaded]);

  return (
    <div
      ref={containerRef}
      className="w-full h-full"
      style={{ background: '#09090b' }}
    />
  );
    if (!mapRef.current || !searchResult) return;
    markerRef.current?.remove();

    const el = document.createElement('div');
    el.style.cssText = `
      width:20px;height:20px;border-radius:50%;
      background:#00EEFF;box-shadow:0 0 14px #00EEFF;
      border:2px solid rgba(255,255,255,0.6);
    `;
    markerRef.current = new mapboxgl.Marker(el)
      .setLngLat(searchResult.center)
      .setPopup(
        new mapboxgl.Popup({ offset: 14, className: 'syncity-popup' })
          .setHTML(`<div style="font-family:ui-monospace,monospace;font-size:11px;color:#f0f0f2">${searchResult.placeName}</div>`)
      )
      .addTo(mapRef.current);

    mapRef.current.flyTo({ center: searchResult.center, zoom: 14, pitch: 60, duration: 2200 });
  }, [searchResult]);

  // ── Directions: fetch route and draw ─────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current || !directionsRequest) return;
    const { origin, destination } = directionsRequest;

    // Custom pin maker
    const makePin = (color: string) => {
      const el = document.createElement('div');
      el.style.cssText = `width:14px;height:14px;border-radius:50%;background:${color};box-shadow:0 0 10px ${color};border:2px solid #fff`;
      return el;
    };

    originMarkerRef.current?.remove();
    destMarkerRef.current?.remove();
    originMarkerRef.current = new mapboxgl.Marker(makePin('#00FF88')).setLngLat(origin).addTo(mapRef.current);
    destMarkerRef.current   = new mapboxgl.Marker(makePin('#FF7722')).setLngLat(destination).addTo(mapRef.current);

    const url =
      `https://api.mapbox.com/directions/v5/mapbox/driving/` +
      `${origin[0]},${origin[1]};${destination[0]},${destination[1]}` +
      `?access_token=${TOKEN}&geometries=geojson&overview=full&steps=false&annotations=congestion`;

    fetch(url)
      .then(r => r.json())
      .then((data: { routes?: { geometry: GeoJSON.LineString; duration: number; distance: number }[] }) => {
        if (!data.routes?.[0] || !mapRef.current) return;
        const route = data.routes[0];
        const src = mapRef.current.getSource('src-directions') as mapboxgl.GeoJSONSource | undefined;
        src?.setData({ type: 'Feature', geometry: route.geometry, properties: {} });

        const bounds = new mapboxgl.LngLatBounds();
        (route.geometry.coordinates as [number, number][]).forEach(c => bounds.extend(c));
        mapRef.current.fitBounds(bounds, { padding: 80, pitch: 50, duration: 2000 });
      })
      .catch(err => console.warn('[Directions]', err));
  }, [directionsRequest]);

  // ── No token warning ──────────────────────────────────────────────────────
  if (!TOKEN) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-[#09090b] gap-4">
        <div className="text-2xl">🗺️</div>
        <p className="font-mono text-white/60 text-sm text-center max-w-xs">
          Add <code className="text-[#00EEFF]">NEXT_PUBLIC_MAPBOX_TOKEN</code> to{' '}
          <code className="text-[#FF7722]">.env.local</code> to enable the map.
        </p>
        <a
          href="https://account.mapbox.com/access-tokens/"
          target="_blank"
          rel="noreferrer"
          className="font-mono text-xs text-[#00EEFF]/70 underline"
        >
          Get a free Mapbox token →
        </a>
      </div>
    );
  }

  return <div ref={containerRef} className="w-full h-full" style={{ background: '#09090b' }} />;
}
