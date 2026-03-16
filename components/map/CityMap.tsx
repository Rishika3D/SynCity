// File: components/map/CityMap.tsx
'use client';

/**
 * CityMap — MapLibre GL JS 3D city engine.
 *
 * Features
 *  ─ Dark CARTO base map
 *  ─ 3D building extrusions with depth-graded colour
 *  ─ Cinematic fly-in from altitude to street level
 *  ─ Temperature heatmap   (toggle)
 *  ─ Air-quality heatmap   (toggle)
 *  ─ IoT sensor markers    (toggle)
 *  ─ Traffic flow lines    (toggle)
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

// ── Traffic routes (simplified road centrelines) ──────────────────────────────

const TRAFFIC_ROUTES: { name: string; intensity: number; coords: [number, number][] }[] = [
  { name: 'Outer Ring Road',  intensity: 0.90, coords: [[77.6015,12.9343],[77.6174,12.9277],[77.6358,12.9284],[77.6504,12.9338],[77.6614,12.9447],[77.6698,12.9591],[77.6749,12.9698],[77.6719,12.9838],[77.6604,12.9968],[77.6442,13.0077]] },
  { name: 'Whitefield Rd',    intensity: 0.70, coords: [[77.6033,12.9762],[77.6199,12.9727],[77.6389,12.9699],[77.6622,12.9698],[77.6812,12.9700],[77.7099,12.9699],[77.7342,12.9698],[77.7499,12.9698]] },
  { name: 'NH44 North',       intensity: 0.80, coords: [[77.5946,12.9716],[77.5946,13.0000],[77.5946,13.0500],[77.5972,13.0800],[77.5963,13.1007]] },
  { name: 'NH44 South',       intensity: 0.85, coords: [[77.5946,12.9716],[77.5946,12.9200],[77.5946,12.8700],[77.5946,12.8458]] },
  { name: 'Hosur Road',       intensity: 0.75, coords: [[77.5946,12.9716],[77.6050,12.9400],[77.6200,12.9100],[77.6350,12.8800],[77.6603,12.8458]] },
  { name: 'Tumkur Road',      intensity: 0.65, coords: [[77.5946,12.9716],[77.5750,13.0000],[77.5550,13.0300],[77.5300,13.0600]] },
  { name: 'MG Road',          intensity: 0.70, coords: [[77.5946,12.9716],[77.6033,12.9762],[77.6150,12.9780],[77.6250,12.9760],[77.6350,12.9730]] },
  { name: 'Bannerghatta Rd',  intensity: 0.60, coords: [[77.5946,12.9716],[77.5938,12.9250],[77.5900,12.8900],[77.5940,12.8600]] },
  { name: 'Airport Road',     intensity: 0.55, coords: [[77.6033,12.9762],[77.6112,12.9880],[77.6050,13.0100],[77.5990,13.0350],[77.5972,13.0500]] },
];

// ── Heatmap data generators ───────────────────────────────────────────────────

type Hotspot = { lat: number; lng: number; base: number; radius: number; count?: number };

function buildHeatmap(
  hotspots: Hotspot[],
  prop: string,
): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  for (const spot of hotspots) {
    const n = spot.count ?? 60;
    for (let i = 0; i < n; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist  = Math.sqrt(Math.random()) * spot.radius; // square root for uniform disc distribution
      features.push({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [
            spot.lng + Math.cos(angle) * dist,
            spot.lat + Math.sin(angle) * dist,
          ],
        },
        properties: {
          [prop]: spot.base + (Math.random() - 0.5) * (spot.base * 0.12),
          weight: Math.max(0, 1 - dist / spot.radius * 0.6),
        },
      });
    }
  }
  return { type: 'FeatureCollection', features };
}

function temperatureData(): GeoJSON.FeatureCollection {
  return buildHeatmap([
    { lat: 12.9342, lng: 77.6268, base: 34, radius: 0.040 }, // Koramangala
    { lat: 12.9762, lng: 77.6033, base: 33, radius: 0.030 }, // MG Road
    { lat: 12.9174, lng: 77.6226, base: 35, radius: 0.025 }, // Silk Board
    { lat: 12.9591, lng: 77.6974, base: 33, radius: 0.040 }, // Marathahalli
    { lat: 12.8458, lng: 77.6603, base: 32, radius: 0.050 }, // Electronic City
    { lat: 13.0250, lng: 77.5500, base: 31, radius: 0.040 }, // Yeshwanthpur
    { lat: 12.9250, lng: 77.5938, base: 29, radius: 0.055 }, // Jayanagar (parks)
    { lat: 12.9716, lng: 77.5946, base: 32, radius: 0.060 }, // City centre
    { lat: 12.9010, lng: 77.6855, base: 32, radius: 0.035 }, // Sarjapur
  ], 'temperature');
}

function pollutionData(): GeoJSON.FeatureCollection {
  return buildHeatmap([
    { lat: 12.9174, lng: 77.6226, base: 180, radius: 0.035 }, // Silk Board — worst
    { lat: 12.9762, lng: 77.6033, base: 155, radius: 0.025 }, // MG Road
    { lat: 12.9591, lng: 77.6974, base: 145, radius: 0.030 }, // Marathahalli
    { lat: 13.0358, lng: 77.5972, base: 130, radius: 0.040 }, // Hebbal (highway)
    { lat: 12.9166, lng: 77.6101, base: 120, radius: 0.030 }, // BTM Layout
    { lat: 12.9784, lng: 77.6408, base: 135, radius: 0.025 }, // Indiranagar
    { lat: 12.9250, lng: 77.5938, base: 70,  radius: 0.055 }, // Jayanagar (green)
    { lat: 13.1007, lng: 77.5963, base: 65,  radius: 0.040 }, // Yelahanka (clean)
    { lat: 12.8458, lng: 77.6603, base: 90,  radius: 0.050 }, // Electronic City
    { lat: 12.9010, lng: 77.6855, base: 110, radius: 0.035 }, // Sarjapur
  ], 'aqi');
}

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
      zoom:         9,          // fly-in start
      pitch:        20,
      bearing:      0,
      antialias:    true,
      attributionControl: false,
    });

    // Controls
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
      // ── 3D buildings ─────────────────────────────────────────────────────
      try {
        const beforeId = firstSymbolLayer(map);

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
        // Pastel yellow gradient — short buildings are softer, tall ones richer
        const colourExpr: ExpressionSpecification = [
          'interpolate', ['linear'],
          ['coalesce', ['get', 'height'], 0],
          0,   '#fdf3c0',   // very soft cream-yellow
          20,  '#f9e87a',   // light pastel yellow
          60,  '#f5d84a',   // mid pastel yellow
          150, '#e8c62a',   // warm golden yellow for towers
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

      // ── Temperature heatmap ───────────────────────────────────────────────
      map.addSource('src-temperature', { type: 'geojson', data: temperatureData() });
      map.addLayer({
        id:     'temperature-heat',
        type:   'heatmap',
        source: 'src-temperature',
        paint:  {
          'heatmap-weight':     ['get', 'weight'] as ExpressionSpecification,
          'heatmap-intensity':  ['interpolate', ['linear'], ['zoom'], 9, 1, 14, 3] as ExpressionSpecification,
          'heatmap-radius':     ['interpolate', ['linear'], ['zoom'], 9, 22, 14, 44] as ExpressionSpecification,
          'heatmap-opacity':    0.72,
          'heatmap-color': [
            'interpolate', ['linear'], ['heatmap-density'],
            0,   'rgba(0,0,0,0)',
            0.15,'rgba(0,100,220,0)',
            0.35,'rgba(0,220,255,0.45)',
            0.55,'rgba(0,255,180,0.65)',
            0.75,'rgba(255,200,0,0.75)',
            0.90,'rgba(255,80,0,0.85)',
            1,   'rgba(255,0,0,0.92)',
          ] as ExpressionSpecification,
        },
        layout: { visibility: 'none' },
      });

      // ── Air-quality heatmap ───────────────────────────────────────────────
      map.addSource('src-pollution', { type: 'geojson', data: pollutionData() });
      map.addLayer({
        id:     'pollution-heat',
        type:   'heatmap',
        source: 'src-pollution',
        paint: {
          'heatmap-weight':    ['get', 'weight'] as ExpressionSpecification,
          'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 9, 1, 14, 2.5] as ExpressionSpecification,
          'heatmap-radius':    ['interpolate', ['linear'], ['zoom'], 9, 26, 14, 50] as ExpressionSpecification,
          'heatmap-opacity':   0.68,
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

      // ── Sensors — GeoJSON source ──────────────────────────────────────────
      const sensorFC: GeoJSON.FeatureCollection = {
        type: 'FeatureCollection',
        features: SENSORS.map(s => ({
          type:     'Feature',
          geometry: { type: 'Point', coordinates: [s.lng, s.lat] },
          properties: {
            id: s.id, name: s.name, type: s.type,
            value: s.value, status: s.status,
          },
        })),
      };
      map.addSource('src-sensors', { type: 'geojson', data: sensorFC });

      const statusColorExpr: ExpressionSpecification = [
        'match', ['get', 'status'],
        'warning', '#FF7722',
        'offline',  '#FF4444',
        '#00EEFF',
      ];

      // Outer glow ring
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

      // Inner dot
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

      // Label (visible only when zoomed in)
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

      // Click → popup
      map.on('click', 'sensors-dot', e => {
        if (!e.features?.[0]) return;
        const props = e.features[0].properties as Record<string, unknown>;
        const coord = (e.features[0].geometry as GeoJSON.Point).coordinates as [number, number];
        popupRef.current?.remove();
        popupRef.current = new mapboxgl.Popup({
          offset:      12,
          closeButton: true,
          maxWidth:    '240px',
          className:   'syncity-popup',
        })
          .setLngLat(coord)
          .setHTML(sensorPopupHtml(props))
          .addTo(map);
      });
      map.on('mouseenter', 'sensors-dot', () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', 'sensors-dot', () => { map.getCanvas().style.cursor = ''; });

      // ── Traffic lines ─────────────────────────────────────────────────────
      const trafficFC: GeoJSON.FeatureCollection = {
        type: 'FeatureCollection',
        features: TRAFFIC_ROUTES.map(r => ({
          type:     'Feature',
          geometry: { type: 'LineString', coordinates: r.coords },
          properties: { name: r.name, intensity: r.intensity },
        })),
      };
      map.addSource('src-traffic', { type: 'geojson', data: trafficFC });

      const lineColour: ExpressionSpecification = [
        'interpolate', ['linear'], ['get', 'intensity'],
        0,   '#00EEFF',
        0.5, '#00FF88',
        0.8, '#FF7722',
        1.0, '#FF3300',
      ];

      // Wide glow pass
      map.addLayer({
        id: 'traffic-glow', type: 'line', source: 'src-traffic',
        layout: { 'line-join': 'round', 'line-cap': 'round', visibility: 'visible' },
        paint: { 'line-color': lineColour, 'line-width': 14, 'line-opacity': 0.14, 'line-blur': 5 },
      });

      // Core line
      map.addLayer({
        id: 'traffic-line', type: 'line', source: 'src-traffic',
        layout: { 'line-join': 'round', 'line-cap': 'round', visibility: 'visible' },
        paint: { 'line-color': lineColour, 'line-width': 2.5, 'line-opacity': 0.88 },
      });

      // ── Done — trigger fly-in ─────────────────────────────────────────────
      setLoaded(true);

      setTimeout(() => {
        map.flyTo({
          center:   BANGALORE,
          zoom:     13.5,
          pitch:    62,
          bearing:  22,
          duration: 4800,
          essential: true,
          curve:    1.5,
        });
      }, 700);
    });

    return () => {
      popupRef.current?.remove();
      map.remove();
      mapRef.current = null;
    };
  }, []); // intentionally empty — map initialises once

  // ── Sync layer visibility when props change ────────────────────────────────
  useEffect(() => {
    if (!mapRef.current || !loaded) return;
    const map = mapRef.current;

    const layerGroups: Record<LayerId, string[]> = {
      temperature: ['temperature-heat'],
      pollution:   ['pollution-heat'],
      sensors:     ['sensors-glow', 'sensors-dot', 'sensors-label'],
      traffic:     ['traffic-glow', 'traffic-line'],
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
