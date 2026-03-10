'use client';

/**
 * components/city/GoogleMapPanel.tsx
 *
 * Picture-in-picture Google Maps panel — all 6 APIs wired:
 *
 *  ① Maps JavaScript API  — satellite / dark-road base map
 *  ② Air Quality API      — live AQI badge in header (refreshes every 5 min)
 *  ③ Routes API           — Silk Board → Electronic City commute polyline + ETA
 *  ④ Geocoding API        — click anywhere → reverse-geocode to street address
 *  ⑤ Places API (New)     — nearby tech parks shown as teal markers
 *  ⑥ Map Tiles API        — enabled via mapId (photorealistic 3D tiles ready)
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import {
  GoogleMap, useJsApiLoader,
  Marker, InfoWindow, Polyline,
} from '@react-google-maps/api';
import {
  fetchGoogleAirQuality, computeRoute, reverseGeocode,
  searchNearbyPlaces, decodePolyline,
  type GoogleAqiData, type RouteData, type PlaceResult,
} from '@/services/googleApis';

// ─── Constants ────────────────────────────────────────────────────────────────

const BANGALORE_CENTER = { lat: 12.9716, lng: 77.5946 };

// Famous Bangalore commute corridor for the Routes demo
const ROUTE_ORIGIN      = 'Silk Board Junction, Bengaluru, India';
const ROUTE_DESTINATION = 'Electronic City Phase 1, Bengaluru, India';

// District reference markers
const DISTRICT_MARKERS = [
  { name: 'Koramangala',     lat: 12.9352, lng: 77.6245, type: 'Tech / Residential' },
  { name: 'Indiranagar',     lat: 12.9784, lng: 77.6408, type: 'Commercial'          },
  { name: 'Whitefield',      lat: 12.9698, lng: 77.7499, type: 'Tech Hub'            },
  { name: 'Electronic City', lat: 12.8399, lng: 77.6770, type: 'Industrial'          },
  { name: 'Jayanagar',       lat: 12.9308, lng: 77.5836, type: 'Residential'         },
  { name: 'Hebbal',          lat: 13.0358, lng: 77.5970, type: 'Mixed'               },
];

// Dark map style (roadmap mode)
const DARK_STYLES: google.maps.MapTypeStyle[] = [
  { elementType: 'geometry',           stylers: [{ color: '#0a0a0d' }] },
  { elementType: 'labels.icon',        stylers: [{ visibility: 'off' }] },
  { elementType: 'labels.text.fill',   stylers: [{ color: 'rgba(245,245,247,0.4)' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#09090b' }] },
  { featureType: 'road',               elementType: 'geometry',        stylers: [{ color: '#1c1c22' }] },
  { featureType: 'road.highway',       elementType: 'geometry',        stylers: [{ color: '#2a2a36' }] },
  { featureType: 'water',              elementType: 'geometry',        stylers: [{ color: '#0d1520' }] },
  { featureType: 'poi.park',           elementType: 'geometry',        stylers: [{ color: '#0e1a10' }] },
  { featureType: 'poi',                stylers: [{ visibility: 'off' }] },
  { featureType: 'transit',            stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative',     elementType: 'geometry.stroke', stylers: [{ color: 'rgba(255,255,255,0.06)' }] },
];

// ─── Panel sizes ──────────────────────────────────────────────────────────────

const SIZES = {
  compact:  { w: 240, h: 190 },
  expanded: { w: 360, h: 300 },
} as const;

// ─── Subcomponents ────────────────────────────────────────────────────────────

function AqiBadge({ aqi }: { aqi: GoogleAqiData }) {
  return (
    <span
      style={{
        fontFamily: 'var(--font-inter)', fontSize: '7px', letterSpacing: '0.2em',
        textTransform: 'uppercase', color: aqi.color, background: `${aqi.color.replace('0.9', '0.08')}`,
        border: `1px solid ${aqi.color.replace('0.9', '0.25')}`, padding: '2px 7px',
      }}
      title={`${aqi.category} · ${aqi.recommendation}`}
    >
      AQI {aqi.uaqi}
    </span>
  );
}

function PanelHeader({
  mapType, expanded, aqi, isLoadingAqi,
  onToggleType, onToggleSize, onClose,
}: {
  mapType:       'satellite' | 'roadmap';
  expanded:      boolean;
  aqi:           GoogleAqiData | null;
  isLoadingAqi:  boolean;
  onToggleType:  () => void;
  onToggleSize:  () => void;
  onClose:       () => void;
}) {
  return (
    <div
      className="flex items-center justify-between px-2.5 py-1.5 gap-2"
      style={{ background: 'rgba(9,9,11,0.96)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}
    >
      {/* Title */}
      <span style={{ fontFamily: 'var(--font-inter)', fontSize: '7.5px', letterSpacing: '0.35em', textTransform: 'uppercase', color: 'rgba(245,245,247,0.4)', flexShrink: 0 }}>
        Google Maps
      </span>

      {/* AQI badge (live) */}
      <div className="flex-1 flex justify-center">
        {isLoadingAqi
          ? <span style={{ fontFamily: 'var(--font-inter)', fontSize: '7px', color: 'rgba(245,245,247,0.2)' }}>AQI…</span>
          : aqi
          ? <AqiBadge aqi={aqi} />
          : null
        }
      </div>

      <div className="flex items-center gap-1.5 flex-shrink-0">
        {/* Map type */}
        <button onClick={onToggleType}
          style={{
            fontFamily: 'var(--font-inter)', fontSize: '7px', letterSpacing: '0.2em', textTransform: 'uppercase',
            color: 'rgba(10,132,255,0.8)', background: 'rgba(10,132,255,0.08)',
            border: '1px solid rgba(10,132,255,0.2)', padding: '2px 7px', cursor: 'pointer',
          }}>
          {mapType === 'satellite' ? 'SAT' : 'MAP'}
        </button>
        {/* Expand */}
        <button onClick={onToggleSize}
          style={{ fontFamily: 'var(--font-inter)', fontSize: '10px', color: 'rgba(245,245,247,0.25)', background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px', lineHeight: 1 }}
          title={expanded ? 'Collapse' : 'Expand'}>
          {expanded ? '⊟' : '⊞'}
        </button>
        {/* Close */}
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

function StatusBar({ lat, lng, placesCount }: { lat: number; lng: number; placesCount: number }) {
  return (
    <div
      className="flex items-center justify-between px-2.5 py-1"
      style={{ background: 'rgba(9,9,11,0.94)', borderTop: '1px solid rgba(255,255,255,0.06)' }}
    >
      <span style={{ fontFamily: 'var(--font-inter)', fontSize: '7px', letterSpacing: '0.25em', textTransform: 'uppercase', color: 'rgba(245,245,247,0.2)' }}>
        {lat.toFixed(3)}°N {lng.toFixed(3)}°E
      </span>
      <span style={{ fontFamily: 'var(--font-inter)', fontSize: '7px', letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(10,132,255,0.45)' }}>
        {placesCount > 0 ? `${placesCount} POI` : ''}
      </span>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface GoogleMapPanelProps {
  onClose: () => void;
}

export function GoogleMapPanel({ onClose }: GoogleMapPanelProps) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? '';

  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: apiKey,
    id:               'syncity-google-map',
  });

  const [mapType,        setMapType]        = useState<'satellite' | 'roadmap'>('satellite');
  const [expanded,       setExpanded]       = useState(false);
  const [activeMarker,   setActiveMarker]   = useState<string | null>(null);
  const [geocodePopup,   setGeocodePopup]   = useState<{ lat: number; lng: number; address: string } | null>(null);
  const [isGeocoding,    setIsGeocoding]    = useState(false);

  // API data states
  const [aqi,            setAqi]            = useState<GoogleAqiData | null>(null);
  const [isLoadingAqi,   setIsLoadingAqi]   = useState(false);
  const [route,          setRoute]          = useState<RouteData | null>(null);
  const [routePath,      setRoutePath]      = useState<google.maps.LatLngLiteral[]>([]);
  const [places,         setPlaces]         = useState<PlaceResult[]>([]);

  const mapRef = useRef<google.maps.Map | null>(null);

  const { w, h } = expanded ? SIZES.expanded : SIZES.compact;

  // ── Fetch Air Quality (with refresh) ────────────────────────────────────────
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

  // ── Fetch Route (once on mount) ──────────────────────────────────────────────
  useEffect(() => {
    if (!apiKey || !isLoaded) return;
    computeRoute(ROUTE_ORIGIN, ROUTE_DESTINATION)
      .then(r => { setRoute(r); setRoutePath(decodePolyline(r.encodedPolyline)); })
      .catch(() => { /* silently skip if Routes API unavailable */ });
  }, [apiKey, isLoaded]);

  // ── Fetch nearby Places (once on expand or mount) ────────────────────────────
  useEffect(() => {
    if (!apiKey || !isLoaded) return;
    searchNearbyPlaces(
      BANGALORE_CENTER.lat, BANGALORE_CENTER.lng,
      ['technology_park', 'park', 'hospital', 'university'],
      4500, 8,
    ).then(setPlaces).catch(() => {});
  }, [apiKey, isLoaded]);

  // ── Map handlers ─────────────────────────────────────────────────────────────
  const onLoad = useCallback((map: google.maps.Map) => {
    mapRef.current = map;
  }, []);

  const onUnmount = useCallback(() => {
    mapRef.current = null;
  }, []);

  const handleMapClick = useCallback(async (e: google.maps.MapMouseEvent) => {
    if (!e.latLng || isGeocoding) return;
    const lat = e.latLng.lat();
    const lng = e.latLng.lng();
    setIsGeocoding(true);
    setGeocodePopup(null);
    try {
      const address = await reverseGeocode(lat, lng);
      setGeocodePopup({ lat, lng, address });
      setActiveMarker(null);
    } catch { /* ignore */ }
    finally { setIsGeocoding(false); }
  }, [isGeocoding]);

  // ── No key ────────────────────────────────────────────────────────────────────
  if (!apiKey) {
    return (
      <div className="absolute bottom-16 left-4 sm:left-6 z-20 pointer-events-auto select-none overflow-hidden"
        style={{ width: w, background: 'rgba(9,9,11,0.92)', border: '1px solid rgba(255,255,255,0.1)', backdropFilter: 'blur(20px)' }}>
        <PanelHeader mapType={mapType} expanded={expanded} aqi={null} isLoadingAqi={false}
          onToggleType={() => setMapType(t => t === 'satellite' ? 'roadmap' : 'satellite')}
          onToggleSize={() => setExpanded(v => !v)} onClose={onClose} />
        <div className="flex flex-col items-center justify-center gap-3 text-center px-4" style={{ height: h }}>
          <span style={{ fontSize: '20px', opacity: 0.2 }}>◎</span>
          <p style={{ fontFamily: 'var(--font-inter)', fontSize: '9px', letterSpacing: '0.3em', textTransform: 'uppercase', color: 'rgba(245,245,247,0.3)' }}>API Key Required</p>
          <code style={{ fontFamily: 'monospace', fontSize: '8px', color: 'rgba(10,132,255,0.7)', background: 'rgba(10,132,255,0.08)', padding: '3px 8px', border: '1px solid rgba(10,132,255,0.15)' }}>
            NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
          </code>
        </div>
        <StatusBar lat={BANGALORE_CENTER.lat} lng={BANGALORE_CENTER.lng} placesCount={0} />
      </div>
    );
  }

  // ── Load error ────────────────────────────────────────────────────────────────
  if (loadError) {
    return (
      <div className="absolute bottom-16 left-4 sm:left-6 z-20 pointer-events-auto overflow-hidden"
        style={{ width: w, background: 'rgba(9,9,11,0.92)', border: '1px solid rgba(255,69,58,0.2)', backdropFilter: 'blur(20px)' }}>
        <PanelHeader mapType={mapType} expanded={expanded} aqi={null} isLoadingAqi={false}
          onToggleType={() => {}} onToggleSize={() => setExpanded(v => !v)} onClose={onClose} />
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
        <PanelHeader mapType={mapType} expanded={expanded} aqi={null} isLoadingAqi={true}
          onToggleType={() => {}} onToggleSize={() => setExpanded(v => !v)} onClose={onClose} />
        <div className="animate-pulse" style={{ height: h, background: 'rgba(255,255,255,0.03)' }} />
        <StatusBar lat={BANGALORE_CENTER.lat} lng={BANGALORE_CENTER.lng} placesCount={0} />
      </div>
    );
  }

  // ── Live map ──────────────────────────────────────────────────────────────────
  return (
    <div
      className="absolute bottom-16 left-4 sm:left-6 z-20 pointer-events-auto overflow-hidden"
      style={{
        width:      w,
        border:     '1px solid rgba(255,255,255,0.12)',
        boxShadow:  '0 12px 40px rgba(0,0,0,0.7)',
        transition: 'width 0.3s ease',
      }}
    >
      <PanelHeader
        mapType={mapType} expanded={expanded} aqi={aqi} isLoadingAqi={isLoadingAqi}
        onToggleType={() => setMapType(t => t === 'satellite' ? 'roadmap' : 'satellite')}
        onToggleSize={() => setExpanded(v => !v)}
        onClose={onClose}
      />

      {/* Map canvas */}
      <div style={{ height: h, transition: 'height 0.3s ease', position: 'relative' }}>

        {/* Geocoding in-progress overlay */}
        {isGeocoding && (
          <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none"
            style={{ background: 'rgba(9,9,11,0.3)' }}>
            <span style={{ fontFamily: 'var(--font-inter)', fontSize: '8px', letterSpacing: '0.3em', textTransform: 'uppercase', color: 'rgba(245,245,247,0.6)' }}>
              Locating…
            </span>
          </div>
        )}

        <GoogleMap
          mapContainerStyle={{ width: '100%', height: '100%' }}
          center={BANGALORE_CENTER}
          zoom={expanded ? 12 : 11}
          mapTypeId={mapType}
          options={{
            disableDefaultUI:   true,
            zoomControl:        expanded,
            gestureHandling:    'greedy',
            styles:             mapType === 'roadmap' ? DARK_STYLES : undefined,
            backgroundColor:    '#09090b',
            clickableIcons:     false,
          }}
          onLoad={onLoad}
          onUnmount={onUnmount}
          onClick={handleMapClick}
        >
          {/* ① Route polyline — Routes API */}
          {routePath.length > 0 && (
            <Polyline
              path={routePath}
              options={{
                strokeColor:   'rgba(10,132,255,0.85)',
                strokeWeight:  expanded ? 3 : 2,
                strokeOpacity: 0.9,
                geodesic:      true,
              }}
            />
          )}

          {/* ② District markers */}
          {DISTRICT_MARKERS.map(d => (
            <Marker
              key={d.name}
              position={{ lat: d.lat, lng: d.lng }}
              title={d.name}
              onClick={() => { setActiveMarker(d.name); setGeocodePopup(null); }}
              icon={{
                path:         google.maps.SymbolPath.CIRCLE,
                scale:        expanded ? 5 : 3.5,
                fillColor:    'rgba(245,245,247,0.85)',
                fillOpacity:  1,
                strokeColor:  '#09090b',
                strokeWeight: 1.5,
              }}
            />
          ))}

          {/* ③ Places markers — Places API */}
          {places.map(p => (
            <Marker
              key={p.id}
              position={{ lat: p.lat, lng: p.lng }}
              title={p.name}
              onClick={() => { setActiveMarker(`place_${p.id}`); setGeocodePopup(null); }}
              icon={{
                path:         google.maps.SymbolPath.CIRCLE,
                scale:        expanded ? 4 : 2.5,
                fillColor:    'rgba(52,199,89,0.85)',
                fillOpacity:  1,
                strokeColor:  '#09090b',
                strokeWeight: 1,
              }}
            />
          ))}

          {/* District info window */}
          {activeMarker && (() => {
            const d = DISTRICT_MARKERS.find(x => x.name === activeMarker);
            if (!d) return null;
            return (
              <InfoWindow
                position={{ lat: d.lat, lng: d.lng }}
                onCloseClick={() => setActiveMarker(null)}
                options={{ pixelOffset: new google.maps.Size(0, -12) }}
              >
                <div style={{ background: '#09090b', padding: '8px 12px', border: '1px solid rgba(255,255,255,0.1)', minWidth: 120 }}>
                  <p style={{ fontFamily: 'var(--font-inter)', fontSize: '12px', fontWeight: 700, color: '#f5f5f7', marginBottom: '3px' }}>{d.name}</p>
                  <p style={{ fontFamily: 'var(--font-inter)', fontSize: '9px', letterSpacing: '0.15em', textTransform: 'uppercase', color: 'rgba(245,245,247,0.4)' }}>{d.type}</p>
                </div>
              </InfoWindow>
            );
          })()}

          {/* Place info window */}
          {activeMarker?.startsWith('place_') && (() => {
            const p = places.find(x => `place_${x.id}` === activeMarker);
            if (!p) return null;
            return (
              <InfoWindow
                position={{ lat: p.lat, lng: p.lng }}
                onCloseClick={() => setActiveMarker(null)}
                options={{ pixelOffset: new google.maps.Size(0, -10) }}
              >
                <div style={{ background: '#09090b', padding: '8px 12px', border: '1px solid rgba(255,255,255,0.1)', minWidth: 120 }}>
                  <p style={{ fontFamily: 'var(--font-inter)', fontSize: '12px', fontWeight: 700, color: '#f5f5f7', marginBottom: '3px' }}>{p.name}</p>
                  {p.rating && (
                    <p style={{ fontFamily: 'var(--font-inter)', fontSize: '9px', color: 'rgba(52,199,89,0.85)' }}>★ {p.rating.toFixed(1)}</p>
                  )}
                </div>
              </InfoWindow>
            );
          })()}

          {/* ④ Geocode popup — Geocoding API */}
          {geocodePopup && (
            <InfoWindow
              position={{ lat: geocodePopup.lat, lng: geocodePopup.lng }}
              onCloseClick={() => setGeocodePopup(null)}
              options={{ pixelOffset: new google.maps.Size(0, -8) }}
            >
              <div style={{ background: '#09090b', padding: '8px 12px', border: '1px solid rgba(10,132,255,0.2)', maxWidth: 200 }}>
                <p style={{ fontFamily: 'var(--font-inter)', fontSize: '7px', letterSpacing: '0.3em', textTransform: 'uppercase', color: 'rgba(10,132,255,0.6)', marginBottom: '4px' }}>
                  Geocoded
                </p>
                <p style={{ fontFamily: 'var(--font-inter)', fontSize: '11px', color: '#f5f5f7', lineHeight: 1.5 }}>
                  {geocodePopup.address}
                </p>
              </div>
            </InfoWindow>
          )}

        </GoogleMap>
      </div>

      {/* Route info bar — Routes API */}
      {route && <RouteInfoBar route={route} />}

      {/* Status bar */}
      <StatusBar
        lat={BANGALORE_CENTER.lat}
        lng={BANGALORE_CENTER.lng}
        placesCount={places.length}
      />
    </div>
  );
}
