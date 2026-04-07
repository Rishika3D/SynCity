"""
dashboard.py — Single endpoint that aggregates all city-wide stats for the
               Next.js CityStatsPanel and explore page overlay cards.

Returns one JSON object with:
  - summary metrics (avg congestion, avg AQI, active events, recent decisions)
  - per-location snapshot (current traffic + environment)
  - recent alerts derived from thresholds

All data comes from the DB; no external HTTP calls are made here.
"""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import desc, func
from datetime import datetime, timedelta, timezone
from typing import Optional

from database import get_db
from models import Location, TrafficData, EnvironmentData, Event, Decision
from config import get_settings

router = APIRouter(prefix="/dashboard", tags=["dashboard"])
settings = get_settings()


def _latest_traffic(db: Session, location_id: int) -> Optional[TrafficData]:
    return (
        db.query(TrafficData)
        .filter(TrafficData.location_id == location_id)
        .order_by(desc(TrafficData.timestamp))
        .first()
    )


def _latest_env(db: Session, location_id: int) -> Optional[EnvironmentData]:
    return (
        db.query(EnvironmentData)
        .filter(EnvironmentData.location_id == location_id)
        .order_by(desc(EnvironmentData.timestamp))
        .first()
    )


@router.get("/")
def get_dashboard(db: Session = Depends(get_db)):
    """
    Aggregated city dashboard snapshot.

    Designed to be polled every 30 s by the frontend.
    Returns < 1 KB of JSON — no pagination needed.
    """
    now = datetime.now(timezone.utc)
    cutoff_1h = now - timedelta(hours=1)

    locations = db.query(Location).order_by(Location.name).all()

    # ── Per-location snapshot ─────────────────────────────────────────────────
    location_snapshots = []
    congestion_values = []
    aqi_values = []

    for loc in locations:
        traffic = _latest_traffic(db, loc.id)
        env = _latest_env(db, loc.id)

        congestion = traffic.congestion_level if traffic else None
        aqi = env.aqi if env else None

        if congestion is not None:
            congestion_values.append(congestion)
        if aqi is not None:
            aqi_values.append(aqi)

        location_snapshots.append({
            "id":               loc.id,
            "name":             loc.name,
            "lat":              loc.lat,
            "lng":              loc.lng,
            "congestion_level": congestion,
            "vehicle_count":    traffic.vehicle_count    if traffic else None,
            "avg_speed_kmh":    traffic.avg_speed_kmh    if traffic else None,
            "aqi":              aqi,
            "temperature":      env.temperature          if env else None,
            "humidity":         env.humidity             if env else None,
            "pm25":             env.pm25                 if env else None,
        })

    # ── City-wide aggregates ──────────────────────────────────────────────────
    avg_congestion = round(sum(congestion_values) / len(congestion_values), 1) if congestion_values else None
    max_congestion = round(max(congestion_values), 1)                           if congestion_values else None
    avg_aqi        = round(sum(aqi_values) / len(aqi_values), 1)                if aqi_values        else None
    max_aqi        = round(max(aqi_values), 1)                                  if aqi_values        else None

    most_congested = max(
        location_snapshots,
        key=lambda x: x["congestion_level"] or 0,
        default=None,
    )

    # ── Active events ─────────────────────────────────────────────────────────
    active_events = (
        db.query(Event)
        .filter(Event.active == True)   # noqa: E712
        .order_by(desc(Event.started_at))
        .limit(10)
        .all()
    )
    events_payload = [
        {
            "id":         ev.id,
            "location_id": ev.location_id,
            "event_type": ev.event_type,
            "severity":   ev.severity,
            "description": ev.description,
            "started_at": ev.started_at.isoformat(),
        }
        for ev in active_events
    ]

    # ── Recent decisions (last hour) ──────────────────────────────────────────
    recent_decisions = (
        db.query(Decision)
        .filter(Decision.timestamp >= cutoff_1h)
        .order_by(desc(Decision.timestamp))
        .limit(20)
        .all()
    )
    decisions_payload = [
        {
            "id":          d.id,
            "action_type": d.action_type,
            "location_id": d.location_id,
            "description": d.action_description,
            "timestamp":   d.timestamp.isoformat(),
        }
        for d in recent_decisions
    ]

    # ── Threshold-derived alerts ──────────────────────────────────────────────
    alerts = []

    if max_aqi and max_aqi >= 150:
        worst_aqi_loc = max(location_snapshots, key=lambda x: x["aqi"] or 0)
        alerts.append({
            "level":   "critical",
            "message": f"AQI {max_aqi:.0f} at {worst_aqi_loc['name']} — Unhealthy air quality",
        })
    elif max_aqi and max_aqi >= 100:
        alerts.append({
            "level":   "warning",
            "message": f"AQI {max_aqi:.0f} — Sensitive groups at risk",
        })

    if most_congested and most_congested["congestion_level"] and most_congested["congestion_level"] >= 80:
        alerts.append({
            "level":   "critical",
            "message": f"Severe congestion at {most_congested['name']} — {most_congested['congestion_level']:.0f}/100",
        })
    elif most_congested and most_congested["congestion_level"] and most_congested["congestion_level"] >= 60:
        alerts.append({
            "level":   "warning",
            "message": f"High traffic at {most_congested['name']} — {most_congested['congestion_level']:.0f}/100",
        })

    if len(active_events) > 0:
        high_severity = [e for e in events_payload if e["severity"] == "high"]
        if high_severity:
            alerts.append({
                "level":   "critical",
                "message": f"{len(high_severity)} high-severity incident(s) active",
            })
        else:
            alerts.append({
                "level":   "info",
                "message": f"{len(active_events)} active incident(s) being monitored",
            })

    # ── Response ──────────────────────────────────────────────────────────────
    return {
        "timestamp":        now.isoformat(),
        "monitor_points":   len(locations),
        "metrics": {
            "avg_congestion":  avg_congestion,
            "max_congestion":  max_congestion,
            "avg_aqi":         avg_aqi,
            "max_aqi":         max_aqi,
            "active_events":   len(active_events),
            "decisions_1h":    len(recent_decisions),
            "most_congested":  most_congested["name"] if most_congested else None,
        },
        "locations":         location_snapshots,
        "active_events":     events_payload,
        "recent_decisions":  decisions_payload,
        "alerts":            alerts,
    }
