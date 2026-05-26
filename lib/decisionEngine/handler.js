/**
 * handler.js — Express / Next.js API route integration.
 *
 * Shows exactly how the decision engine plugs into HTTP.
 *
 * Session state (activeRoute, lastRerouteAt) is stored in a Map keyed by
 * sessionId. In production, replace this with Redis so it survives restarts
 * and works across multiple server instances.
 *
 * Mapbox Directions call happens server-side — the token stays secret.
 */

'use strict';

const engine = require('./index');

// ── In-memory session store ───────────────────────────────────────────────────
// Key:   sessionId (string)
// Value: { activeRoute, lastRerouteAt }
//
// Production upgrade path:
//   const store = new RedisSessionStore(redisClient);
//   await store.get(sessionId) / store.set(sessionId, data, ttl)

const sessionStore = new Map();

// ── Mapbox Directions fetch ───────────────────────────────────────────────────

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? process.env.MAPBOX_TOKEN ?? '';

/**
 * Calls Mapbox Directions with driving-traffic profile + 2 alternatives.
 * Returns the raw `routes` array.
 *
 * @param {{ lng: number, lat: number }} origin
 * @param {{ lng: number, lat: number }} destination
 * @returns {Promise<Object[]>} Mapbox route objects
 */
async function fetchMapboxRoutes(origin, destination) {
  const coords = `${origin.lng},${origin.lat};${destination.lng},${destination.lat}`;
  const url = (
    `https://api.mapbox.com/directions/v5/mapbox/driving-traffic/${coords}` +
    `?alternatives=true` +
    `&geometries=geojson` +
    `&overview=full` +
    `&annotations=congestion_numeric` +
    `&access_token=${MAPBOX_TOKEN}`
  );

  const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
  if (!res.ok) throw new Error(`Mapbox Directions API: ${res.status}`);

  const data = await res.json();
  if (!data.routes?.length) throw new Error('Mapbox returned no routes');

  return data.routes;
}

// ── Express route handler ─────────────────────────────────────────────────────

/**
 * POST /api/route
 *
 * Request body:
 * {
 *   sessionId:   string,
 *   origin:      { lng: number, lat: number },
 *   destination: { lng: number, lat: number },
 *   city?:       string   (default: 'default')
 * }
 *
 * Response:
 * {
 *   rerouteTriggered: boolean,
 *   reason:           string,
 *   gate:             string,
 *   selectedRoute:    { duration, distance, geometry, score, ... },
 *   debug:            { ... }
 * }
 *
 * @param {import('express').Request}  req
 * @param {import('express').Response} res
 * @param {Object} db - pg.Pool instance (injected by app.js)
 */
async function routeHandler(req, res, db) {
  const { sessionId, origin, destination, city = 'default' } = req.body;

  // ── Input validation ──────────────────────────────────────────────────────
  if (!sessionId || !origin || !destination) {
    return res.status(400).json({
      error: 'sessionId, origin, and destination are required',
    });
  }

  for (const point of [origin, destination]) {
    if (typeof point.lat !== 'number' || typeof point.lng !== 'number') {
      return res.status(400).json({ error: 'origin and destination must have numeric lat/lng' });
    }
  }

  try {
    // ── Fetch session state ───────────────────────────────────────────────
    const session = sessionStore.get(sessionId) ?? { activeRoute: null, lastRerouteAt: null };

    // ── Fetch routes from Mapbox ──────────────────────────────────────────
    const mapboxRoutes = await fetchMapboxRoutes(origin, destination);

    // ── Run decision engine ───────────────────────────────────────────────
    const result = await engine.evaluate({
      mapboxRoutes,
      currentRoute:  session.activeRoute,
      lastRerouteAt: session.lastRerouteAt,
      city,
      db,
    });

    // ── Persist updated session state ─────────────────────────────────────
    if (result.rerouteTriggered) {
      sessionStore.set(sessionId, {
        activeRoute: {
          ...result.selectedRoute,
          // Snapshot baseline congestion at assignment time
          // so degradation can be detected on future calls
          baselineCongestion: result.selectedRoute.congestion,
          assignedAt:         Date.now(),
        },
        lastRerouteAt: Date.now(),
      });
    }

    // ── Respond ───────────────────────────────────────────────────────────
    return res.json(result);

  } catch (err) {
    console.error('[routeHandler] Error:', err);
    return res.status(500).json({ error: err.message });
  }
}

// ── Next.js App Router adapter ────────────────────────────────────────────────

/**
 * Next.js Route Handler version — drop this in app/api/route-decision/route.ts
 * (Renamed to .js here for clarity in this file)
 *
 * @param {Request} request
 * @param {Object}  db
 */
async function nextRouteHandler(request, db) {
  const body = await request.json();
  const { sessionId, origin, destination, city = 'default' } = body;

  if (!sessionId || !origin || !destination) {
    return Response.json({ error: 'Missing required fields' }, { status: 400 });
  }

  try {
    const session      = sessionStore.get(sessionId) ?? { activeRoute: null, lastRerouteAt: null };
    const mapboxRoutes = await fetchMapboxRoutes(origin, destination);

    const result = await engine.evaluate({
      mapboxRoutes,
      currentRoute:  session.activeRoute,
      lastRerouteAt: session.lastRerouteAt,
      city,
      db,
    });

    if (result.rerouteTriggered) {
      sessionStore.set(sessionId, {
        activeRoute: {
          ...result.selectedRoute,
          baselineCongestion: result.selectedRoute.congestion,
          assignedAt:         Date.now(),
        },
        lastRerouteAt: Date.now(),
      });
    }

    return Response.json(result);

  } catch (err) {
    console.error('[nextRouteHandler]', err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}

module.exports = { routeHandler, nextRouteHandler, fetchMapboxRoutes };
