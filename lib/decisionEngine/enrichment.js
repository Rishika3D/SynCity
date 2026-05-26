/**
 * enrichment.js — Attach real-world signals to each Mapbox route.
 *
 * Three signals are added to every route:
 *
 *   1. congestion  — Average congestion level (0–100) along the route corridor.
 *                    Source: PostGIS spatial query against our traffic_data table.
 *                    Note: Mapbox already bakes congestion into its ETA. This signal
 *                    cross-validates with our own ground sensor network (CPCB/IoT),
 *                    which has different coverage and update frequency.
 *
 *   2. weatherPenalty — Normalised 0→1 penalty based on current weather conditions.
 *                       Source: Open-Meteo free API (no key required).
 *
 *   3. stability   — How geometrically similar this route is to the active one.
 *                    0 = identical path, 1 = completely different road.
 *                    Prevents switching to a marginally faster route that adds
 *                    unnecessary cognitive load for the driver.
 *
 * The DB parameter accepts either:
 *   - A node-postgres Pool/Client instance (direct PostGIS access)
 *   - An object with a .query() method that proxies to the FastAPI backend
 *
 * All functions are pure async — no side effects, no global state.
 */

'use strict';

const { weatherCodeToPenalty, CORRIDOR_RADIUS_M, STABILITY_SAMPLE_N } = require('./config');

// ── Congestion from PostGIS ───────────────────────────────────────────────────

/**
 * Returns the average congestion level for locations within CORRIDOR_RADIUS_M
 * metres of the route geometry, based on readings from the last 15 minutes.
 *
 * Returns 50 (neutral) if no readings exist — never throws.
 *
 * @param {Object} routeGeometry - GeoJSON LineString from Mapbox route
 * @param {Object} db            - pg Pool/Client or compatible adapter
 * @returns {{ avgCongestion: number, readingsCount: number }}
 */
async function getCongestionForRoute(routeGeometry, db) {
  const sql = `
    SELECT
      COALESCE(AVG(t.congestion_level), 50)::float  AS avg_congestion,
      COUNT(t.id)::int                               AS readings_count
    FROM traffic_data t
    JOIN locations l ON l.id = t.location_id
    WHERE ST_DWithin(
      l.geom::geography,
      ST_GeomFromGeoJSON($1)::geography,
      $2
    )
    AND t.timestamp > NOW() - INTERVAL '15 minutes'
  `;

  try {
    const result = await db.query(sql, [
      JSON.stringify(routeGeometry),
      CORRIDOR_RADIUS_M,
    ]);
    const row = result.rows[0];
    return {
      avgCongestion:  parseFloat(row.avg_congestion) || 50,
      readingsCount:  parseInt(row.readings_count, 10) || 0,
    };
  } catch (err) {
    // Non-fatal — degrade gracefully, log for observability
    console.warn('[enrichment] PostGIS congestion query failed:', err.message);
    return { avgCongestion: 50, readingsCount: 0 };
  }
}

// ── Weather penalty from Open-Meteo ──────────────────────────────────────────

/**
 * Fetches current weather at the route midpoint and maps the WMO weather code
 * to a 0→1 penalty value.
 *
 * Uses the route's midpoint coordinate — a rough but fast approximation.
 * For very long routes consider sampling 3 points and averaging.
 *
 * @param {number[][]} coordinates - [[lng, lat], ...] from route geometry
 * @returns {number} penalty between 0 (clear) and 1 (storm)
 */
