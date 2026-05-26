"""
database.py — SQLAlchemy engine, session factory, and declarative Base.

Pool config:
  pool_size=10  — keep 10 connections alive (handles concurrent ingestion + reads)
  max_overflow=20 — allow burst up to 30 total
  pool_pre_ping=True — detect stale connections before use
"""
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase
from config import get_settings

settings = get_settings()

engine = create_engine(
    settings.database_url,
    pool_size=10,
    max_overflow=20,
    pool_pre_ping=True,
    pool_recycle=1800,   # recycle connections every 30 min
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


# ── Dependency injected into every router ────────────────────────────────────
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
