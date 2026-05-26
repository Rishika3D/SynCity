"""
schemas.py — Pydantic models for every data structure flowing through the engine.

All other modules import from here. No module defines its own data classes.
"""
from __future__ import annotations

from datetime import datetime
from typing import Any, Optional
from pydantic import BaseModel, Field


# ── Input ─────────────────────────────────────────────────────────────────────

class RouteGeometry(BaseModel):
    type:        str              # "LineString"
    coordinates: list[list[float]]  # [[lng, lat], ...]


class MapboxRoute(BaseModel):
    """Single route alternative from Mapbox Directions API."""
    route_id: str  = Field(default="")
    duration: float           # seconds
    distance: float           # metres
    geometry: RouteGeometry


class CurrentRouteState(BaseModel):
    """The route the driver is currently on. Caller must persist this."""
    route_index:         int
    duration:            float    # ETA at time of assignment
    congestion:          float    # current congestion reading
    baseline_congestion: float    # congestion when route was first assigned
    score:               float    # composite score when assigned
    geometry:            RouteGeometry
    assigned_at:         datetime


class DecisionContext(BaseModel):
    city:            str                = "default"
    last_reroute_at: Optional[datetime] = None
    weight_override: Optional[dict[str, float]] = None


# ── Enrichment output ─────────────────────────────────────────────────────────

class EnrichedRoute(BaseModel):
    """MapboxRoute + three contextual signals."""
    route_id:          str
    duration:          float
    distance:          float
    geometry:          RouteGeometry
    congestion:        float    # avg congestion from PostGIS corridor query
    congestion_basis:  int      # number of PostGIS readings (0 = inferred)
    weather_penalty:   float    # 0.0 (clear) → 1.0 (storm)
    stability:         float    # 0.0 (identical route) → 1.0 (completely different)


# ── Scoring output ─────────────────────────────────────────────────────────────

class NormalizedValues(BaseModel):
    eta:        float
    congestion: float
    weather:    float
    stability:  float


class ScoreBreakdown(BaseModel):
    """Weighted contribution of each dimension to the composite score."""
    eta:        float
    congestion: float
    weather:    float
    stability:  float


class ScoredRoute(EnrichedRoute):
    route_index: int
    score:       float
    normalized:  NormalizedValues
    breakdown:   ScoreBreakdown


# ── Decision output ───────────────────────────────────────────────────────────

class RuleDecision(BaseModel):
    reroute: bool
    gate:    str     # which gate fired (or blocked)
    reason:  str     # machine-readable slug


# ── RL output ─────────────────────────────────────────────────────────────────

class RLState(BaseModel):
    congestion_bucket: int    # 0–3
    eta_bucket:        int    # 0–3
    weather_bucket:    int    # 0–2
    time_bucket:       int    # 0–2
    as_tuple:          tuple  = Field(default=())

    def model_post_init(self, _: Any) -> None:
        object.__setattr__(
            self, "as_tuple",
            (self.congestion_bucket, self.eta_bucket,
             self.weather_bucket,    self.time_bucket),
        )


class RLDecision(BaseModel):
    state:      RLState
    action:     int      # 0 = keep, 1 = reroute
    confidence: float    # 0.0–1.0
    q_values:   dict[str, float]   # {"keep": x, "reroute": y}
    used:       bool     # whether the hybrid system chose RL over rule-based


# ── Debug block ───────────────────────────────────────────────────────────────

class DebugInfo(BaseModel):
    normalized_values: list[dict[str, Any]]
    scores:            list[dict[str, Any]]
    thresholds:        dict[str, Any]
    delay:             float        # candidateETA - currentETA (seconds)
    gate:              str
    rl:                Optional[RLDecision] = None


# ── Final engine output ───────────────────────────────────────────────────────

class DecisionResult(BaseModel):
    selected_route:  ScoredRoute
    should_reroute:  bool
    reason:          str
    debug_info:      DebugInfo


# ── Decision log (written to DB) ──────────────────────────────────────────────

class DecisionLog(BaseModel):
    """Schema for what gets persisted in the decisions table."""
    session_id:       str
    state_features:   dict[str, Any]    # raw feature values
    rl_state:         Optional[tuple]   # discretised state
    action_taken:     int               # 0 or 1
    reroute_triggered: bool
    reason:           str
    gate:             str
    selected_route_index: int
    scores:           list[dict]
    timestamp:        datetime
