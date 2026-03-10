/**
 * services/googleApis.ts
 *
 * Client-safe wrappers for the Google Maps Platform APIs enabled on this project.
 *
 * APIs used:
 *   Air Quality API        — live AQI, pollutants, health recommendations
 *   Routes API             — driving route polyline + ETA + distance
 *   Geocoding API          — reverse geocode lat/lng → street address
 *   Places API (New)       — nearby points of interest
 *
 * All calls use NEXT_PUBLIC_GOOGLE_MAPS_API_KEY.
 * They are made client-side — CORS is permitted by Google for these endpoints.
 */

const KEY = typeof window !== 'undefined'
  ? (process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? '')
  : '';

const LAT = 12.9716;
const LNG = 77.5946;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GoogleAqiData {
  uaqi:              number;          // Universal AQI (0–500)
  category:          string;          // "Good air quality" etc.
  dominantPollutant: string;          // "pm25", "no2" etc.
  pm25:              number | null;   // µg/m³
  pm10:              number | null;
  no2:               number | null;
  o3:                number | null;
  recommendation:    string;          // general population advice
  color:             string;          // hex approximation for UI
}

export interface RouteData {
  encodedPolyline: string;
  durationSecs:    number;
  distanceMetres:  number;
  durationLabel:   string;  // "23 min"
  distanceLabel:   string;  // "14.2 km"
}

export interface PlaceResult {
  id:      string;
  name:    string;
  lat:     number;
  lng:     number;
  types:   string[];
  rating?: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function aqiColor(aqi: number): string {
  if (aqi <=  50) return 'rgba(52,199,89,0.9)';   // green  — Good
  if (aqi <= 100) return 'rgba(255,214,10,0.9)';   // yellow — Moderate
  if (aqi <= 150) return 'rgba(255,159,10,0.9)';   // amber  — Unhealthy for sensitive
  if (aqi <= 200) return 'rgba(255,69,58,0.9)';    // red    — Unhealthy
  return 'rgba(175,82,222,0.9)';                    // purple — Hazardous
}

function formatDuration(secs: number): string {
  const m = Math.round(secs / 60);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)}h ${m % 60}m`;
}

function formatDistance(metres: number): string {
  return metres >= 1000
    ? `${(metres / 1000).toFixed(1)} km`
    : `${metres} m`;
}

// ─── Air Quality API ──────────────────────────────────────────────────────────
// POST https://airquality.googleapis.com/v1/currentConditions:lookup

export async function fetchGoogleAirQuality(
  lat = LAT,
  lng = LNG,
): Promise<GoogleAqiData> {
  if (!KEY) throw new Error('No API key');

  const res = await fetch(
    `https://airquality.googleapis.com/v1/currentConditions:lookup?key=${KEY}`,
    {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        location:           { latitude: lat, longitude: lng },
        extraComputations:  [
          'HEALTH_RECOMMENDATIONS',
          'DOMINANT_POLLUTANT_CONCENTRATION',
          'POLLUTANT_ADDITIONAL_INFO',
        ],
        languageCode: 'en',
      }),
    },
  );

  if (!res.ok) throw new Error(`Air Quality API: ${res.status}`);
  const json = await res.json();

  // UAQI index (universal — always present)
  const uaqiIdx  = (json.indexes as Record<string, unknown>[] ?? [])
    .find((i: Record<string, unknown>) => i.code === 'uaqi') as Record<string, unknown> | undefined;
  const uaqi     = Number(uaqiIdx?.aqi ?? 80);
  const category = String(uaqiIdx?.category ?? 'Unknown');

  // Dominant pollutant
  const dominant = String(uaqiIdx?.dominantPollutant ?? 'pm25');

  // Pollutant concentrations
  const pollutants = (json.pollutants as Record<string, unknown>[] ?? []);
  const conc = (code: string): number | null => {
    const p = pollutants.find((x: Record<string, unknown>) => x.code === code) as Record<string, unknown> | undefined;
    const c = p?.concentration as Record<string, unknown> | undefined;
    return c ? Number(c.value) : null;
  };

  // Health recommendation
  const rec = String(
    (json.healthRecommendations as Record<string, unknown> | undefined)?.generalPopulation
    ?? 'Monitor local conditions.',
  );

  return {
    uaqi,
    category,
    dominantPollutant: dominant,
    pm25:              conc('pm25'),
    pm10:              conc('pm10'),
    no2:               conc('no2'),
    o3:                conc('o3'),
    recommendation:    rec,
    color:             aqiColor(uaqi),
  };
}

// ─── Routes API ───────────────────────────────────────────────────────────────
// POST https://routes.googleapis.com/directions/v2:computeRoutes

