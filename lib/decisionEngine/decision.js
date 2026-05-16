/**
 * decision.js — Decides WHETHER to reroute and logs the reasoning.
 *
 * ── Core problem this solves ─────────────────────────────────────────────────
 *
 * Without careful decision logic, a scoring function alone causes two bugs:
 *
 *   1. Oscillation: Route A → Route B → Route A → Route B (every 30 seconds)
 *      Fixed by: cooldown + stability score
 *
 *   2. Hair-trigger rerouting: Rerouting for a 10-second improvement
 *      Fixed by: minimum threshold gates before score is even checked
 *
 * ── Decision flow ────────────────────────────────────────────────────────────
 *
 *   shouldReroute() checks gates in order. First gate to fail stops the chain.
 *
 *   Gate 1 — Cooldown:        Has enough time passed since last reroute?
 *   Gate 2 — Same route:      Is the "best" route actually different?
 *   Gate 3 — Time saving:     Does candidate save >= minTimeSavingSeconds?
 *   Gate 4 — Traffic degraded: Has current route's congestion significantly worsened?
 *   Gate 5 — Score improvement: Does the composite score improve by enough?
 *
 *   Any single gate passing triggers a reroute.
 *   All gates failing returns { reroute: false }.
 *
 * ── State requirement ────────────────────────────────────────────────────────
 *
 * shouldReroute() needs a `currentRoute` object — the route currently in use.
 * This must be persisted externally (Redis, DB, or in-memory Map keyed by sessionId).
 * The caller manages persistence; this module manages logic.
 *
 * currentRoute must include:
 *   duration         — ETA in seconds when originally assigned
 *   congestion       — Congestion level at time of assignment
 *   baselineCongestion — Congestion level when the route was FIRST created
 *                        (used to detect degradation relative to original state)
 *   routeIndex       — Which Mapbox alternative was chosen
 *   geometry         — GeoJSON LineString (for stability comparison)
 *   assignedAt       — Unix ms timestamp when this route was set
 */

'use strict';

const { CITY_PROFILES, isPeakHour } = require('./config');

// ── Core decision function ────────────────────────────────────────────────────

/**
 * Determines whether the driver should switch to a new route.
 *
 * @param {Object} currentRoute   - The route currently active (see JSDoc above)
 * @param {Object} candidateRoute - Best-scored route from scoring.js
 * @param {Object} context        - { city, lastRerouteAt }
 *
 * @returns {{ reroute: boolean, reason: string, gate: string }}
 *   reason is a machine-readable slug suitable for logging and dashboards.
 *   gate indicates which decision gate triggered (or blocked) the reroute.
 */
