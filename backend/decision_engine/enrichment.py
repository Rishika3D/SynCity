"""
enrichment.py — Attach three contextual signals to each Mapbox route.

Signal 1 — congestion
  Average congestion level (0–100) of monitored locations within
  CORRIDOR_RADIUS_M metres of the route geometry.
  Source: PostGIS spatial query against traffic_data + locations tables.

  Note: Mapbox already bakes GPS-probe congestion into its ETA.
  This signal cross-validates with our own CPCB/IoT ground sensor network —
  different sources, different spatial coverage, different latency.
  Together they are more reliable than either alone.

Signal 2 — weather_penalty (0 → 1)
  Open-Meteo WMO code → penalty mapping. Computed at the route midpoint.

Signal 3 — stability (0 → 1)
  Geometric similarity to the current active route.
  0 = identical path, 1 = completely different road.
  Prevents switching for marginal improvements that add driver confusion.

All three run concurrently (asyncio.gather) — no serial waiting.
Each degrades gracefully: failure returns a neutral default, never raises.
"""
from __future__ import annotations

import asyncio
import logging
import math
from typing import Optional

import httpx
from sqlalchemy.orm import Session
from sqlalchemy import text

from .config import (
    weather_code_to_penalty,
    CORRIDOR_RADIUS_M,
    STABILITY_SAMPLE_N,
)
from .schemas import EnrichedRoute, MapboxRoute, RouteGeometry

log = logging.getLogger(__name__)


# ── Signal 1: PostGIS congestion ──────────────────────────────────────────────

async def get_congestion_for_route(
    geometry: RouteGeometry,
    db: Session,
) -> tuple[float, int]:
    """
    Returns (avg_congestion, readings_count).
    Falls back to (50.0, 0) if the query fails or returns nothing.
    """
    sql = text("""
        SELECT
            COALESCE(AVG(t.congestion_level), 50.0)::float  AS avg_congestion,
            COUNT(t.id)::int                                  AS readings_count
        FROM traffic_data t
        JOIN locations l ON l.id = t.location_id
        WHERE ST_DWithin(
            l.geom::geography,
            ST_GeomFromGeoJSON(:geom_json)::geography,
            :radius_m
        )
        AND t.timestamp > NOW() - INTERVAL '15 minutes'
    """)

    import json
    geom_json = json.dumps({"type": geometry.type, "coordinates": geometry.coordinates})

    try:
        result = db.execute(sql, {"geom_json": geom_json, "radius_m": CORRIDOR_RADIUS_M})
        row = result.mappings().first()
        if row:
            return float(row["avg_congestion"]), int(row["readings_count"])
        return 50.0, 0
    except Exception as exc:
        log.warning("[enrichment] PostGIS query failed: %s", exc)
        return 50.0, 0


# ── Signal 2: Weather penalty ─────────────────────────────────────────────────

async def get_weather_penalty(coordinates: list[list[float]]) -> float:
    """
    Fetches Open-Meteo current conditions at the route midpoint.
    Returns a 0→1 penalty. Returns 0.0 (assume clear) on any failure.
    """
    mid = coordinates[len(coordinates) // 2]
    lng, lat = mid[0], mid[1]   # GeoJSON is [lng, lat]

    url = (
        f"https://api.open-meteo.com/v1/forecast"
        f"?latitude={lat}&longitude={lng}"
        f"&current=weather_code"
        f"&timezone=auto"
    )

    try:
        async with httpx.AsyncClient(timeout=4.0) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            data = resp.json()
            code = data.get("current", {}).get("weather_code", 0)
            return weather_code_to_penalty(int(code))
    except Exception as exc:
        log.warning("[enrichment] Weather fetch failed: %s", exc)
        return 0.0


# ── Signal 3: Stability score ─────────────────────────────────────────────────

def compute_stability(
    new_coords:     list[list[float]],
    current_coords: Optional[list[list[float]]],
) -> float:
    """
    Hausdorff-inspired mean minimum distance between sampled route points.
    Returns 0 when there is no current route (first trip = no switching cost).

    Algorithm:
      1. Sample N evenly-spaced points along each route
      2. For each new-route point, find the nearest current-route point
      3. Average those minimum distances
      4. Normalise: 0 km → 0.0, ≥ 5 km mean deviation → 1.0
    """
    if not current_coords or len(current_coords) == 0:
        return 0.0

    new_sampled     = _sample_evenly(new_coords,     STABILITY_SAMPLE_N)
    current_sampled = _sample_evenly(current_coords, STABILITY_SAMPLE_N)

    total_min_dist = 0.0
    for np_ in new_sampled:
        min_dist = min(_haversine_km(np_, cp) for cp in current_sampled)
        total_min_dist += min_dist

    mean_dev_km = total_min_dist / len(new_sampled)
    return min(1.0, mean_dev_km / 5.0)


def _sample_evenly(coords: list[list[float]], n: int) -> list[list[float]]:
    if len(coords) <= n:
        return coords
    step = (len(coords) - 1) / (n - 1)
    return [coords[round(i * step)] for i in range(n)]


def _haversine_km(p1: list[float], p2: list[float]) -> float:
    R = 6_371.0
    lng1, lat1 = p1[0], p1[1]
    lng2, lat2 = p2[0], p2[1]
    d_lat = math.radians(lat2 - lat1)
    d_lng = math.radians(lng2 - lng1)
    a = (math.sin(d_lat / 2) ** 2 +
         math.cos(math.radians(lat1)) * math.cos(math.radians(lat2))
         * math.sin(d_lng / 2) ** 2)
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


# ── Main enrichment function ──────────────────────────────────────────────────

async def enrich_route(
    route:         MapboxRoute,
    current_route: Optional[object],  # CurrentRouteState | None
    db:            Session,
) -> EnrichedRoute:
    """
    Enriches a single Mapbox route with congestion, weather, and stability.
    PostGIS + weather calls run concurrently.
    """
    current_coords = (
        current_route.geometry.coordinates
        if current_route else None
    )

    # Fire PostGIS + weather concurrently — no reason to serialise
    (avg_congestion, readings_count), weather_penalty = await asyncio.gather(
        get_congestion_for_route(route.geometry, db),
        get_weather_penalty(route.geometry.coordinates),
    )

    stability = compute_stability(route.geometry.coordinates, current_coords)

    return EnrichedRoute(
        route_id         = route.route_id,
        duration         = route.duration,
        distance         = route.distance,
        geometry         = route.geometry,
        congestion       = avg_congestion,
        congestion_basis = readings_count,
        weather_penalty  = weather_penalty,
        stability        = stability,
    )


async def enrich_all_routes(
    routes:        list[MapboxRoute],
    current_route: Optional[object],
    db:            Session,
) -> list[EnrichedRoute]:
    """Enriches all routes concurrently."""
    return await asyncio.gather(
        *[enrich_route(r, current_route, db) for r in routes]
    )
