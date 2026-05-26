/**
 * scoring.js — Normalise inputs and compute a composite route score.
 *
 * ── Why normalisation is non-negotiable ──────────────────────────────────────
 *
 * The four dimensions have completely different units and scales:
 *   eta          — seconds (e.g. 480–1800)
 *   congestion   — 0–100 index
 *   weatherPenalty — 0–1
 *   stability    — 0–1
 *
 * Without normalisation, a weight of 0.40 on `eta` would be mathematically
 * meaningless — the raw ETA value would dominate regardless of weight.
 *
 * Normalisation process (min-max across the candidate set):
 *   normalised = (value - min) / (max - min)
 *
 * This scales every dimension to [0, 1] where 0 = best in set, 1 = worst.
 * The weighted sum then produces a score where LOWER = BETTER.
 *
 * Edge case: if all routes are equal on a dimension (max = min), that
 * dimension scores 0 for all — i.e. it doesn't affect the ranking.
 * This is correct behaviour (no information → no influence).
 */

'use strict';

const { DEFAULT_WEIGHTS, CITY_PROFILES } = require('./config');

// ── Normalisation ─────────────────────────────────────────────────────────────

/**
 * Scales a single value to [0, 1] given the observed range.
 * Returns 0 when all values in the candidate set are identical.
 */
function minMaxNorm(value, min, max) {
  if (max === min) return 0;
  return (value - min) / (max - min);
}

/**
 * Computes per-dimension min/max across the entire candidate set,
 * then returns each route with a `.normalized` block.
 *
 * @param {Object[]} enrichedRoutes — routes after enrichment.js
 * @returns {Object[]} Same routes with .normalized added
 */
function normalizeRoutes(enrichedRoutes) {
  // Collect range for each scored dimension
  const dims = {
    eta:          enrichedRoutes.map(r => r.duration),
    congestion:   enrichedRoutes.map(r => r.congestion),
    weatherPenalty: enrichedRoutes.map(r => r.weatherPenalty),
    stability:    enrichedRoutes.map(r => r.stability),
  };

  const ranges = {};
  for (const [dim, vals] of Object.entries(dims)) {
    ranges[dim] = { min: Math.min(...vals), max: Math.max(...vals) };
  }

  return enrichedRoutes.map(route => ({
    ...route,
    normalized: {
      eta:           minMaxNorm(route.duration,       ranges.eta.min,           ranges.eta.max),
      congestion:    minMaxNorm(route.congestion,     ranges.congestion.min,    ranges.congestion.max),
      weatherPenalty:minMaxNorm(route.weatherPenalty, ranges.weatherPenalty.min,ranges.weatherPenalty.max),
      stability:     minMaxNorm(route.stability,      ranges.stability.min,     ranges.stability.max),
    },
  }));
}

// ── Composite score ───────────────────────────────────────────────────────────

/**
 * Computes the weighted composite score for a single normalised route.
 *
 * LOWER score = BETTER route.
 *
 * @param {Object} normalized — { eta, congestion, weatherPenalty, stability } all in [0,1]
 * @param {Object} weights    — { eta, congestion, weatherPenalty, stability } summing to ~1
 * @returns {{ score: number, breakdown: Object }}
 */
function computeScore(normalized, weights) {
  const breakdown = {
    eta:           +(normalized.eta           * weights.eta).toFixed(4),
    congestion:    +(normalized.congestion    * weights.congestion).toFixed(4),
    weatherPenalty:+(normalized.weatherPenalty* weights.weather).toFixed(4),
    stability:     +(normalized.stability     * weights.stability).toFixed(4),
  };

  const score = Object.values(breakdown).reduce((s, v) => s + v, 0);

  return { score: +score.toFixed(4), breakdown };
}

// ── Score all candidates ──────────────────────────────────────────────────────

/**
 * Normalises and scores every route in the candidate set.
 * Returns the array sorted by score ascending (best first).
 *
 * @param {Object[]} enrichedRoutes - from enrichment.js
 * @param {string}   city           - city key for profile lookup
 * @param {Object}   [weightOverride] - optional per-request weight override
 * @returns {Object[]} Scored + sorted routes
 */
function scoreRoutes(enrichedRoutes, city = 'default', weightOverride = null) {
  if (enrichedRoutes.length === 0) return [];

  const profile = CITY_PROFILES[city] ?? CITY_PROFILES.default;
  const weights = weightOverride ?? profile.weights ?? DEFAULT_WEIGHTS;

  // Validate weights sum (warn, don't throw — non-critical)
  const sum = Object.values(weights).reduce((a, b) => a + b, 0);
  if (Math.abs(sum - 1) > 0.05) {
    console.warn(`[scoring] Weights sum to ${sum.toFixed(3)}, expected 1.0`);
  }

  const normalized = normalizeRoutes(enrichedRoutes);

  const scored = normalized.map((route, index) => {
    const { score, breakdown } = computeScore(route.normalized, weights);
    return { ...route, routeIndex: index, score, breakdown };
  });

  // Sort ascending — lowest score (best route) first
  return scored.sort((a, b) => a.score - b.score);
}

module.exports = { scoreRoutes, normalizeRoutes, computeScore, minMaxNorm };
