"""
main.py — SynCity FastAPI application entry point.

Startup sequence:
  1. Create all DB tables (idempotent — Alembic handles migrations in prod)
  2. Seed default locations via ensure_locations()
  3. Start APScheduler with three jobs:
       - simulation tick   every 30 s  (traffic generator)
       - weather ingestion every 5 min (Open-Meteo)
       - AQI ingestion     every 5 min (WAQI/CPCB)
       - decision cycle    every 30 s  (rule engine)
  4. Register all routers under /api/v1

Shutdown:
  - APScheduler is stopped gracefully via the lifespan context manager.
"""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from apscheduler.schedulers.background import BackgroundScheduler

from config import get_settings
from database import engine, SessionLocal
from models import Location, TrafficData, EnvironmentData, Event, Decision  # noqa: F401 — ensure models registered
from database import Base
from services.ingestion import ensure_locations, ingest_weather, ingest_aqi
from services.decision_engine import run_cycle
from simulation.generator import simulate_tick

import routers.locations   as locations_router
import routers.traffic     as traffic_router
import routers.environment as environment_router
import routers.events      as events_router
import routers.decisions   as decisions_router
import routers.routing     as routing_router
import routers.dashboard   as dashboard_router

log = logging.getLogger(__name__)
settings = get_settings()

# ── Logging ───────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(name)s — %(message)s",
    datefmt="%H:%M:%S",
)


# ── Scheduled job wrappers (each opens its own DB session) ────────────────────

def _job_simulate():
    simulate_tick()   # manages its own session internally


def _job_decision():
    db = SessionLocal()
    try:
        run_cycle(db)
    finally:
        db.close()


def _job_weather():
    db = SessionLocal()
    try:
        ingest_weather(db)
        db.commit()
    except Exception as exc:
        log.error("Weather ingestion failed: %s", exc)
        db.rollback()
    finally:
        db.close()


def _job_aqi():
    db = SessionLocal()
    try:
        ingest_aqi(db)
        db.commit()
    except Exception as exc:
        log.error("AQI ingestion failed: %s", exc)
        db.rollback()
    finally:
        db.close()


# ── Lifespan ──────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    # ── Startup ───────────────────────────────────────────────────────────
    log.info("SynCity backend starting up…")

    # Create tables (migrations via Alembic in production)
    Base.metadata.create_all(bind=engine)
    log.info("Database tables verified / created")

    # Seed locations
    db = SessionLocal()
    try:
        ensure_locations(db)
        log.info("Locations seeded")
    finally:
        db.close()

    # APScheduler
    scheduler = BackgroundScheduler(timezone="UTC")

    scheduler.add_job(
        _job_simulate,
        "interval",
        seconds=settings.simulation_interval,
        id="simulation",
        max_instances=1,
        coalesce=True,
    )
    scheduler.add_job(
        _job_decision,
        "interval",
        seconds=settings.simulation_interval,
        id="decision_engine",
        max_instances=1,
        coalesce=True,
    )
    scheduler.add_job(
        _job_weather,
        "interval",
        seconds=settings.weather_poll_interval,
        id="weather_ingestion",
        max_instances=1,
        coalesce=True,
    )
    scheduler.add_job(
        _job_aqi,
        "interval",
        seconds=settings.waqi_poll_interval,
        id="aqi_ingestion",
        max_instances=1,
        coalesce=True,
    )

    scheduler.start()
    log.info(
        "APScheduler started — simulation every %ds, ingestion every %ds",
        settings.simulation_interval,
        settings.weather_poll_interval,
    )

    # Run first tick immediately so the dashboard has data on startup
    _job_simulate()
    _job_weather()
    _job_aqi()
    _job_decision()

    app.state.scheduler = scheduler

    yield  # ── app is running ──

    # ── Shutdown ──────────────────────────────────────────────────────────
    scheduler.shutdown(wait=False)
    log.info("APScheduler stopped. SynCity backend shutting down.")


# ── App ───────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="SynCity API",
    description="Smart city digital twin backend — traffic, environment, events, decisions, routing.",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
)

# ── CORS ──────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ───────────────────────────────────────────────────────────────────
PREFIX = "/api/v1"

app.include_router(locations_router.router,   prefix=PREFIX)
app.include_router(traffic_router.router,     prefix=PREFIX)
app.include_router(environment_router.router, prefix=PREFIX)
app.include_router(events_router.router,      prefix=PREFIX)
app.include_router(decisions_router.router,   prefix=PREFIX)
app.include_router(routing_router.router,     prefix=PREFIX)
app.include_router(dashboard_router.router,   prefix=PREFIX)


# ── Health check ──────────────────────────────────────────────────────────────
@app.get("/health", tags=["meta"])
def health():
    return {"status": "ok", "service": "syncity-backend"}


@app.get("/", tags=["meta"])
def root():
    return {
        "service": "SynCity API",
        "version": "1.0.0",
        "docs":    "/api/docs",
    }
