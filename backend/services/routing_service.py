"""
routing_service.py — Smart route modification using DB state.

Flow:
  1. Accept origin + destination from user
  2. Find all locations within a corridor around the direct path (PostGIS)
  3. Filter for: high congestion | active events | high AQI
  4. Return avoid_zones + Mapbox-compatible waypoints
  5. Log a Decision for the routing call

The frontend passes these waypoints to Mapbox Directions for the actual
route geometry — we don't duplicate Mapbox's routing engine.
"""
from __future__ import annotations

import logging
from typing import Optional

from sqlalchemy.orm import Session
from sqlalchemy import desc, text

from models import Location, TrafficData, EnvironmentData, Event, Decision
from schemas.routing import RouteRequest, RouteResponse, CongestedZone, Coordinate
from services.decision_engine import _log_decision
from config import get_settings

log = logging.getLogger(__name__)
settings = get_settings()

# Radius in metres around each location to consider it "blocking" the route
AVOIDANCE_RADIUS_M = 500


def _latest_congestion(db: Session, location_id: int) -> Optional[float]:
    row = (
        db.query(TrafficData.congestion_level)
        .filter(TrafficData.location_id == location_id)
        .order_by(desc(TrafficData.timestamp))
        .first()
    )
    return row[0] if row else None


def _latest_aqi(db: Session, location_id: int) -> Optional[float]:
    row = (
        db.query(EnvironmentData.aqi)
        .filter(EnvironmentData.location_id == location_id, EnvironmentData.aqi.isnot(None))
        .order_by(desc(EnvironmentData.timestamp))
        .first()
    )
    return row[0] if row else None


def compute_route(db: Session, req: RouteRequest) -> RouteResponse:
    """
    Analyse all locations and return avoid_zones + routing waypoints.
    """
    avoid_zones: list[CongestedZone] = []
    decision_ids: list[int] = []

    # ── Query locations near the origin→destination corridor ─────────────
    # We use a simplified bounding box (not true corridor) for v1 performance.
    # Upgrade to ST_Buffer(ST_MakeLine(...)) for true corridor queries.
    min_lat = min(req.origin.lat, req.destination.lat) - 0.05
    max_lat = max(req.origin.lat, req.destination.lat) + 0.05
    min_lng = min(req.origin.lng, req.destination.lng) - 0.05
    max_lng = max(req.origin.lng, req.destination.lng) + 0.05

    nearby_locations = (
        db.query(Location)
        .filter(
            Location.lat.between(min_lat, max_lat),
            Location.lng.between(min_lng, max_lng),
        )
        .all()
    )

    for loc in nearby_locations:
        reasons: list[str] = []

        # ── Check congestion ──────────────────────────────────────────────
        congestion = _latest_congestion(db, loc.id)
        if congestion is not None and congestion >= req.congestion_threshold:
            reasons.append(f"congestion={congestion:.0f}")

        # ── Check active events ───────────────────────────────────────────
        if req.avoid_events:
            events = (
                db.query(Event)
                .filter(Event.location_id == loc.id, Event.active == True)  # noqa: E712
                .all()
            )
            for ev in events:
                reasons.append(f"event:{ev.event_type}")

        # ── Check AQI ─────────────────────────────────────────────────────
        if req.avoid_high_aqi:
            aqi = _latest_aqi(db, loc.id)
            if aqi and aqi >= settings.aqi_alert_threshold:
                reasons.append(f"aqi={aqi:.0f}")

        if reasons:
            avoid_zones.append(
                CongestedZone(
                    location_id=loc.id,
                    name=loc.name,
                    lat=loc.lat,
                    lng=loc.lng,
                    congestion_level=congestion or 0.0,
                    reason=" | ".join(reasons),
                )
            )

    # ── Log the routing decision ──────────────────────────────────────────
    if avoid_zones:
        d = _log_decision(
            db,
            trigger_type="routing_request",
            action_type="REROUTE",
            description=(
                f"Route from ({req.origin.lat:.4f},{req.origin.lng:.4f}) "
                f"to ({req.destination.lat:.4f},{req.destination.lng:.4f}) — "
                f"{len(avoid_zones)} zone(s) avoided"
            ),
            metadata={
                "avoid_count": len(avoid_zones),
                "avoided_locations": [z.name for z in avoid_zones],
            },
        )
        db.commit()
        decision_ids.append(d.id)

    # ── Build Mapbox waypoints (midpoints between avoid clusters) ─────────
    # Simple strategy: pass avoid zone centres as exclusion hints to frontend.
    # The frontend uses these as "avoid" coordinates in Mapbox Directions.
    mapbox_waypoints = [
        Coordinate(lat=z.lat, lng=z.lng) for z in avoid_zones
    ]

    summary = (
        f"Found {len(avoid_zones)} zone(s) to avoid. "
        + ("Rerouting recommended." if avoid_zones else "Route is clear.")
    )

    log.info(
        "Route computed: %d avoid zones | origin=(%s,%s) dest=(%s,%s)",
        len(avoid_zones),
        req.origin.lat, req.origin.lng,
        req.destination.lat, req.destination.lng,
    )

    return RouteResponse(
        origin=req.origin,
        destination=req.destination,
        avoid_zones=avoid_zones,
        mapbox_waypoints=mapbox_waypoints,
        decision_ids=decision_ids,
        summary=summary,
    )