function shouldReroute(currentRoute, candidateRoute, context = {}) {
  const {
    city          = 'default',
    lastRerouteAt = null,   // Unix ms, or null if never rerouted
  } = context;

  const profile    = CITY_PROFILES[city] ?? CITY_PROFILES.default;
  const thresholds = isPeakHour() ? profile.thresholds.peak : profile.thresholds.offPeak;
  const period     = isPeakHour() ? 'peak' : 'off_peak';

  // ── Gate 1: Cooldown ─────────────────────────────────────────────────────
  // Prevents oscillation. Even if a better route exists, we won't reroute
  // until cooldownMs has elapsed since the last reroute event.
  if (lastRerouteAt !== null) {
    const elapsed   = Date.now() - lastRerouteAt;
    const remaining = profile.cooldownMs - elapsed;
    if (remaining > 0) {
      return {
        reroute: false,
        gate:    'cooldown',
        reason:  `cooldown_active:${Math.ceil(remaining / 1000)}s_remaining`,
      };
    }
  }

  // ── Gate 2: Candidate is the same route ──────────────────────────────────
  // The scoring already chose the best route. If that's the current one,
  // there is nothing to switch to.
  if (candidateRoute.routeIndex === currentRoute.routeIndex) {
    return {
      reroute: false,
      gate:    'same_route',
      reason:  'best_route_unchanged',
    };
  }

  const timeSavedSeconds = currentRoute.duration - candidateRoute.duration;

  // ── Gate 3: Candidate saves significant time ──────────────────────────────
  // Pure time-saving gate: if the new route is materially faster, reroute
  // regardless of congestion changes.
  if (timeSavedSeconds >= thresholds.minTimeSavingSeconds) {
    return {
      reroute: true,
      gate:    'time_saving',
      reason:  `time_saving:${timeSavedSeconds}s_saved:period=${period}`,
    };
  }

  // ── Gate 4: Current route has significantly degraded ─────────────────────
  // Compares current congestion against baseline (when route was assigned).
  // If our own sensor network sees a large spike, and the candidate is
  // materially clearer, reroute.
  const baselineCongestion = currentRoute.baselineCongestion ?? currentRoute.congestion;
  const congestionIncrease = baselineCongestion > 0
    ? (currentRoute.congestion - baselineCongestion) / baselineCongestion
    : 0;

  const congestionDelta = currentRoute.congestion - candidateRoute.congestion;

  if (
    congestionIncrease  >= thresholds.minTrafficIncreasePct &&
    congestionDelta     >= thresholds.minCongestionDelta
  ) {
    return {
      reroute: true,
      gate:    'traffic_degradation',
      reason:  [
        `current_route_degraded`,
        `congestion_up_${(congestionIncrease * 100).toFixed(0)}pct`,
        `candidate_clearer_by_${congestionDelta.toFixed(0)}pts`,
        `period=${period}`,
      ].join(':'),
    };
  }

  // ── Gate 5: Composite score improvement is large enough ──────────────────
  // Falls back to the full multi-dimensional score when the other gates
  // don't provide a clear signal. Only triggers if candidate is materially better.
  if (currentRoute.score !== undefined && candidateRoute.score !== undefined) {
    const improvement = currentRoute.score > 0
      ? (currentRoute.score - candidateRoute.score) / currentRoute.score
      : 0;

    if (improvement >= thresholds.minScoreImprovement) {
      return {
        reroute: true,
        gate:    'score_improvement',
        reason:  `score_improvement:${(improvement * 100).toFixed(1)}pct:period=${period}`,
      };
    }
  }

  // ── No gate passed ────────────────────────────────────────────────────────
  return {
    reroute: false,
    gate:    'no_trigger',
    reason:  [
      `no_significant_improvement`,
      `time_saved=${timeSavedSeconds}s`,
      `min_required=${thresholds.minTimeSavingSeconds}s`,
      `period=${period}`,
    ].join(':'),
  };
}

// ── Route selector ────────────────────────────────────────────────────────────

/**
 * Selects the single best route from a scored + sorted array.
 * Wraps it with a human-readable selection reason for debug output.
 *
 * @param {Object[]} scoredRoutes - from scoring.js, sorted ascending
 * @returns {{ route: Object, reason: string }}
 */
function selectBestRoute(scoredRoutes) {
  if (scoredRoutes.length === 0) {
    throw new Error('[decision] No routes to select from');
  }

  const best = scoredRoutes[0];

  // Build a human-readable explanation of why this route won
  const dominant = dominantFactor(best.breakdown, best.normalized);

  const reason = [
    `route_${best.routeIndex}_selected`,
    `score=${best.score.toFixed(3)}`,
    `dominant_factor=${dominant}`,
    `eta=${Math.round(best.duration)}s`,
    `congestion=${best.congestion.toFixed(0)}`,
    `weather_penalty=${best.weatherPenalty.toFixed(2)}`,
    `stability=${best.stability.toFixed(2)}`,
  ].join(' | ');

  return { route: best, reason };
}

/**
 * Returns the dimension name that contributed most to the composite score.
 * Used purely for human-readable debug output.
 */
function dominantFactor(breakdown) {
  return Object.entries(breakdown)
    .sort(([, a], [, b]) => b - a)[0][0];
}

module.exports = { shouldReroute, selectBestRoute };
