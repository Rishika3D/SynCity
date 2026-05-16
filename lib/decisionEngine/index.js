/**
 * index.js — Public API for the SynCity Decision Engine.
 *
 * This is the only file external code should import.
 * Internal modules (enrichment, scoring, decision) are implementation details.
 *
 * ── What this does ───────────────────────────────────────────────────────────
 *
 *   Given N route alternatives from Mapbox Directions:
 *
 *   1. Enrich each route with:
 *        - Congestion level from PostGIS (our sensor network)
 *        - Weather penalty from Open-Meteo
 *        - Stability score vs the currently active route
 *
 *   2. Normalise all dimensions to [0, 1] and compute weighted composite score
 *
 *   3. Select the best-scoring route
 *
 *   4. Decide whether the driver should actually switch routes right now:
 *        - Check cooldown, same-route, time-saving, traffic-degradation, score-improvement gates
 *
 *   5. Return a structured result with full debug breakdown
 *
 * ── Usage ────────────────────────────────────────────────────────────────────
 *
 *   const engine = require('./lib/decisionEngine');
 *
 *   const result = await engine.evaluate({
 *     mapboxRoutes:  routesFromMapbox,   // array from Directions API
 *     currentRoute:  session.activeRoute, // null on first trip
 *     lastRerouteAt: session.lastRerouteAt,
 *     city:          'bangalore',
 *     db:            pgPool,
 *   });
 *
 *   if (result.rerouteTriggered) {
 *     session.activeRoute    = result.selectedRoute;
 *     session.lastRerouteAt  = Date.now();
 *   }
 */

'use strict';

const { enrichRoute }      = require('./enrichment');
const { scoreRoutes }      = require('./scoring');
const { shouldReroute, selectBestRoute } = require('./decision');

/**
 * Main entry point.
 *
 * @param {Object} params
 * @param {Object[]} params.mapboxRoutes   - Array of route objects from Mapbox Directions API
 * @param {Object|null} params.currentRoute - Active route (null on first request)
 * @param {number|null} params.lastRerouteAt - Unix ms of last reroute, or null
 * @param {string}  params.city            - City key ('bangalore' | 'default')
 * @param {Object}  params.db              - PostGIS adapter (pg.Pool or HTTP adapter)
 * @param {Object}  [params.weightOverride] - Optional per-request weight override
 *
 * @returns {Promise<EvaluationResult>}
 */
async function evaluate({
  mapboxRoutes,
  currentRoute  = null,
  lastRerouteAt = null,
  city          = 'default',
  db,
  weightOverride = null,
}) {
  if (!mapboxRoutes || mapboxRoutes.length === 0) {
    throw new Error('[decisionEngine] mapboxRoutes must be a non-empty array');
  }

  // ── Step 1: Enrich all routes in parallel ─────────────────────────────────
  // PostGIS + weather calls fire concurrently per route.
  // Individual failures return neutral values — never abort the whole request.
  const enriched = await Promise.all(
    mapboxRoutes.map(route => enrichRoute(route, currentRoute, db)),
  );

  // ── Step 2: Normalise + score ─────────────────────────────────────────────
  // Returns sorted array, best (lowest score) first.
  const scored = scoreRoutes(enriched, city, weightOverride);

  // ── Step 3: Select best route ─────────────────────────────────────────────
  const { route: bestRoute, reason: selectionReason } = selectBestRoute(scored);

  // ── Step 4: Decide whether to reroute ────────────────────────────────────
  // If there's no active route, this is the first assignment — always accept.
  let rerouteDecision;
  if (!currentRoute) {
    rerouteDecision = {
      reroute: true,
      gate:   'initial_assignment',
      reason: 'no_active_route:first_assignment',
    };
  } else {
    rerouteDecision = shouldReroute(
      { ...currentRoute, score: currentRoute.score ?? Infinity },
      bestRoute,
      { city, lastRerouteAt },
    );
  }

  // ── Step 5: Return structured result ─────────────────────────────────────
  return buildResult({
    bestRoute,
    scoredRoutes:    scored,
    selectionReason,
    rerouteDecision,
    currentRoute,
  });
}

// ── Result builder ────────────────────────────────────────────────────────────

/**
 * Assembles the final output object.
 * Separates "what the caller needs" from "debug information".
 *
 * @typedef  {Object} EvaluationResult
 * @property {Object}  selectedRoute      - The best route (Mapbox route + enrichment + score)
 * @property {boolean} rerouteTriggered   - Whether the driver should switch now
 * @property {string}  reason             - Machine-readable slug explaining the decision
 * @property {string}  gate              - Which decision gate fired (or blocked)
 * @property {Object}  debug             - Full breakdown for logging/monitoring
 */
function buildResult({ bestRoute, scoredRoutes, selectionReason, rerouteDecision, currentRoute }) {
  return {
    // ── Core output (what the caller acts on) ─────────────────────────────
    selectedRoute: {
      // Raw Mapbox fields
      duration:     bestRoute.duration,
      distance:     bestRoute.distance,
      geometry:     bestRoute.geometry,
      legs:         bestRoute.legs,
      // Enriched fields
      congestion:   bestRoute.congestion,
      weatherPenalty: bestRoute.weatherPenalty,
      stability:    bestRoute.stability,
      // Score
      score:        bestRoute.score,
      routeIndex:   bestRoute.routeIndex,
    },

    rerouteTriggered: rerouteDecision.reroute,
    reason:           rerouteDecision.reason,
    gate:             rerouteDecision.gate,

    // ── Debug block (log this, don't act on it) ───────────────────────────
    debug: {
      selectionReason,
      scoreBreakdown: bestRoute.breakdown,
      normalizedInputs: bestRoute.normalized,
      allRoutes: scoredRoutes.map(r => ({
        routeIndex:    r.routeIndex,
        score:         r.score,
        duration:      r.duration,
        congestion:    r.congestion,
        weatherPenalty:r.weatherPenalty,
        stability:     r.stability,
        breakdown:     r.breakdown,
      })),
      currentRoute: currentRoute
        ? { duration: currentRoute.duration, congestion: currentRoute.congestion, routeIndex: currentRoute.routeIndex }
        : null,
    },
  };
}

module.exports = { evaluate };
