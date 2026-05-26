"""
decision_engine.py — Rule-based decision engine.

Design:
  - Runs as a scheduled background job (every 30 s), NOT inline on every insert.
    This decouples ingestion latency from decision latency.
  - Evaluates each location independently so one slow location can't block others.
  - Writes a Decision row for every triggered rule (full audit trail).
  - Returns a list of Decision objects so callers can reference them.

Rules (in priority order):
  1. EMERGENCY_REROUTE  — active accident / road closure at location
  2. REROUTE            — congestion_level >= REROUTE_THRESHOLD
  3. SIGNAL_ADJUST      — SIGNAL_THRESHOLD <= congestion < REROUTE_THRESHOLD
  4. ENVIRONMENTAL_ALERT — AQI >= AQI_THRESHOLD
  5. CONGESTION_WARNING  — sustained moderate congestion (3 of last 5 readings > 60)
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy.orm import Session
from sqlalchemy import desc

from models import Location, TrafficData, EnvironmentData, Event, Decision
from config import get_settings

log = logging.getLogger(__name__)
settings = get_settings()


# ── Rule definitions ──────────────────────────────────────────────────────────

def _log_decision(
    db: Session,
    trigger_type: str,
    action_type: str,
    location: Optional[Location] = None,
    trigger_value: str = "",
    description: str = "",
    metadata: Optional[dict] = None,
) -> Decision:
    d = Decision(
        trigger_type=trigger_type,
        trigger_value=trigger_value,
        location_id=location.id if location else None,
        action_type=action_type,
        action_description=description,
        metadata_json=metadata or {},
    )
    db.add(d)
    db.flush()   # get id without committing
    return d


# ── Core evaluation ───────────────────────────────────────────────────────────

def evaluate_location(db: Session, location: Location) -> list[Decision]:
    """
    Run all rules for a single location.
    Returns list of Decision rows created (may be empty).
    """
    decisions: list[Decision] = []

    # ── 1. Latest traffic reading ─────────────────────────────────────────
    latest_traffic: Optional[TrafficData] = (
        db.query(TrafficData)
        .filter(TrafficData.location_id == location.id)
        .order_by(desc(TrafficData.timestamp))
        .first()
    )

    # ── 2. Active events at this location ─────────────────────────────────
    active_events = (
        db.query(Event)
        .filter(Event.location_id == location.id, Event.active == True)  # noqa: E712
        .all()
    )

    # ── 3. Latest environment reading ─────────────────────────────────────
    latest_env: Optional[EnvironmentData] = (
        db.query(EnvironmentData)
        .filter(EnvironmentData.location_id == location.id)
        .order_by(desc(EnvironmentData.timestamp))
        .first()
    )

    # ── Rule 1: Emergency reroute — active accident or closure ────────────
    for event in active_events:
        if event.event_type in ("accident", "road_closure"):
            d = _log_decision(
                db,
                trigger_type="event_detected",
                action_type="EMERGENCY_REROUTE",
                location=location,
                trigger_value=f"event_id={event.id} type={event.event_type}",
                description=(
                    f"Emergency reroute triggered by {event.event_type} "
                    f"at {location.name} (severity={event.severity})"
                ),
                metadata={
                    "event_id": event.id,
                    "event_type": event.event_type,
                    "severity": event.severity,
                },
            )
            decisions.append(d)
            log.warning("EMERGENCY_REROUTE — %s | %s", location.name, event.event_type)

    # ── Rule 2: Severe congestion → reroute ───────────────────────────────
    if latest_traffic and latest_traffic.congestion_level >= settings.congestion_reroute_threshold:
        d = _log_decision(
            db,
            trigger_type="congestion_threshold",
            action_type="REROUTE",
            location=location,
            trigger_value=f"congestion={latest_traffic.congestion_level:.1f}",
            description=(
                f"Reroute triggered: congestion {latest_traffic.congestion_level:.1f} "
                f"≥ threshold {settings.congestion_reroute_threshold} at {location.name}"
            ),
            metadata={
                "congestion_level": latest_traffic.congestion_level,
                "vehicle_count": latest_traffic.vehicle_count,
                "avg_speed_kmh": latest_traffic.avg_speed_kmh,
                "threshold": settings.congestion_reroute_threshold,
            },
        )
        decisions.append(d)
        log.info("REROUTE — %s | congestion=%.1f", location.name, latest_traffic.congestion_level)

    # ── Rule 3: Moderate congestion → signal adjust ───────────────────────
    elif (
        latest_traffic
        and settings.congestion_signal_threshold
            <= latest_traffic.congestion_level
            < settings.congestion_reroute_threshold
    ):
        d = _log_decision(
            db,
            trigger_type="congestion_threshold",
            action_type="SIGNAL_ADJUST",
            location=location,
            trigger_value=f"congestion={latest_traffic.congestion_level:.1f}",
            description=(
                f"Signal timing adjusted: congestion {latest_traffic.congestion_level:.1f} "
                f"at {location.name}"
            ),
            metadata={"congestion_level": latest_traffic.congestion_level},
        )
        decisions.append(d)
        log.debug("SIGNAL_ADJUST — %s | congestion=%.1f", location.name, latest_traffic.congestion_level)

    # ── Rule 4: AQI spike → environmental alert ───────────────────────────
    if latest_env and latest_env.aqi and latest_env.aqi >= settings.aqi_alert_threshold:
        d = _log_decision(
            db,
            trigger_type="aqi_spike",
            action_type="ENVIRONMENTAL_ALERT",
            location=location,
            trigger_value=f"aqi={latest_env.aqi:.0f}",
            description=(
                f"AQI {latest_env.aqi:.0f} exceeds threshold "
                f"{settings.aqi_alert_threshold} at {location.name}"
            ),
            metadata={
                "aqi": latest_env.aqi,
                "pm25": latest_env.pm25,
                "threshold": settings.aqi_alert_threshold,
            },
        )
        decisions.append(d)
        log.warning("ENVIRONMENTAL_ALERT — %s | aqi=%.0f", location.name, latest_env.aqi)

    # ── Rule 5: Sustained moderate congestion warning ─────────────────────
    if latest_traffic:
        recent_five = (
            db.query(TrafficData.congestion_level)
            .filter(TrafficData.location_id == location.id)
            .order_by(desc(TrafficData.timestamp))
            .limit(5)
            .all()
        )
        above_60 = sum(1 for (c,) in recent_five if c >= 60)
        if above_60 >= 3 and latest_traffic.congestion_level < settings.congestion_reroute_threshold:
            d = _log_decision(
                db,
                trigger_type="sustained_congestion",
                action_type="CONGESTION_WARNING",
                location=location,
                trigger_value=f"{above_60}/5 readings ≥ 60",
                description=(
                    f"Sustained congestion at {location.name}: "
                    f"{above_60} of last 5 readings ≥ 60"
                ),
                metadata={
                    "readings_above_60": above_60,
                    "recent_levels": [c for (c,) in recent_five],
                },
            )
            decisions.append(d)

    return decisions


def run_cycle(db: Session) -> list[Decision]:
    """
    Evaluate all locations in one cycle.
    Called by APScheduler every SIMULATION_INTERVAL seconds.
    """
    all_decisions: list[Decision] = []

    locations = db.query(Location).all()
    for location in locations:
        try:
            decisions = evaluate_location(db, location)
            all_decisions.extend(decisions)
        except Exception as exc:
            log.error("Decision engine error at location %s: %s", location.id, exc)

    if all_decisions:
        db.commit()
        log.info("Decision cycle complete — %d decisions logged", len(all_decisions))
    else:
        log.debug("Decision cycle complete — no actions triggered")

    return all_decisions
