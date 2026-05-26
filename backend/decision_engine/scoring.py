"""
scoring.py — Weighted composite scoring.

score = w_eta*eta_norm + w_cong*cong_norm + w_wx*weather_norm + w_stab*stability_norm

All four terms are in [0,1] and use the same sign convention: lower = better.
  ETA:        lower raw duration    → lower norm → lower score ✓
  Congestion: lower congestion      → lower norm → lower score ✓
  Weather:    lower penalty (clear) → lower norm → lower score ✓
  Stability:  lower value (similar) → lower norm → lower score ✓
              (stability=0 means identical path; no switching cost)

The route with the LOWEST composite score wins.
"""
from __future__ import annotations

import logging
from typing import Optional

from .config import DEFAULT_WEIGHTS, CITY_PROFILES, Weights
from .normalization import normalize_routes
from .schemas import EnrichedRoute, NormalizedValues, ScoreBreakdown, ScoredRoute

log = logging.getLogger(__name__)

_EPSILON = 1e-6


def _get_weights(city: str, override: Optional[dict[str, float]]) -> Weights:
    if override:
        total = sum(override.values())
        if abs(total - 1.0) > _EPSILON:
            log.warning("[scoring] weight override sums to %.4f, not 1.0 — ignoring", total)
        else:
            return Weights(**override)
    profile = CITY_PROFILES.get(city, CITY_PROFILES["default"])
    return profile["weights"]


def _compute_score(
    norm: NormalizedValues,
    weights: Weights,
) -> tuple[float, ScoreBreakdown]:
    eta_c  = round(weights["eta"]        * norm.eta,        6)
    cong_c = round(weights["congestion"] * norm.congestion, 6)
    wx_c   = round(weights["weather"]    * norm.weather,    6)
    st_c   = round(weights["stability"]  * norm.stability,  6)

    score = round(eta_c + cong_c + wx_c + st_c, 6)
    breakdown = ScoreBreakdown(
        eta        = eta_c,
        congestion = cong_c,
        weather    = wx_c,
        stability  = st_c,
    )
    return score, breakdown


def score_routes(
    enriched:      list[EnrichedRoute],
    city:          str = "default",
    weight_override: Optional[dict[str, float]] = None,
) -> list[ScoredRoute]:
    """
    Normalise, weight, and sort enriched routes.
    Returns list sorted ascending by score (index 0 = best route).
    """
    if not enriched:
        return []

    weights    = _get_weights(city, weight_override)
    normalized = normalize_routes(enriched)

    scored: list[ScoredRoute] = []
    for idx, (route, norm) in enumerate(zip(enriched, normalized)):
        score, breakdown = _compute_score(norm, weights)
        scored.append(
            ScoredRoute(
                **route.model_dump(),
                route_index = idx,
                score       = score,
                normalized  = norm,
                breakdown   = breakdown,
            )
        )

    scored.sort(key=lambda r: r.score)
    return scored
