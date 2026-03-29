// File: components/map/CityMap.tsx
'use client';

/**
 * CityMap — MapLibre GL JS 3D city engine.
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

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? '';

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
  { id: 's01', name: 'Koramangala Hub',    lat: 12.9342, lng: 77.6268, type: 'traffic', value: 87,  status: 'online'  },
  { id: 's02', name: 'MG Road Monitor',   lat: 12.9762, lng: 77.6033, type: 'air',     value: 142, status: 'warning' },
  { id: 's03', name: 'Electronic City',   lat: 12.8458, lng: 77.6603, type: 'smart',   value: 43,  status: 'online'  },
  { id: 's04', name: 'Whitefield IoT',    lat: 12.9698, lng: 77.7499, type: 'smart',   value: 92,  status: 'online'  },
  { id: 's05', name: 'Hebbal Node',       lat: 13.0358, lng: 77.5972, type: 'traffic', value: 78,  status: 'online'  },
  { id: 's06', name: 'Indiranagar AQI',   lat: 12.9784, lng: 77.6408, type: 'air',     value: 156, status: 'warning' },
  { id: 's07', name: 'Silk Board',        lat: 12.9174, lng: 77.6226, type: 'traffic', value: 95,  status: 'warning' },
  { id: 's08', name: 'Bellandur Lake',    lat: 12.9305, lng: 77.6719, type: 'water',   value: 28,  status: 'online'  },
  { id: 's09', name: 'Yelahanka',         lat: 13.1007, lng: 77.5963, type: 'smart',   value: 15,  status: 'online'  },
  { id: 's10', name: 'Jayanagar',         lat: 12.9250, lng: 77.5938, type: 'air',     value: 89,  status: 'online'  },
  { id: 's11', name: 'BTM Layout',        lat: 12.9166, lng: 77.6101, type: 'traffic', value: 73,  status: 'online'  },
  { id: 's12', name: 'Marathahalli',      lat: 12.9591, lng: 77.6974, type: 'traffic', value: 88,  status: 'online'  },
  { id: 's13', name: 'Banashankari',      lat: 12.9254, lng: 77.5468, type: 'air',     value: 67,  status: 'online'  },
  { id: 's14', name: 'Rajajinagar',       lat: 12.9902, lng: 77.5509, type: 'smart',   value: 55,  status: 'online'  },
  { id: 's15', name: 'Yeshwanthpur',      lat: 13.0250, lng: 77.5500, type: 'traffic', value: 82,  status: 'online'  },
  { id: 's16', name: 'KR Puram',         lat: 13.0086, lng: 77.6938, type: 'traffic', value: 91,  status: 'warning' },
  { id: 's17', name: 'HSR Layout',        lat: 12.9116, lng: 77.6474, type: 'smart',   value: 61,  status: 'online'  },
  { id: 's18', name: 'Sarjapur Road',     lat: 12.9010, lng: 77.6855, type: 'air',     value: 110, status: 'online'  },
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
  // /api/aqi fetches Open-Meteo CAMS data server-side for all 14 districts, cached 5 min.
  const res = await fetch('/api/aqi');
  if (!res.ok) throw new Error('AQI proxy error');

  const json = await res.json();
  const points = json.points as Array<{ lat: number; lng: number; pm25: number; aqi: number }>;

  if (!points?.length) throw new Error('No AQI points');

  const values = points.map(p => p.aqi);
  const min    = Math.min(...values);
  const max    = Math.max(...values);
  const range  = max - min || 1;

  return {
    type: 'FeatureCollection',
    features: points.map(p => ({
      type:     'Feature',
      geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
      properties: { pm25: p.pm25, aqi: p.aqi, weight: (p.aqi - min) / range },
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

// ── Status colour lookup ──────────────────────────────────────────────────────

function statusColour(status: string): string {
  return status === 'warning' ? '#FF7722' : status === 'offline' ? '#FF4444' : '#00EEFF';
}

// ── Popup HTML builder ────────────────────────────────────────────────────────

function sensorPopupHtml(props: Record<string, unknown>): string {
  const typeLabel: Record<string, string> = {
    traffic: '🚦 Traffic', air: '🌬 Air Quality', smart: '📡 Smart', water: '💧 Water',
  };
  const col = statusColour(String(props.status));
  return `
    <div style="
      font-family: ui-monospace, 'Space Mono', monospace;
      font-size: 11px;
      color: #f0f0f2;
      min-width: 170px;
    ">
      <div style="font-weight:600; color:#00EEFF; margin-bottom:6px; font-size:12px;">
        ${props.name}
      </div>
      <div style="opacity:0.55; margin-bottom:8px; font-size:10px;">
        ${typeLabel[String(props.type)] ?? props.type}
      </div>
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <span style="opacity:0.7;">Value&nbsp;<b style="color:#fff;">${props.value}</b></span>
        <span style="
          color:${col};
          font-size:9px;
          text-transform:uppercase;
          letter-spacing:0.08em;
          border:1px solid ${col}40;
          border-radius:3px;
          padding:1px 5px;
        ">${props.status}</span>
      </div>
    </div>`;
}

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
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

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

    mapRef.current = map;

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

      // ── Fetch real Open-Meteo data and populate heatmaps ──────────────────
      const alive = { current: true };
      Promise.all([fetchTemperatureHeatmap(), fetchAqiHeatmap()]).then(([tempFC, aqiFC]) => {
        if (!alive.current || !mapRef.current) return;
        (map.getSource('src-temperature') as mapboxgl.GeoJSONSource)?.setData(tempFC);
        (map.getSource('src-pollution')   as mapboxgl.GeoJSONSource)?.setData(aqiFC);
      }).catch(err => console.warn('[CityMap] Open-Meteo fetch failed:', err));

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

      setLoaded(true);

      setTimeout(() => {
        map.flyTo({
          center: BANGALORE, zoom: 13.5, pitch: 62, bearing: 22,
          duration: 4800, essential: true, curve: 1.5,
        });
      }, 700);

      return () => { alive.current = false; };
    });

    return () => {
      popupRef.current?.remove();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // ── Sync layer visibility when props change ────────────────────────────────
  useEffect(() => {
    if (!mapRef.current || !loaded) return;
    const map = mapRef.current;

    const layerGroups: Record<LayerId, string[]> = {
      temperature: ['temperature-heat'],
      pollution:   ['pollution-heat'],
      sensors:     ['sensors-glow', 'sensors-dot', 'sensors-label'],
      traffic:     ['traffic-congestion-glow', 'traffic-congestion-line'],
    };

    for (const [id, visible] of Object.entries(activeLayers)) {
      for (const layerId of layerGroups[id as LayerId] ?? []) {
        if (map.getLayer(layerId)) {
          map.setLayoutProperty(layerId, 'visibility', visible ? 'visible' : 'none');
        }
      }
    }
  }, [activeLayers, loaded]);

  return (
    <div
      ref={containerRef}
      className="w-full h-full"
      style={{ background: '#09090b' }}
    />
  );
}
