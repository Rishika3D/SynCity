"""
config.py — Centralised settings loaded from .env
All values have safe defaults so the app starts without a full .env.
"""
from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # ── Database ──────────────────────────────────────────────────────────
    database_url: str = "postgresql://postgres:password@localhost:5432/syncity"

    # ── External APIs ─────────────────────────────────────────────────────
    waqi_api_key: str = ""
    mapbox_token: str = ""

    # ── Ingestion schedule (seconds) ──────────────────────────────────────
    weather_poll_interval: int = 300       # 5 min
    waqi_poll_interval: int = 300          # 5 min
    simulation_interval: int = 30          # 30 s

    # ── Decision engine thresholds ────────────────────────────────────────
    congestion_reroute_threshold: int = 80
    congestion_signal_threshold: int = 60
    aqi_alert_threshold: int = 150

    # ── CORS ──────────────────────────────────────────────────────────────
    allowed_origins: str = "http://localhost:3000"

    @property
    def origins_list(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins.split(",")]

    class Config:
        env_file = ".env"


@lru_cache
def get_settings() -> Settings:
    return Settings()
