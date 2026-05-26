'use client';

/**
 * ControlMap.tsx
 *
 * Command-centre-specific MapLibre map.
 * Stripped of all UI chrome — pure data visualisation:
 *   • Mapbox real-time traffic flow layer (coloured by congestion)
 *   • Junction signal overlays (10 key Bangalore junctions)
 *   • Backend traffic dots (live polling from FastAPI)
 *   • Incident markers (active events from backend)
 *
 * Junction colours update live from backend traffic readings.
 * When backend is offline, junctions show time-of-day baseline congestion.
 */

import { useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import type { BackendLocation, BackendEvent } from '@/services/backendApi';

// ── Key Bangalore junctions to show signal state ───────────────────────────
const JUNCTIONS = [
  { id: 'silk-board',      name: 'Silk Board',      lng: 77.6229, lat: 12.9176, baseline: 84 },
  { id: 'kr-puram',        name: 'KR Puram',         lng: 77.6980, lat: 13.0085, baseline: 67 },
  { id: 'hebbal',          name: 'Hebbal',            lng: 77.5970, lat: 13.0358, baseline: 71 },
  { id: 'marathahalli',    name: 'Marathahalli',      lng: 77.7010, lat: 12.9563, baseline: 65 },
  { id: 'electronic-city', name: 'Electronic City',   lng: 77.6603, lat: 12.8456, baseline: 54 },
  { id: 'koramangala',     name: 'Koramangala',       lng: 77.6245, lat: 12.9352, baseline: 72 },
  { id: 'mg-road',         name: 'MG Road',           lng: 77.6079, lat: 12.9758, baseline: 58 },
  { id: 'whitefield',      name: 'Whitefield',        lng: 77.7499, lat: 12.9698, baseline: 61 },
  { id: 'jayanagar',       name: 'Jayanagar',         lng: 77.5838, lat: 12.9308, baseline: 44 },
  { id: 'yeshwantpur',     name: 'Yeshwantpur',       lng: 77.5476, lat: 13.0213, baseline: 68 },
];

// ── Congestion colour — green → amber → red ────────────────────────────────
function congColor(c: number): string {
  if (c >= 80) return '#FF3B30';
  if (c >= 55) return '#FF9500';
  return '#30D158';
}

// ── Popup HTML for junctions ───────────────────────────────────────────────
function junctionPopupHtml(name: string, congestion: number): string {
  const status = congestion >= 80 ? 'CRITICAL' : congestion >= 55 ? 'MODERATE' : 'CLEAR';
  const statusColor = congestion >= 80 ? '#FF3B30' : congestion >= 55 ? '#FF9500' : '#30D158';
  const phase = congestion >= 80 ? 'Extended green on relief road' : congestion >= 55 ? 'Standard adaptive cycle' : 'Normal timing';
  return `
    <div style="font-family:var(--font-jetbrains);font-size:11px;color:#e2e8f0;
                background:#080C14;padding:10px 12px;border:1px solid rgba(0,238,255,0.20);
                border-radius:3px;min-width:180px;">
      <div style="color:#00EEFF;font-size:9px;letter-spacing:0.25em;text-transform:uppercase;margin-bottom:8px">
        ⬡ ${name}
      </div>
      <div style="display:flex;justify-content:space-between;margin-bottom:4px">
        <span style="color:rgba(255,255,255,0.45)">Congestion</span>
        <span style="color:${congColor(congestion)}">${Math.round(congestion)}/100</span>
      </div>
      <div style="display:flex;justify-content:space-between;margin-bottom:4px">
        <span style="color:rgba(255,255,255,0.45)">Status</span>
        <span style="color:${statusColor}">${status}</span>
      </div>
      <div style="display:flex;justify-content:space-between;margin-bottom:8px">
        <span style="color:rgba(255,255,255,0.45)">Signal</span>
        <span style="color:rgba(255,255,255,0.70)">ADAPTIVE</span>
      </div>
      <div style="border-top:1px solid rgba(255,255,255,0.08);padding-top:6px;
                  font-size:9px;color:rgba(255,255,255,0.30)">
        ${phase}
      </div>
      <div style="font-size:8px;color:rgba(0,238,255,0.35);margin-top:4px">
        SynCity Signal Control · Active
      </div>
    </div>`;
}

// ── GeoJSON helpers ────────────────────────────────────────────────────────
function junctionFeatures(congestionMap: Record<string, number>): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: JUNCTIONS.map(j => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [j.lng, j.lat] },
      properties: {
        id:         j.id,
        name:       j.name,
        congestion: congestionMap[j.id] ?? j.baseline,
      },
    })),
  };
}

