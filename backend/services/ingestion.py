"""
ingestion.py — Background data ingestion from external APIs.

Each job runs in its own APScheduler thread so a timeout on one API
(e.g. WAQI going down) never blocks weather ingestion.

Retry logic:
  - Each request retried up to 3 times with exponential backoff.
  - Failures are logged but never raise — the scheduler keeps running.

Data is written directly to DB (no queue needed at this scale).
At higher volume, replace with a pg-boss or Redis Streams queue.
"""
from __future__ import annotations

import logging
import time
from datetime import datetime, timezone
from typing import Optional

import httpx
from sqlalchemy.orm import Session

from database import SessionLocal
from models import Location, EnvironmentData
from config import get_settings

log = logging.getLogger(__name__)
settings = get_settings()

# ── Bangalore district locations (matches our WAQI + Open-Meteo coverage) ───
INGEST_LOCATIONS = [
    {"name": "Koramangala",     "lat": 12.9342, "lng": 77.6268},
    {"name": "MG Road",         "lat": 12.9762, "lng": 77.6033},
    {"name": "Silk Board",      "lat": 12.9174, "lng": 77.6226},
    {"name": "Marathahalli",    "lat": 12.9591, "lng": 77.6974},
    {"name": "Electronic City", "lat": 12.8458, "lng": 77.6603},
    {"name": "Yeshwanthpur",    "lat": 13.0250, "lng": 77.5500},
    {"name": "Jayanagar",       "lat": 12.9250, "lng": 77.5938},
    {"name": "City Centre",     "lat": 12.9716, "lng": 77.5946},
    {"name": "Sarjapur",        "lat": 12.9010, "lng": 77.6855},
    {"name": "Hebbal",          "lat": 13.0358, "lng": 77.5972},
]


# ── Retry helper ──────────────────────────────────────────────────────────────

def _fetch_with_retry(url: str, params: dict | None = None, retries: int = 3) -> dict | None:
    """GET with exponential backoff. Returns JSON dict or None on total failure."""
    for attempt in range(retries):
        try:
            with httpx.Client(timeout=10.0) as client:
                r = client.get(url, params=params)
                r.raise_for_status()
                return r.json()
        except Exception as exc:
            wait = 2 ** attempt
            log.warning("Fetch failed (attempt %d/%d): %s — retrying in %ds", attempt + 1, retries, exc, wait)
            if attempt < retries - 1:
                time.sleep(wait)
    log.error("All %d retries exhausted for %s", retries, url)
    return None


# ── Location sync ─────────────────────────────────────────────────────────────

def ensure_locations(db: Session) -> dict[str, Location]:
    """
    Upsert INGEST_LOCATIONS into the DB so ingested env data has valid FK targets.
    Returns {name: Location} mapping.
    """
    from geoalchemy2.elements import WKTElement
    result = {}
    for loc_data in INGEST_LOCATIONS:
        existing = db.query(Location).filter(Location.name == loc_data["name"]).first()
        if not existing:
            geom = WKTElement(f"POINT({loc_data['lng']} {loc_data['lat']})", srid=4326)
            existing = Location(
                name=loc_data["name"],
                location_type="district",
                lat=loc_data["lat"],
                lng=loc_data["lng"],
                geom=geom,
            )
            db.add(existing)
            log.info("Created location: %s", loc_data["name"])
    db.commit()
    # Reload to get IDs
    for loc_data in INGEST_LOCATIONS:
        loc = db.query(Location).filter(Location.name == loc_data["name"]).first()
        if loc:
            result[loc.name] = loc
    return result


# ── Open-Meteo weather ingestion ──────────────────────────────────────────────

def ingest_weather(db: Optional[Session] = None) -> None:
    """
    Fetch temperature, humidity, wind, precipitation for each district from Open-Meteo.
    No API key required.
    """
    own_session = db is None
    if own_session:
        db = SessionLocal()

    try:
        locations = ensure_locations(db)
        ingested = 0

        for loc_data in INGEST_LOCATIONS:
            loc = locations.get(loc_data["name"])
            if not loc:
                continue

            data = _fetch_with_retry(
                "https://api.open-meteo.com/v1/forecast",
                params={
                    "latitude": loc_data["lat"],
                    "longitude": loc_data["lng"],
                    "current": "temperature_2m,relative_humidity_2m,wind_speed_10m,precipitation",
                    "timezone": "Asia/Kolkata",
                },
            )
            if not data:
                continue

            cur = data.get("current", {})
            env = EnvironmentData(
                location_id=loc.id,
                temperature=cur.get("temperature_2m"),
                humidity=cur.get("relative_humidity_2m"),
                wind_speed=cur.get("wind_speed_10m"),
                precipitation=cur.get("precipitation"),
                source="open-meteo",
            )
            db.add(env)
            ingested += 1

        db.commit()
        log.info("Weather ingestion complete — %d locations updated", ingested)

    except Exception as exc:
        db.rollback()
        log.error("Weather ingestion failed: %s", exc)
    finally:
        if own_session:
            db.close()


# ── WAQI AQI ingestion ────────────────────────────────────────────────────────

def ingest_aqi(db: Optional[Session] = None) -> None:
    """
    Fetch AQI + individual pollutants from WAQI (real CPCB ground stations).
    Requires WAQI_API_KEY.
    """
    if not settings.waqi_api_key:
        log.warning("WAQI_API_KEY not set — skipping AQI ingestion")
        return

    own_session = db is None
    if own_session:
        db = SessionLocal()

    try:
        locations = ensure_locations(db)
        ingested = 0

        for loc_data in INGEST_LOCATIONS:
            loc = locations.get(loc_data["name"])
            if not loc:
                continue

            data = _fetch_with_retry(
                f"https://api.waqi.info/feed/geo:{loc_data['lat']};{loc_data['lng']}/",
                params={"token": settings.waqi_api_key},
            )
            if not data or data.get("status") != "ok":
                continue

            d = data.get("data", {})
            iaqi = d.get("iaqi", {})

            # Update the latest environment row OR create a new one
            env = EnvironmentData(
                location_id=loc.id,
                aqi=d.get("aqi"),
                pm25=iaqi.get("pm25", {}).get("v"),
                pm10=iaqi.get("pm10", {}).get("v"),
                no2=iaqi.get("no2", {}).get("v"),
                o3=iaqi.get("o3", {}).get("v"),
                temperature=iaqi.get("t", {}).get("v"),
                humidity=iaqi.get("h", {}).get("v"),
                source="waqi-cpcb",
            )
            db.add(env)
            ingested += 1

        db.commit()
        log.info("AQI ingestion complete — %d locations updated", ingested)

    except Exception as exc:
        db.rollback()
        log.error("AQI ingestion failed: %s", exc)
    finally:
        if own_session:
            db.close()