export async function computeRoute(
  originAddress:      string,
  destinationAddress: string,
): Promise<RouteData> {
  if (!KEY) throw new Error('No API key');

  const res = await fetch(
    `https://routes.googleapis.com/directions/v2:computeRoutes?key=${KEY}`,
    {
      method:  'POST',
      headers: {
        'Content-Type':   'application/json',
        'X-Goog-FieldMask':
          'routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline',
      },
      body: JSON.stringify({
        origin:              { address: originAddress },
        destination:         { address: destinationAddress },
        travelMode:          'DRIVE',
        routingPreference:   'TRAFFIC_AWARE',
      }),
    },
  );

  if (!res.ok) throw new Error(`Routes API: ${res.status}`);
  const json = await res.json();

  const route = (json.routes as Record<string, unknown>[])?.[0];
  if (!route) throw new Error('No route returned');

  const durationSecs   = parseInt(String(route.duration ?? '0s').replace('s', ''), 10);
  const distanceMetres = Number(route.distanceMeters ?? 0);
  const poly           = (route.polyline as Record<string, string> | undefined)?.encodedPolyline ?? '';

  return {
    encodedPolyline: poly,
    durationSecs,
    distanceMetres,
    durationLabel:   formatDuration(durationSecs),
    distanceLabel:   formatDistance(distanceMetres),
  };
}

// ─── Polyline decoder ─────────────────────────────────────────────────────────
// Decodes Google's encoded polyline format without needing the geometry library.

export function decodePolyline(encoded: string): google.maps.LatLngLiteral[] {
  const points: google.maps.LatLngLiteral[] = [];
  let idx = 0, lat = 0, lng = 0;

  while (idx < encoded.length) {
    let b: number, shift = 0, result = 0;
    do { b = encoded.charCodeAt(idx++) - 63; result |= (b & 0x1f) << shift; shift += 5; }
    while (b >= 0x20);
    lat += (result & 1) ? ~(result >> 1) : result >> 1;

    shift = 0; result = 0;
    do { b = encoded.charCodeAt(idx++) - 63; result |= (b & 0x1f) << shift; shift += 5; }
    while (b >= 0x20);
    lng += (result & 1) ? ~(result >> 1) : result >> 1;

    points.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }
  return points;
}

// ─── Geocoding API ────────────────────────────────────────────────────────────
// GET https://maps.googleapis.com/maps/api/geocode/json

export async function reverseGeocode(lat: number, lng: number): Promise<string> {
  if (!KEY) return `${lat.toFixed(4)}°N ${lng.toFixed(4)}°E`;

  const res = await fetch(
    `https://maps.googleapis.com/maps/api/geocode/json` +
    `?latlng=${lat},${lng}&key=${KEY}`,
  );
  if (!res.ok) throw new Error(`Geocoding API: ${res.status}`);
  const json = await res.json();

  // Pick the first result that is a street-level address
  const results = (json.results as Record<string, unknown>[]) ?? [];
  const best = results.find(r =>
    (r.types as string[]).some(t => ['route', 'street_address', 'premise'].includes(t)),
  ) ?? results[0];

  return String(best?.formatted_address ?? `${lat.toFixed(4)}, ${lng.toFixed(4)}`);
}

// ─── Places API (New) ─────────────────────────────────────────────────────────
// POST https://places.googleapis.com/v1/places:searchNearby

export async function searchNearbyPlaces(
  lat:    number,
  lng:    number,
  types:  string[],
  radius = 4000,
  max    = 8,
): Promise<PlaceResult[]> {
  if (!KEY) return [];

  const res = await fetch(
    `https://places.googleapis.com/v1/places:searchNearby`,
    {
      method:  'POST',
      headers: {
        'Content-Type':    'application/json',
        'X-Goog-Api-Key':  KEY,
        'X-Goog-FieldMask': 'places.id,places.displayName,places.location,places.types,places.rating',
      },
      body: JSON.stringify({
        includedTypes:      types,
        maxResultCount:     max,
        locationRestriction: {
          circle: {
            center: { latitude: lat, longitude: lng },
            radius,
          },
        },
      }),
    },
  );

  if (!res.ok) return [];
  const json = await res.json();

  return ((json.places as Record<string, unknown>[]) ?? []).map(p => ({
    id:      String(p.id ?? ''),
    name:    String((p.displayName as Record<string, string> | undefined)?.text ?? 'Unknown'),
    lat:     Number((p.location as Record<string, number> | undefined)?.latitude  ?? 0),
    lng:     Number((p.location as Record<string, number> | undefined)?.longitude ?? 0),
    types:   (p.types as string[]) ?? [],
    rating:  p.rating != null ? Number(p.rating) : undefined,
  }));
}
