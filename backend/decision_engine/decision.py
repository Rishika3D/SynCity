"""
decision.py — Five-gate rule-based reroute arbiter.

Gates are evaluated in order. The FIRST gate that fires determines the outcome.
If no gate fires, the engine holds the current route.

Gate order (same as Node.js version — must stay in sync):
  1. cooldown          → HOLD  (protect driver from thrashing)
  2. same_route        → HOLD  (no point switching to current route)
  3. time_saving       → REROUTE (candidate saves ≥ N seconds)
  4. traffic_degradation → REROUTE (current route got significantly worse)
  5. score_improvement → REROUTE (composite score meaningfully better)
  6. hold              → HOLD  (default — improvement too marginal)
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Optional

from .config import CITY_PROFILES, classify_time_of_day
from .schemas import CurrentRouteState, RuleDecision, ScoredRoute

log = logging.getLogger(__name__)


def _profile(city: str) -> dict:
    return CITY_PROFILES.get(city, CITY_PROFILES["default"])


def _thresholds(city: str) -> dict:
    hour    = datetime.now(timezone.utc).hour
    tod     = classify_time_of_day(hour)
    period  = "peak" if tod == "peak" else "off_peak"
    return _profile(city)["thresholds"][period]


def should_reroute(
    current_route:   CurrentRouteState,
    candidate:       ScoredRoute,
    city:            str = "default",
    last_reroute_at: Optional[datetime] = None,
) -> RuleDecision:
    """
    Returns a RuleDecision(reroute, gate, reason).
    Never raises — any exception results in a HOLD with reason 'error'.
    """
    try:
        profile    = _profile(city)
        thresholds = _thresholds(city)
        cooldown_s = profile["cooldown_s"]

        # ── Gate 1: Cooldown ──────────────────────────────────────────────────
        if last_reroute_at is not None:
            now     = datetime.now(timezone.utc)
            elapsed = (now - last_reroute_at).total_seconds()
            if elapsed < cooldown_s:
                remaining = int(cooldown_s - elapsed)
                return RuleDecision(
                    reroute = False,
                    gate    = "cooldown",
                    reason  = f"cooldown_active:{remaining}s_remaining",
                )

        # ── Gate 2: Same route ────────────────────────────────────────────────
        if candidate.route_index == current_route.route_index:
            return RuleDecision(
                reroute = False,
                gate    = "same_route",
                reason  = "candidate_is_current_route",
            )

        # ── Gate 3: Time saving ───────────────────────────────────────────────
        time_saved = current_route.duration - candidate.duration
        if time_saved >= thresholds["min_time_saving_s"]:
            return RuleDecision(
                reroute = True,
                gate    = "time_saving",
                reason  = f"saves_{int(time_saved)}s_ge_{thresholds['min_time_saving_s']}s_threshold",
            )

        # ── Gate 4: Traffic degradation ───────────────────────────────────────
        if current_route.baseline_congestion > 0:
            congestion_increase_pct = (
                (current_route.congestion - current_route.baseline_congestion)
                / current_route.baseline_congestion
            )
            congestion_delta = current_route.congestion - candidate.congestion

            if (
                congestion_increase_pct >= thresholds["min_traffic_increase_pct"]
                and congestion_delta     >= thresholds["min_congestion_delta"]
            ):
                return RuleDecision(
                    reroute = True,
                    gate    = "traffic_degradation",
                    reason  = (
                        f"current_congestion_up_{congestion_increase_pct:.0%}_"
                        f"candidate_{congestion_delta:.0f}pts_clearer"
                    ),
                )

        # ── Gate 5: Score improvement ─────────────────────────────────────────
        if current_route.score > 0:
            improvement = (current_route.score - candidate.score) / current_route.score
            if improvement >= thresholds["min_score_improvement"]:
                return RuleDecision(
                    reroute = True,
                    gate    = "score_improvement",
                    reason  = f"score_improved_{improvement:.1%}",
                )

        return RuleDecision(
            reroute = False,
            gate    = "hold",
            reason  = "improvement_below_all_thresholds",
        )

    except Exception as exc:
        log.error("[decision] should_reroute raised: %s", exc, exc_info=True)
        return RuleDecision(reroute=False, gate="error", reason=str(exc))
