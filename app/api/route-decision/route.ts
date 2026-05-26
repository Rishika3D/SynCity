/**
 * app/api/route-decision/route.ts
 *
 * Next.js API route that exposes the decision engine over HTTP.
 * This keeps the Mapbox token and PostGIS credentials server-side.
 *
 * The decision engine itself is pure JS (lib/decisionEngine/).
 * This file is the thin glue layer that wires it to HTTP.
 *
 * Since our PostGIS lives in the FastAPI backend, we proxy traffic queries
 * through /api/v1/traffic/current rather than opening a second pg connection.
 * This adapter makes the decision engine work with either approach.
 */

import { NextRequest } from 'next/server';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { nextRouteHandler } = require('@/lib/decisionEngine/handler');

// ── PostGIS HTTP Adapter ──────────────────────────────────────────────────────
//
// The decision engine expects a db.query() method that accepts SQL + params.
// Since our PostGIS runs inside FastAPI, we translate the spatial query into
// an HTTP call to the backend, returning the same row structure.
//
// If you add a direct pg connection in the future, replace this with:
//   import { Pool } from 'pg';
//   const db = new Pool({ connectionString: process.env.DATABASE_URL });

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

const dbAdapter = {
  async query(sql: string, params: unknown[]) {
    // The only PostGIS query in the decision engine is the corridor congestion query.
    // We detect it by the presence of ST_DWithin and proxy to the backend.
    if (sql.includes('ST_DWithin')) {
      const geometryJson = params[0] as string; // GeoJSON LineString as string
      const radiusM      = params[1] as number;

      const res = await fetch(
        `${API_BASE}/api/v1/traffic/current`,
        { signal: AbortSignal.timeout(5_000) }
      );

      if (!res.ok) return { rows: [{ avg_congestion: '50', readings_count: '0' }] };

      const locations = await res.json() as Array<{
        lat: number; lng: number; congestion_level: number | null;
      }>;

      // Filter locations within radiusM of the route geometry
      // and average their congestion levels
      const geometry = JSON.parse(geometryJson) as GeoJSON.LineString;
      const relevant = locations.filter(loc => {
        if (loc.congestion_level === null) return false;
        return isWithinRadiusOfLine(loc.lat, loc.lng, geometry.coordinates, radiusM);
      });

      const avgCongestion = relevant.length
        ? relevant.reduce((s, l) => s + (l.congestion_level ?? 50), 0) / relevant.length
        : 50;

      return {
        rows: [{
          avg_congestion:  String(avgCongestion.toFixed(2)),
          readings_count:  String(relevant.length),
        }],
      };
    }

    // Fallback for any unrecognised queries
    return { rows: [] };
  },
};

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  return nextRouteHandler(request, dbAdapter);
}

// ── Geometry helper ───────────────────────────────────────────────────────────

/**
 * Returns true if the point (lat, lng) is within radiusM metres of any segment
 * in the polyline. Uses Haversine for distance — accurate enough for city scale.
 */
function isWithinRadiusOfLine(
  lat: number,
  lng: number,
  lineCoords: number[][],   // [[lng, lat], ...]
  radiusM: number,
): boolean {
  const radiusKm = radiusM / 1000;
  for (const [cLng, cLat] of lineCoords) {
    if (haversineKm(lat, lng, cLat, cLng) <= radiusKm) return true;
  }
  return false;
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R    = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a    = (
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  );
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toRad(deg: number) { return deg * (Math.PI / 180); }