async function getWeatherPenalty(coordinates) {
  const mid  = coordinates[Math.floor(coordinates.length / 2)];
  const [lng, lat] = mid;   // GeoJSON is [lng, lat]

  const url = (
    `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${lat}&longitude=${lng}` +
    `&current=weather_code,precipitation` +
    `&timezone=auto`
  );

  try {
    const res  = await fetch(url, { signal: AbortSignal.timeout(4_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const code = data.current?.weather_code ?? 0;
    return weatherCodeToPenalty(code);
  } catch (err) {
    console.warn('[enrichment] Weather fetch failed:', err.message);
    return 0;   // Assume clear — never block routing on weather API failure
  }
}

// ── Stability score (geometric route similarity) ─────────────────────────────

/**
 * Computes how different the new route is from the currently active route.
 *
 * Algorithm:
 *   1. Sample STABILITY_SAMPLE_N evenly-spaced points along each route
 *   2. For each point on the new route, find the nearest point on the current route
 *   3. Average those minimum distances (Hausdorff-inspired, not exact)
 *   4. Normalise: 0 km → 0 (identical), ≥5 km mean deviation → 1 (completely different)
 *
 * Returns 0 when there is no current route (first trip, no penalty for change).
 *
 * @param {number[][]} newCoords     - [[lng,lat], ...] of candidate route
 * @param {number[][]|null} currentCoords - [[lng,lat], ...] of active route
 * @returns {number} 0–1 stability score
 */
function computeStabilityScore(newCoords, currentCoords) {
  if (!currentCoords || currentCoords.length === 0) return 0;

  const newSampled     = sampleEvenly(newCoords,     STABILITY_SAMPLE_N);
  const currentSampled = sampleEvenly(currentCoords, STABILITY_SAMPLE_N);

  let totalMinDist = 0;
  for (const np of newSampled) {
    let minDist = Infinity;
    for (const cp of currentSampled) {
      const d = haversineKm(np, cp);
      if (d < minDist) minDist = d;
    }
    totalMinDist += minDist;
  }

  const meanDevKm = totalMinDist / newSampled.length;

  // 0 km = same road, 5 km average deviation = completely different corridor
  return Math.min(1, meanDevKm / 5);
}

// ── Geometry helpers ──────────────────────────────────────────────────────────

/**
 * Samples N evenly-spaced points from an array of coordinates.
 * Handles edge cases: fewer points than N, or N=1.
 */
function sampleEvenly(coords, n) {
  if (coords.length <= n) return coords;
  const step = (coords.length - 1) / (n - 1);
  return Array.from({ length: n }, (_, i) => coords[Math.round(i * step)]);
}

/**
 * Haversine distance in kilometres between two [lng, lat] points.
 * Accurate enough for city-scale (~0.1% error over 50 km).
 */
function haversineKm([lng1, lat1], [lng2, lat2]) {
  const R    = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a    = (
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  );
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toRad(deg) { return deg * (Math.PI / 180); }

// ── Main enrichment function ──────────────────────────────────────────────────

/**
 * Attaches congestion, weatherPenalty, and stability to a single Mapbox route.
 *
 * @param {Object} route         - Single Mapbox Directions route object
 * @param {Object|null} currentRoute - The route currently in use (or null)
 * @param {Object} db            - PostGIS adapter
 * @returns {Object} Enriched route with .congestion .weatherPenalty .stability
 */
async function enrichRoute(route, currentRoute, db) {
  const geometry  = route.geometry;          // GeoJSON LineString
  const coords    = geometry.coordinates;    // [[lng,lat], ...]

  const currentCoords = currentRoute?.geometry?.coordinates ?? null;

  // Run PostGIS + weather in parallel — no reason to serialise
  const [{ avgCongestion, readingsCount }, weatherPenalty] = await Promise.all([
    getCongestionForRoute(geometry, db),
    getWeatherPenalty(coords),
  ]);

  const stability = computeStabilityScore(coords, currentCoords);

  return {
    ...route,
    congestion:      avgCongestion,
    congestionBasis: readingsCount,   // How many readings backed this (0 = inferred)
    weatherPenalty,
    stability,
  };
}

module.exports = {
  enrichRoute,
  getCongestionForRoute,
  getWeatherPenalty,
  computeStabilityScore,
  haversineKm,
};
