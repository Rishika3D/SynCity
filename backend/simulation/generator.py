"""
simulation/generator.py — Realistic traffic & event simulation microservice.

Patterns modelled:
  - Diurnal congestion cycle: low (00-06), ramp (06-08), peak (08-10),
    mid-day moderate (10-17), evening peak (17-20), fall-off (20-00)
  - Location multipliers: Silk Board & Marathahalli 1.3×, Electronic City 1.2×
  - Random events: accidents (rare), congestion spikes (uncommon)
  - Gaussian noise on every reading

Run standalone:
  python -m simulation.generator

Or called as a scheduled job from main.py.
"""
from __future__ import annotations

import logging
import math
import random
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy.orm import Session

from database import SessionLocal
from models import Location, TrafficData, Event
from services.ingestion import ensure_locations

log = logging.getLogger(__name__)

# ── Location-specific congestion multipliers ──────────────────────────────────
MULTIPLIERS: dict[str, float] = {
    "Silk Board":      1.35,   # notorious bottleneck
    "Marathahalli":    1.30,
    "Electronic City": 1.20,
    "Hebbal":          1.15,
    "MG Road":         1.10,
}

# ── Event probabilities per cycle ─────────────────────────────────────────────
ACCIDENT_PROB      = 0.008   # ~0.8% chance per location per cycle
SPIKE_PROB         = 0.025   # ~2.5% chance of sudden congestion spike
AUTO_RESOLVE_AFTER = 6       # cycles before auto-resolving simulated events


def _diurnal_base(hour: int) -> float:
    """
    Return a base congestion level (0-100) based on time of day.
    Peaks at 09:00 (85) and 18:30 (80).
    """
    # Two Gaussian peaks
    morning = 85 * math.exp(-0.5 * ((hour - 9.0) / 1.2) ** 2)
    evening = 80 * math.exp(-0.5 * ((hour - 18.5) / 1.5) ** 2)
    night   = 12  # baseline
    return min(100, max(night, morning + evening + night))


def _noise(sigma: float = 6.0) -> float:
    return random.gauss(0, sigma)


def simulate_tick(db: Optional[Session] = None) -> int:
    """
    Generate one tick of traffic readings for all locations.
    Returns number of rows written.
    """
    own_session = db is None
    if own_session:
        db = SessionLocal()

    written = 0
    try:
        locations = ensure_locations(db)
        now = datetime.now(timezone.utc)
        hour = now.hour + now.minute / 60.0

        base = _diurnal_base(hour)

        for name, loc in locations.items():
            multiplier = MULTIPLIERS.get(name, 1.0)
            raw = base * multiplier + _noise()
            congestion = round(min(100.0, max(0.0, raw)), 2)

            # Speed inversely proportional to congestion
            speed = round(max(5.0, 80.0 - congestion * 0.70 + _noise(3)), 1)

            # Vehicle count loosely correlated with congestion
            vehicles = max(0, int(congestion * 12 + _noise(40)))

            row = TrafficData(
                location_id=loc.id,
                congestion_level=congestion,
                vehicle_count=vehicles,
                avg_speed_kmh=speed,
                source="simulation",
            )
            db.add(row)
            written += 1

            # ── Random accident ──────────────────────────────────────────
            if random.random() < ACCIDENT_PROB:
                ev = Event(
                    location_id=loc.id,
                    event_type="accident",
                    severity=random.choice(["medium", "high"]),
                    description=f"Simulated accident at {name}",
                    active=True,
                    source="simulation",
                )
                db.add(ev)
                log.warning("Simulated accident at %s", name)

            # ── Random congestion spike ──────────────────────────────────
            elif random.random() < SPIKE_PROB:
                ev = Event(
                    location_id=loc.id,
                    event_type="congestion_spike",
                    severity="medium",
                    description=f"Sudden congestion spike at {name}",
                    active=True,
                    source="simulation",
                )
                db.add(ev)

        # ── Auto-resolve old simulated events ─────────────────────────────
        from sqlalchemy import desc, func
        old_events = (
            db.query(Event)
            .filter(
                Event.active == True,  # noqa: E712
                Event.source == "simulation",
                # Resolve events older than AUTO_RESOLVE_AFTER cycles
                Event.started_at < func.now() - func.make_interval(
                    0, 0, 0, 0, 0,
                    AUTO_RESOLVE_AFTER * 30,   # seconds
                ),
            )
            .all()
        )
        for ev in old_events:
            ev.active = False
            ev.resolved_at = now

        db.commit()
        log.debug("Simulation tick — %d traffic rows written", written)

    except Exception as exc:
        db.rollback()
        log.error("Simulation tick failed: %s", exc)
        written = 0
    finally:
        if own_session:
            db.close()

    return written


if __name__ == "__main__":
    import time
    logging.basicConfig(level=logging.DEBUG)
    log.info("Running simulation in standalone mode — press Ctrl-C to stop")
    while True:
        n = simulate_tick()
        log.info("Tick: %d rows", n)
        time.sleep(30)