function trafficFeatures(locations: BackendLocation[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: locations
      .filter(l => l.lat && l.lng && l.congestion_level !== null)
      .map(l => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [l.lng, l.lat] },
        properties: {
          name:       l.name,
          congestion: l.congestion_level ?? 0,
          speed:      l.avg_speed_kmh ?? 0,
          vehicles:   l.vehicle_count ?? 0,
        },
      })),
  };
}

function incidentFeatures(events: BackendEvent[]): GeoJSON.FeatureCollection {
  // Events without lat/lng get placed at a random Bangalore point — won't happen in prod
  const BANGALORE_CENTER: [number, number] = [77.5946, 12.9716];
  return {
    type: 'FeatureCollection',
    features: events.map(e => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: BANGALORE_CENTER },
      properties: {
        id:       e.id,
        type:     e.event_type,
        severity: e.severity,
        desc:     e.description ?? e.event_type,
      },
    })),
  };
}

// ── Component ─────────────────────────────────────────────────────────────
interface ControlMapProps {
  locations:  BackendLocation[];
  incidents:  BackendEvent[];
}

export default function ControlMap({ locations, incidents }: ControlMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef       = useRef<mapboxgl.Map | null>(null);
  const readyRef     = useRef(false);

  // Derive per-junction congestion from nearest backend location
  const buildCongestionMap = (locs: BackendLocation[]): Record<string, number> => {
    const map: Record<string, number> = {};
    JUNCTIONS.forEach(j => {
      let nearest = j.baseline;
      let minDist = Infinity;
      locs.forEach(l => {
        if (l.congestion_level === null) return;
        const d = Math.hypot((l.lat ?? 0) - j.lat, (l.lng ?? 0) - j.lng);
        if (d < minDist) { minDist = d; nearest = l.congestion_level!; }
      });
      map[j.id] = nearest;
    });
    return map;
  };

  // ── Initial map setup ────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN!;

    const map = new mapboxgl.Map({
      container:  containerRef.current,
      style:      'mapbox://styles/mapbox/dark-v11',
      center:     [77.5946, 12.9716],
      zoom:       11.2,
      pitch:      40,
      bearing:    -8,
      antialias:  true,
    });

    mapRef.current = map;

    map.on('load', () => {
      readyRef.current = true;

      // ── Mapbox real-time traffic flow ──────────────────────────────────
      map.addSource('mapbox-traffic', {
        type: 'vector',
        url:  'mapbox://mapbox.mapbox-traffic-v1',
      });
      map.addLayer({
        id:           'traffic-flow',
        type:         'line',
        source:       'mapbox-traffic',
        'source-layer': 'traffic',
        paint: {
          'line-width': ['interpolate', ['linear'], ['zoom'], 9, 1, 14, 3.5],
          'line-color': [
            'match', ['get', 'congestion'],
            'low',      '#30D158',
            'moderate', '#FF9500',
            'heavy',    '#FF3B30',
            'severe',   '#FF2D55',
            'rgba(255,255,255,0.12)',
          ],
          'line-opacity': 0.90,
        },
      });

      // ── Junction signal overlays ───────────────────────────────────────
      const congMap = buildCongestionMap(locations);
      map.addSource('junctions', { type: 'geojson', data: junctionFeatures(congMap) });

      map.addLayer({
        id: 'junction-halo',
        type: 'circle',
        source: 'junctions',
        paint: {
          'circle-radius': 18,
          'circle-color': [
            'interpolate', ['linear'], ['get', 'congestion'],
            0, '#30D158', 55, '#FF9500', 80, '#FF3B30',
          ],
          'circle-opacity': 0.14,
          'circle-blur': 1.2,
        },
      });
      map.addLayer({
        id: 'junction-ring',
        type: 'circle',
        source: 'junctions',
        paint: {
          'circle-radius': 9,
          'circle-color': 'transparent',
          'circle-stroke-width': 1.5,
          'circle-stroke-color': [
            'interpolate', ['linear'], ['get', 'congestion'],
            0, '#30D158', 55, '#FF9500', 80, '#FF3B30',
          ],
          'circle-stroke-opacity': 0.7,
        },
      });
      map.addLayer({
        id: 'junction-core',
        type: 'circle',
        source: 'junctions',
        paint: {
          'circle-radius': 4,
          'circle-color': [
            'interpolate', ['linear'], ['get', 'congestion'],
            0, '#30D158', 55, '#FF9500', 80, '#FF3B30',
          ],
        },
      });
      map.addLayer({
        id: 'junction-label',
        type: 'symbol',
        source: 'junctions',
        layout: {
          'text-field': ['get', 'name'],
          'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Regular'],
          'text-size': 9,
          'text-offset': [0, 1.6],
          'text-anchor': 'top',
        },
        paint: {
          'text-color': 'rgba(255,255,255,0.45)',
          'text-halo-color': '#080C14',
          'text-halo-width': 1,
        },
        minzoom: 11,
      });

      // ── Backend live traffic dots ──────────────────────────────────────
      map.addSource('backend-traffic', { type: 'geojson', data: trafficFeatures(locations) });
      map.addLayer({
        id: 'bt-glow',
        type: 'circle',
        source: 'backend-traffic',
        paint: {
          'circle-radius': 10,
          'circle-color': ['interpolate', ['linear'], ['get', 'congestion'], 0, '#00FF88', 35, '#FFCC00', 60, '#FF7722', 80, '#FF2222'],
          'circle-opacity': 0.15,
          'circle-blur': 1,
        },
      });
      map.addLayer({
        id: 'bt-dot',
        type: 'circle',
        source: 'backend-traffic',
        paint: {
          'circle-radius': 4.5,
          'circle-color': ['interpolate', ['linear'], ['get', 'congestion'], 0, '#00FF88', 35, '#FFCC00', 60, '#FF7722', 80, '#FF2222'],
          'circle-stroke-width': 1,
          'circle-stroke-color': 'rgba(255,255,255,0.35)',
        },
      });

      // ── Incident markers ───────────────────────────────────────────────
      map.addSource('incidents', { type: 'geojson', data: incidentFeatures(incidents) });
      map.addLayer({
        id: 'incident-dot',
        type: 'circle',
        source: 'incidents',
        paint: {
          'circle-radius': 7,
          'circle-color': '#FF3B30',
          'circle-stroke-width': 2,
          'circle-stroke-color': 'rgba(255,59,48,0.40)',
          'circle-blur': 0.2,
        },
      });

      // ── Popups ────────────────────────────────────────────────────────
      map.on('click', 'junction-core', e => {
        const props = e.features?.[0]?.properties;
        if (!props) return;
        new mapboxgl.Popup({ closeButton: false, maxWidth: '220px' })
          .setLngLat(e.lngLat)
          .setHTML(junctionPopupHtml(props.name, props.congestion))
          .addTo(map);
      });
      map.on('mouseenter', 'junction-core', () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', 'junction-core', () => { map.getCanvas().style.cursor = ''; });
    });

    return () => { map.remove(); mapRef.current = null; readyRef.current = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Live updates — junction congestion ────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    const src = map.getSource('junctions') as mapboxgl.GeoJSONSource | undefined;
    if (!src) return;
    src.setData(junctionFeatures(buildCongestionMap(locations)));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locations]);

  // ── Live updates — backend traffic dots ───────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    const src = map.getSource('backend-traffic') as mapboxgl.GeoJSONSource | undefined;
    if (!src) return;
    src.setData(trafficFeatures(locations));
  }, [locations]);

  // ── Live updates — incidents ───────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    const src = map.getSource('incidents') as mapboxgl.GeoJSONSource | undefined;
    if (!src) return;
    src.setData(incidentFeatures(incidents));
  }, [incidents]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />

      {/* Corner watermark */}
      <div style={{
        position: 'absolute', bottom: 8, left: 10, pointerEvents: 'none',
        fontFamily: "var(--font-jetbrains)", fontSize: '9px',
        color: 'rgba(0,238,255,0.25)', letterSpacing: '0.2em', textTransform: 'uppercase',
      }}>
        Mapbox · Real-time Traffic · Bangalore
      </div>

      {/* Legend */}
      <div style={{
        position: 'absolute', top: 10, left: 10, pointerEvents: 'none',
        background: 'rgba(8,12,20,0.85)', backdropFilter: 'blur(12px)',
        border: '1px solid rgba(0,238,255,0.10)', borderRadius: '3px',
        padding: '8px 10px',
        fontFamily: "var(--font-jetbrains)", fontSize: '9px',
        color: 'rgba(255,255,255,0.45)', display: 'flex', flexDirection: 'column', gap: '4px',
        letterSpacing: '0.12em', textTransform: 'uppercase',
      }}>
        {[
          { color: '#30D158', label: 'Clear < 55' },
          { color: '#FF9500', label: 'Moderate 55–79' },
          { color: '#FF3B30', label: 'Critical ≥ 80' },
        ].map(({ color, label }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
            {label}
          </div>
        ))}
        <div style={{
          marginTop: '4px', paddingTop: '4px',
          borderTop: '1px solid rgba(255,255,255,0.06)',
          color: 'rgba(0,238,255,0.40)',
        }}>
          ⬡ Signal junctions
        </div>
      </div>
    </div>
  );
}
