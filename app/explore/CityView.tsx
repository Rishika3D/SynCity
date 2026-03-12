'use client';

/**
 * app/explore/CityView.tsx
 *
 * Layer strategy:
 *   z:0  Three.js  — always visible; permanent fallback + loading backdrop
 *   z:1  Google Maps 3D — loaded invisibly (opacity:0), fades in after tiles paint
 *
 * Why opacity instead of unmounting Three.js:
 *   gmp-centerchange fires when the camera is placed (~instant), NOT when tiles
 *   have finished rendering. If we remove Three.js on that event the user sees
 *   the Map3DElement grey loading screen. Keeping Three.js visible while Google
 *   Maps loads invisibly means the user never sees a blank frame.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { CityScene, DEFAULT_LAYERS }                from '@/components/CityScene';
import type { LayerVisibility }                     from '@/components/CityScene';
import { WeatherProvider }                          from '@/contexts/WeatherContext';
import { TimeOfDayProvider }                        from '@/contexts/TimeOfDayContext';
import { LayerControls }                            from '@/components/ui/LayerControls';
import { computeRoute, decodePolyline }             from '@/services/googleApis';
import type { CityData }                            from '@/types/osm';

const MAP_CENTER        = { lat: 12.9716, lng: 77.5946 };
const ROUTE_ORIGIN      = 'Silk Board Junction, Bengaluru, India';
const ROUTE_DESTINATION = 'Electronic City Phase 1, Bengaluru, India';

// Extra ms after gmp-centerchange before revealing the map.
// gmp-centerchange = camera placed. Tiles need extra time to actually paint.
const TILE_SETTLE_MS = 3000;

// ─── Direct Google Maps loader ────────────────────────────────────────────────

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    google: any;
    __syncityMapsReady?: Promise<void>;
    __syncity_gm_cb__?: () => void;
  }
}

function loadMaps3D(apiKey: string): Promise<void> {
  if (typeof window === 'undefined') return Promise.reject('SSR');
  if (window.__syncityMapsReady) return window.__syncityMapsReady;
  if (window.google?.maps?.maps3d?.Map3DElement) return Promise.resolve();

  window.__syncityMapsReady = new Promise<void>((resolve, reject) => {
    window.__syncity_gm_cb__ = () => {
      delete window.__syncity_gm_cb__;
      window.google.maps
        .importLibrary('maps3d')
        .then(resolve)
        .catch(reject);
    };

    document.getElementById('syncity-gmaps-3d')?.remove();

    const script    = document.createElement('script');
    script.id       = 'syncity-gmaps-3d';
    script.async    = true;
    script.src      =
      `https://maps.googleapis.com/maps/api/js` +
      `?key=${apiKey}` +
      `&v=alpha` +
      `&libraries=maps3d` +
      `&loading=async` +
      `&callback=__syncity_gm_cb__`;

    script.onerror = () => reject(new Error('Maps script load error'));
    document.head.appendChild(script);
  });

  return window.__syncityMapsReady;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

type GMState = 'idle' | 'loading' | 'ready' | 'error';

function useGoogleMaps3D(apiKey: string) {
  const [state, setState] = useState<GMState>('idle');

  useEffect(() => {
    if (!apiKey) { setState('error'); return; }
    if (window.google?.maps?.maps3d?.Map3DElement) { setState('ready'); return; }
    setState('loading');
    loadMaps3D(apiKey)
      .then(() => setState('ready'))
      .catch(() => setState('error'));
  }, [apiKey]);

  return state;
}

// ─── Google Maps 3D background ────────────────────────────────────────────────

function GoogleMapBackground({ onCameraReady }: { onCameraReady: () => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef       = useRef<unknown>(null);
  const mountedRef   = useRef(false);

  useEffect(() => {
    if (!containerRef.current || mountedRef.current) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const maps3d = window.google?.maps?.maps3d as any;
    if (!maps3d?.Map3DElement) return;

    mountedRef.current = true;
    containerRef.current.innerHTML = '';

    const mapEl         = new maps3d.Map3DElement();
    mapEl.tilt          = 60;
    mapEl.heading       = 0;
    mapEl.range         = 5500;
    mapEl.style.cssText = 'width:100%;height:100%;';

    // gmp-centerchange = camera positioned. NOT the same as tiles painted.
    // We notify the parent who then waits TILE_SETTLE_MS before revealing.
    mapEl.addEventListener('gmp-centerchange', onCameraReady, { once: true });

    containerRef.current.appendChild(mapEl);
    mapRef.current = mapEl;
    mapEl.center = { lat: MAP_CENTER.lat, lng: MAP_CENTER.lng, altitude: 0 };

    computeRoute(ROUTE_ORIGIN, ROUTE_DESTINATION)
      .then(r => {
        if (!mapRef.current) return;
        const path = decodePolyline(r.encodedPolyline);
        const Poly = maps3d.Polyline3DElement;
        if (!Poly) return;
        const poly        = new Poly();
        poly.altitudeMode  = maps3d.AltitudeMode?.CLAMP_TO_GROUND ?? 'CLAMP_TO_GROUND';
        poly.strokeColor   = 'rgba(10,132,255,0.9)';
        poly.strokeWidth   = 14;
        poly.geodesic      = true;
        poly.path          = path.map((p: { lat: number; lng: number }) =>
          ({ lat: p.lat, lng: p.lng, altitude: 8 }));
        (mapRef.current as { append: (el: unknown) => void }).append(poly);
      })
      .catch(() => {});

    return () => {
      mapEl.removeEventListener('gmp-centerchange', onCameraReady);
      if (containerRef.current) containerRef.current.innerHTML = '';
      mapRef.current     = null;
      mountedRef.current = false;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={containerRef} className="absolute inset-0" />;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function CityView({ data }: { data: CityData }) {
  const [layers, setLayers] = useState<LayerVisibility>(DEFAULT_LAYERS);

  const apiKey  = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? '';
  const gmState = useGoogleMaps3D(apiKey);

  const useGoogle   = gmState === 'ready';
  const useFallback = !apiKey || gmState === 'error';

  // mapVisible: false = Google Maps loaded but invisible (opacity:0)
  //             true  = tiles have had time to paint, fade in
  const [mapVisible, setMapVisible] = useState(false);

  const handleCameraReady = useCallback(() => {
    // Give tiles TILE_SETTLE_MS after camera placement to actually render
    setTimeout(() => setMapVisible(true), TILE_SETTLE_MS);
  }, []);

  return (
    <TimeOfDayProvider>
      <WeatherProvider>

        {/*
          z:0 — Three.js city.
          Always rendered. Acts as loading backdrop while Google Maps is invisible.
          Once Google Maps fades in (opacity:1) it fully covers this layer.
          Stays permanently visible when in fallback mode (no key / error).
        */}
        <div className="absolute inset-0" style={{ zIndex: 0 }}>
          <CityScene data={data} layers={layers} />
        </div>

        {/*
          z:1 — Google Maps 3D.
          Loads with opacity:0 so the grey loading screen never shows.
          Fades in over 1.5s once TILE_SETTLE_MS has elapsed after gmp-centerchange.
          pointerEvents disabled until visible so Three.js stays interactive.
        */}
        {useGoogle && !useFallback && (
          <div
            className="absolute inset-0"
            style={{
              zIndex:        1,
              opacity:       mapVisible ? 1 : 0,
              transition:    mapVisible ? 'opacity 1.5s ease-in' : 'none',
              pointerEvents: mapVisible ? 'auto' : 'none',
            }}
          >
            <GoogleMapBackground onCameraReady={handleCameraReady} />
          </div>
        )}

        <LayerControls layers={layers} onChange={setLayers} />

      </WeatherProvider>
    </TimeOfDayProvider>
  );
}
