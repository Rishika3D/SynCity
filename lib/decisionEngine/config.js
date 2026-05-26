/**
 * config.js — Weights, city profiles, and threshold definitions.
 *
 * Nothing in this file is hardcoded to a single city or scenario.
 * New cities are added by extending CITY_PROFILES.
 * Weights can be overridden per-request via the context object.
 */

'use strict';

// ── Scoring weights (must sum to 1.0) ─────────────────────────────────────────
//
// These control the relative importance of each dimension.
// All inputs are normalised 0→1 before weighting, so these
// numbers are directly comparable (0.40 really does mean 40%).

const DEFAULT_WEIGHTS = {
  eta:          0.40,   // Time saving is the primary driver
  congestion:   0.25,   // Our PostGIS signal (cross-validates Mapbox's ETA)
  weather:      0.15,   // Environmental penalty
  stability:    0.20,   // Penalty for switching to a very different route
};

// ── Weather code → penalty (WMO codes, used by Open-Meteo) ───────────────────
//
// 0.0 = no impact, 1.0 = completely impassable.
// Source: https://open-meteo.com/en/docs (WMO Weather interpretation codes)

const WEATHER_PENALTIES = {
  clear:       0.00,   // 0
  mainlyClear: 0.02,   // 1
  partlyCloudy:0.03,   // 2
  overcast:    0.05,   // 3
  fog:         0.18,   // 45, 48
  drizzle:     0.22,   // 51–57
  rain:        0.38,   // 61–67
  snow:        0.65,   // 71–77
  shower:      0.30,   // 80–82
  storm:       0.80,   // 95–99
};

// Maps WMO integer code → penalty category
function weatherCodeToPenalty(code) {
  if (code === 0)                           return WEATHER_PENALTIES.clear;
  if (code === 1)                           return WEATHER_PENALTIES.mainlyClear;
  if (code === 2)                           return WEATHER_PENALTIES.partlyCloudy;
  if (code === 3)                           return WEATHER_PENALTIES.overcast;
  if (code === 45 || code === 48)           return WEATHER_PENALTIES.fog;
  if (code >= 51 && code <= 57)            return WEATHER_PENALTIES.drizzle;
  if (code >= 61 && code <= 67)            return WEATHER_PENALTIES.rain;
  if (code >= 71 && code <= 77)            return WEATHER_PENALTIES.snow;
  if (code >= 80 && code <= 82)            return WEATHER_PENALTIES.shower;
  if (code === 95 || (code >= 96 && code <= 99)) return WEATHER_PENALTIES.storm;
  return WEATHER_PENALTIES.clear;
}

// ── Peak hour detection ───────────────────────────────────────────────────────
//
// Peak: 07:00–10:00 and 17:00–20:00 local time.
// All threshold comparisons use this flag — peak hours are less tolerant.

function isPeakHour(date = new Date()) {
  const h = date.getHours();
  return (h >= 7 && h < 10) || (h >= 17 && h < 20);
}

// ── City profiles ─────────────────────────────────────────────────────────────
//
// Each city profile contains:
//   weights          — override DEFAULT_WEIGHTS for this city
//   thresholds.peak  — how aggressive rerouting is during peak hours
//   thresholds.offPeak
//   cooldownMs       — minimum time between two consecutive reroutes
//
// Threshold fields:
//   minTimeSavingSeconds   — candidate must save at least this much time
//   minTrafficIncreasePct  — current route's congestion must have grown by this %
//   minCongestionDelta     — absolute gap: candidate.congestion must be this lower
//   minScoreImprovement    — score must improve by this fraction (0.10 = 10%)

const CITY_PROFILES = {

  // Bangalore: historically high baseline congestion, frequent rain, many
  // road construction detours. More tolerant thresholds prevent alert fatigue.
  bangalore: {
    weights: {
      eta:        0.35,
      congestion: 0.20,   // Down-weighted — baseline is already high
      weather:    0.20,   // Monsoon makes this more meaningful
      stability:  0.25,   // Higher — unnecessary lane changes are disruptive
    },
    thresholds: {
      peak: {
        minTimeSavingSeconds:  240,   // 4 min (less strict — everyone is slow)
        minTrafficIncreasePct: 0.35,  // 35% increase on current route
        minCongestionDelta:    15,    // Candidate must be 15 points clearer
        minScoreImprovement:   0.12,  // 12% score improvement to trigger
      },
      offPeak: {
        minTimeSavingSeconds:  150,
        minTrafficIncreasePct: 0.25,
        minCongestionDelta:    12,
        minScoreImprovement:   0.10,
      },
    },
    cooldownMs: 5 * 60 * 1000,  // 5 minutes
  },

  // Default / generic city
  default: {
    weights: DEFAULT_WEIGHTS,
    thresholds: {
      peak: {
        minTimeSavingSeconds:  180,
        minTrafficIncreasePct: 0.25,
        minCongestionDelta:    12,
        minScoreImprovement:   0.10,
      },
      offPeak: {
        minTimeSavingSeconds:  120,
        minTrafficIncreasePct: 0.18,
        minCongestionDelta:    10,
        minScoreImprovement:   0.08,
      },
    },
    cooldownMs: 3 * 60 * 1000,  // 3 minutes
  },
};

// How far from a route geometry (metres) to search for PostGIS readings
const CORRIDOR_RADIUS_M = 1500;

// Number of points to sample when computing route stability
const STABILITY_SAMPLE_N = 20;

module.exports = {
  DEFAULT_WEIGHTS,
  WEATHER_PENALTIES,
  CITY_PROFILES,
  CORRIDOR_RADIUS_M,
  STABILITY_SAMPLE_N,
  weatherCodeToPenalty,
  isPeakHour,
};
