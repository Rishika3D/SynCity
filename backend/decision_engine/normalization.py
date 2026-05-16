"""
normalization.py — Min-max normalisation across the candidate route set.

All four scoring dimensions are normalised to [0, 1] before weighting.
Without this step, ETA (in seconds, ~1200) would dominate congestion
(0-100) purely due to magnitude differences.

Edge case: if all candidates have the same value on a dimension
(e.g. all routes have identical ETA), the normalised value is 0.5
(neutral) so that dimension does not bias the score.
"""
from __future__ import annotations

from .schemas import EnrichedRoute, NormalizedValues


def _min_max(value: float, lo: float, hi: float) -> float:
    """Normalise value to [0, 1]. Returns 0.5 when lo == hi."""
    if hi == lo:
        return 0.5
    return (value - lo) / (hi - lo)


def normalize_routes(routes: list[EnrichedRoute]) -> list[NormalizedValues]:
    """
    Compute per-dimension min-max ranges across all candidates, then
    return one NormalizedValues per route (same order as input).

    Lower ETA is better    → normalised as-is (lower raw = lower norm = better)
    Lower congestion       → normalised as-is
    Lower weather_penalty  → normalised as-is
    Higher stability       → normalised as-is (0=identical=free, 1=very different=costly)

    Scoring then sums all four; lower total = better route.
    """
    if not routes:
        return []

    etas        = [r.duration        for r in routes]
    congestions = [r.congestion      for r in routes]
    weathers    = [r.weather_penalty for r in routes]
    stabilities = [r.stability       for r in routes]

    eta_lo,  eta_hi  = min(etas),        max(etas)
    cong_lo, cong_hi = min(congestions), max(congestions)
    wx_lo,   wx_hi   = min(weathers),    max(weathers)
    st_lo,   st_hi   = min(stabilities), max(stabilities)

    return [
        NormalizedValues(
            eta        = _min_max(r.duration,        eta_lo,  eta_hi),
            congestion = _min_max(r.congestion,      cong_lo, cong_hi),
            weather    = _min_max(r.weather_penalty, wx_lo,   wx_hi),
            stability  = _min_max(r.stability,       st_lo,   st_hi),
        )
        for r in routes
    ]
