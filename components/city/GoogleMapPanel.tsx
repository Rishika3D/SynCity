'use client';

/**
 * components/city/GoogleMapPanel.tsx
 *
 * Picture-in-picture Google Maps panel — photorealistic 3D buildings via
 * google.maps.maps3d.Map3DElement (Map Tiles API).
 *
 *  ① Map Tiles API       — photorealistic 3D tiles + buildings (Map3DElement)
 *  ② Air Quality API     — live AQI badge in header (refreshes every 5 min)
 *  ③ Routes API          — Silk Board → Electronic City polyline + ETA
 *  ④ Geocoding API       — click → reverse-geocode to street address
 *  ⑤ Places API (New)    — nearby POIs
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { useJsApiLoader } from '@react-google-maps/api';
import {
  fetchGoogleAirQuality, computeRoute, reverseGeocode,
  searchNearbyPlaces, decodePolyline,
  type GoogleAqiData, type RouteData, type PlaceResult,
} from '@/services/googleApis';

// ─── Constants ────────────────────────────────────────────────────────────────

const CENTER = { lat: 12.9716, lng: 77.5946 };

const ROUTE_ORIGIN      = 'Silk Board Junction, Bengaluru, India';
const ROUTE_DESTINATION = 'Electronic City Phase 1, Bengaluru, India';

// Must be declared outside component to avoid reload-on-every-render warning
const GOOGLE_MAPS_LIBRARIES = ['maps3d'] as unknown as Parameters<typeof useJsApiLoader>[0]['libraries'];

// ─── Panel sizes ──────────────────────────────────────────────────────────────

const SIZES = {
  compact:  { w: 320, h: 260 },
  expanded: { w: 460, h: 380 },
} as const;

// ─── Subcomponents ────────────────────────────────────────────────────────────

function AqiBadge({ aqi }: { aqi: GoogleAqiData }) {
  return (
    <span
      style={{
        fontFamily: 'var(--font-inter)', fontSize: '7px', letterSpacing: '0.2em',
        textTransform: 'uppercase', color: aqi.color,
        background: aqi.color.replace('0.9)', '0.08)'),
        border: `1px solid ${aqi.color.replace('0.9)', '0.25)')}`,
        padding: '2px 7px',
      }}
      title={`${aqi.category} · ${aqi.recommendation}`}
    >
      AQI {aqi.uaqi}
    </span>
  );
}

function PanelHeader({
  viewMode, expanded, aqi, isLoadingAqi,
  onToggleView, onToggleSize, onClose,
}: {
  viewMode:      '3d' | 'top';
  expanded:      boolean;
  aqi:           GoogleAqiData | null;
  isLoadingAqi:  boolean;
  onToggleView:  () => void;
  onToggleSize:  () => void;
  onClose:       () => void;
}) {
  return (
    <div
      className="flex items-center justify-between px-2.5 py-1.5 gap-2"
      style={{ background: 'rgba(9,9,11,0.96)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}
    >
      <span style={{ fontFamily: 'var(--font-inter)', fontSize: '7.5px', letterSpacing: '0.35em', textTransform: 'uppercase', color: 'rgba(245,245,247,0.4)', flexShrink: 0 }}>
        Google Maps
      </span>

      <div className="flex-1 flex justify-center">
        {isLoadingAqi
          ? <span style={{ fontFamily: 'var(--font-inter)', fontSize: '7px', color: 'rgba(245,245,247,0.2)' }}>AQI…</span>
          : aqi ? <AqiBadge aqi={aqi} /> : null
        }
      </div>

      <div className="flex items-center gap-1.5 flex-shrink-0">
        <button onClick={onToggleView}
          style={{
            fontFamily: 'var(--font-inter)', fontSize: '7px', letterSpacing: '0.2em',
            textTransform: 'uppercase', color: 'rgba(10,132,255,0.8)',
            background: 'rgba(10,132,255,0.08)', border: '1px solid rgba(10,132,255,0.2)',
            padding: '2px 7px', cursor: 'pointer',
          }}>
          {viewMode === '3d' ? '3D' : 'TOP'}
        </button>
        <button onClick={onToggleSize}
          style={{ fontFamily: 'var(--font-inter)', fontSize: '10px', color: 'rgba(245,245,247,0.25)', background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px', lineHeight: 1 }}
          title={expanded ? 'Collapse' : 'Expand'}>
          {expanded ? '⊟' : '⊞'}
        </button>
        <button onClick={onClose}
          style={{ fontFamily: 'var(--font-inter)', fontSize: '10px', color: 'rgba(245,245,247,0.25)', background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px', lineHeight: 1 }}>
          ✕
        </button>
      </div>
    </div>
  );
}

function RouteInfoBar({ route }: { route: RouteData }) {
  return (
    <div
      className="flex items-center justify-between px-2.5 py-1"
      style={{ background: 'rgba(9,9,11,0.94)', borderTop: '1px solid rgba(255,255,255,0.06)' }}
    >
      <span style={{ fontFamily: 'var(--font-inter)', fontSize: '7px', letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(245,245,247,0.25)' }}>
        Silk Board → EC
      </span>
      <div className="flex items-center gap-3">
        <span style={{ fontFamily: 'var(--font-inter)', fontSize: '10px', fontWeight: 600, color: 'rgba(245,245,247,0.7)', fontVariantNumeric: 'tabular-nums' }}>
          {route.durationLabel}
        </span>
        <span style={{ fontFamily: 'var(--font-inter)', fontSize: '9px', color: 'rgba(245,245,247,0.3)', fontVariantNumeric: 'tabular-nums' }}>
          {route.distanceLabel}
        </span>
      </div>
    </div>
  );
}

function StatusBar({ lat, lng, placesCount, geocodeAddress }: {
  lat: number; lng: number; placesCount: number; geocodeAddress?: string;
}) {
  return (
    <div
      className="flex items-center justify-between px-2.5 py-1"
      style={{ background: 'rgba(9,9,11,0.94)', borderTop: '1px solid rgba(255,255,255,0.06)' }}
    >
      <span style={{ fontFamily: 'var(--font-inter)', fontSize: '7px', letterSpacing: '0.25em', textTransform: 'uppercase', color: 'rgba(245,245,247,0.2)', maxWidth: '65%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {geocodeAddress ?? `${lat.toFixed(3)}°N ${lng.toFixed(3)}°E`}
      </span>
      <span style={{ fontFamily: 'var(--font-inter)', fontSize: '7px', letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(10,132,255,0.45)' }}>
        {placesCount > 0 ? `${placesCount} POI` : ''}
      </span>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface GoogleMapPanelProps { onClose: () => void; }

export function GoogleMapPanel({ onClose }: GoogleMapPanelProps) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? '';

  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: apiKey,
    id:               'syncity-google-map-3d',
    libraries:        GOOGLE_MAPS_LIBRARIES,
  });

  const [viewMode,       setViewMode]       = useState<'3d' | 'top'>('3d');
  const [expanded,       setExpanded]       = useState(false);
  const [aqi,            setAqi]            = useState<GoogleAqiData | null>(null);
  const [isLoadingAqi,   setIsLoadingAqi]   = useState(false);
  const [route,          setRoute]          = useState<RouteData | null>(null);
  const [routePath,      setRoutePath]      = useState<{ lat: number; lng: number }[]>([]);
  const [places,         setPlaces]         = useState<PlaceResult[]>([]);
  const [geocodeAddress, setGeocodeAddress] = useState<string | undefined>();
  const [isGeocoding,    setIsGeocoding]    = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const polylineRef = useRef<any>(null);

  const { w, h } = expanded ? SIZES.expanded : SIZES.compact;

  // ── Init Map3DElement ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isLoaded || !containerRef.current || !apiKey) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const maps3d = (window.google?.maps as any)?.maps3d;
    if (!maps3d?.Map3DElement) {
      console.warn('[GoogleMapPanel] maps3d.Map3DElement not available');
      return;
    }

    // Clean up any previous instance
    containerRef.current.innerHTML = '';

    const mapEl = new maps3d.Map3DElement();
    mapEl.center    = { lat: CENTER.lat, lng: CENTER.lng, altitude: 400 };
    mapEl.tilt      = 67.5;
    mapEl.heading   = 0;
    mapEl.range     = 3500;
    mapEl.style.width  = '100%';
    mapEl.style.height = '100%';

    containerRef.current.appendChild(mapEl);
    mapRef.current = mapEl;

    // Click → geocode
    mapEl.addEventListener('gmp-click', async (e: { position?: { lat: number; lng: number } }) => {
      if (!e.position || isGeocoding) return;
      setIsGeocoding(true);
      try {
        const addr = await reverseGeocode(e.position.lat, e.position.lng);
        setGeocodeAddress(addr);
      } catch { /* ignore */ }
      finally { setIsGeocoding(false); }
    });

    return () => {
      if (containerRef.current) containerRef.current.innerHTML = '';
      mapRef.current    = null;
      polylineRef.current = null;
    };
  // only re-run on isLoaded change
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, apiKey]);

  // ── Sync tilt on viewMode toggle ─────────────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current) return;
    mapRef.current.tilt = viewMode === '3d' ? 67.5 : 0;
    mapRef.current.range = viewMode === '3d' ? 3500 : 6000;
  }, [viewMode]);

  // ── Sync panel size ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current) return;
    mapRef.current.range = viewMode === '3d' ? (expanded ? 2500 : 3500) : (expanded ? 5000 : 6000);
  }, [expanded, viewMode]);

  // ── Add/update route polyline ────────────────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current || !routePath.length) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const maps3d = (window.google?.maps as any)?.maps3d;
    if (!maps3d?.Polyline3DElement) return;

    // Remove previous polyline
    if (polylineRef.current) {
      try { polylineRef.current.remove(); } catch { /* ignore */ }
    }

    const poly = new maps3d.Polyline3DElement();
    poly.altitudeMode = maps3d.AltitudeMode?.CLAMP_TO_GROUND ?? 'CLAMP_TO_GROUND';
    poly.strokeColor  = 'rgba(10,132,255,0.95)';
    poly.strokeWidth  = 12;
    poly.geodesic     = true;
    poly.path         = routePath.map(p => ({ lat: p.lat, lng: p.lng, altitude: 8 }));

    mapRef.current.append(poly);
    polylineRef.current = poly;
  }, [routePath]);


  // ── Fetch Air Quality ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!apiKey || !isLoaded) return;
    const load = async () => {
      setIsLoadingAqi(true);
      try { setAqi(await fetchGoogleAirQuality()); }
      catch { /* use null */ }
      finally { setIsLoadingAqi(false); }
    };
    load();
    const id = setInterval(load, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [apiKey, isLoaded]);

  // ── Fetch Route ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!apiKey || !isLoaded) return;
    computeRoute(ROUTE_ORIGIN, ROUTE_DESTINATION)
      .then(r => { setRoute(r); setRoutePath(decodePolyline(r.encodedPolyline)); })
      .catch(() => {});
  }, [apiKey, isLoaded]);

  // ── Fetch Places ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!apiKey || !isLoaded) return;
    searchNearbyPlaces(CENTER.lat, CENTER.lng,
      ['technology_park', 'park', 'hospital', 'university'], 4500, 8,
    ).then(setPlaces).catch(() => {});
  }, [apiKey, isLoaded]);

  // ── No key ────────────────────────────────────────────────────────────────────
  if (!apiKey) {
    return (
      <div className="absolute bottom-16 left-4 sm:left-6 z-20 pointer-events-auto select-none overflow-hidden"
        style={{ width: w, background: 'rgba(9,9,11,0.92)', border: '1px solid rgba(255,255,255,0.1)', backdropFilter: 'blur(20px)' }}>
        <PanelHeader viewMode="3d" expanded={expanded} aqi={null} isLoadingAqi={false}
          onToggleView={() => {}} onToggleSize={() => setExpanded(v => !v)} onClose={onClose} />
        <div className="flex flex-col items-center justify-center gap-3 text-center px-4" style={{ height: h }}>
          <span style={{ fontSize: '20px', opacity: 0.2 }}>◎</span>
          <p style={{ fontFamily: 'var(--font-inter)', fontSize: '9px', letterSpacing: '0.3em', textTransform: 'uppercase', color: 'rgba(245,245,247,0.3)' }}>API Key Required</p>
          <code style={{ fontFamily: 'monospace', fontSize: '8px', color: 'rgba(10,132,255,0.7)', background: 'rgba(10,132,255,0.08)', padding: '3px 8px', border: '1px solid rgba(10,132,255,0.15)' }}>
            NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
          </code>
        </div>
      </div>
    );
  }

  // ── Load error ────────────────────────────────────────────────────────────────
  if (loadError) {
    return (
      <div className="absolute bottom-16 left-4 sm:left-6 z-20 pointer-events-auto overflow-hidden"
        style={{ width: w, background: 'rgba(9,9,11,0.92)', border: '1px solid rgba(255,69,58,0.2)', backdropFilter: 'blur(20px)' }}>
        <PanelHeader viewMode="3d" expanded={expanded} aqi={null} isLoadingAqi={false}
          onToggleView={() => {}} onToggleSize={() => setExpanded(v => !v)} onClose={onClose} />
        <div className="flex items-center justify-center" style={{ height: h }}>
          <p style={{ fontFamily: 'var(--font-inter)', fontSize: '9px', color: 'rgba(255,69,58,0.7)', letterSpacing: '0.2em', textTransform: 'uppercase' }}>Map failed to load</p>
        </div>
      </div>
    );
  }

  // ── Loading skeleton ──────────────────────────────────────────────────────────
  if (!isLoaded) {
    return (
      <div className="absolute bottom-16 left-4 sm:left-6 z-20 pointer-events-auto overflow-hidden"
        style={{ width: w, background: 'rgba(9,9,11,0.92)', border: '1px solid rgba(255,255,255,0.07)', backdropFilter: 'blur(20px)' }}>
        <PanelHeader viewMode="3d" expanded={expanded} aqi={null} isLoadingAqi={true}
          onToggleView={() => {}} onToggleSize={() => setExpanded(v => !v)} onClose={onClose} />
        <div className="animate-pulse" style={{ height: h, background: 'rgba(255,255,255,0.03)' }} />
      </div>
    );
  }

  // ── Live 3D map ───────────────────────────────────────────────────────────────
  return (
    <div
      className="absolute bottom-16 left-4 sm:left-6 z-20 pointer-events-auto overflow-hidden"
      style={{
        width:      w,
        border:     '1px solid rgba(255,255,255,0.12)',
        boxShadow:  '0 12px 40px rgba(0,0,0,0.7)',
        transition: 'width 0.3s ease, height 0.3s ease',
      }}
    >
      <PanelHeader
        viewMode={viewMode} expanded={expanded} aqi={aqi} isLoadingAqi={isLoadingAqi}
        onToggleView={() => setViewMode(v => v === '3d' ? 'top' : '3d')}
        onToggleSize={() => setExpanded(v => !v)}
        onClose={onClose}
      />

      {/* 3D map container */}
      <div style={{ height: h, transition: 'height 0.3s ease', position: 'relative', background: '#0a0a0d' }}>
        {isGeocoding && (
          <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none"
            style={{ background: 'rgba(9,9,11,0.3)' }}>
            <span style={{ fontFamily: 'var(--font-inter)', fontSize: '8px', letterSpacing: '0.3em', textTransform: 'uppercase', color: 'rgba(245,245,247,0.6)' }}>
              Locating…
            </span>
          </div>
        )}
        {/* Map3DElement is mounted here via useEffect */}
        <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
      </div>

      {route && <RouteInfoBar route={route} />}
      <StatusBar
        lat={CENTER.lat} lng={CENTER.lng}
        placesCount={places.length}
        geocodeAddress={geocodeAddress}
      />
    </div>
  );
}
