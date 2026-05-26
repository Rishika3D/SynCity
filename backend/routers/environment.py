from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import desc
from datetime import datetime, timedelta, timezone

from database import get_db
from models import EnvironmentData, Location
from schemas import EnvironmentDataCreate, EnvironmentDataRead

router = APIRouter(prefix="/environment", tags=["environment"])


@router.get("/", response_model=list[EnvironmentDataRead])
def get_environment(
    location_id: int | None = Query(None),
    limit: int = Query(50, le=500),
    since_minutes: int = Query(60, le=1440),
    db: Session = Depends(get_db),
):
    """Latest environment readings, optionally filtered by location and time window."""
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=since_minutes)
    q = db.query(EnvironmentData).filter(EnvironmentData.timestamp >= cutoff)
    if location_id:
        q = q.filter(EnvironmentData.location_id == location_id)
    return q.order_by(desc(EnvironmentData.timestamp)).limit(limit).all()


@router.get("/current", response_model=list[dict])
def get_current_environment(db: Session = Depends(get_db)):
    """
    Most recent environment reading for every location.
    Used by the AQI heatmap and city status panel.
    """
    locations = db.query(Location).all()
    result = []
    for loc in locations:
        latest = (
            db.query(EnvironmentData)
            .filter(EnvironmentData.location_id == loc.id)
            .order_by(desc(EnvironmentData.timestamp))
            .first()
        )
        result.append({
            "location_id":  loc.id,
            "name":         loc.name,
            "lat":          loc.lat,
            "lng":          loc.lng,
            "aqi":          latest.aqi          if latest else None,
            "pm25":         latest.pm25         if latest else None,
            "pm10":         latest.pm10         if latest else None,
            "no2":          latest.no2          if latest else None,
            "o3":           latest.o3           if latest else None,
            "temperature":  latest.temperature  if latest else None,
            "humidity":     latest.humidity     if latest else None,
            "wind_speed":   latest.wind_speed   if latest else None,
            "source":       latest.source       if latest else None,
            "timestamp":    latest.timestamp    if latest else None,
        })
    return result


@router.post("/", response_model=EnvironmentDataRead, status_code=201)
def ingest_environment(payload: EnvironmentDataCreate, db: Session = Depends(get_db)):
    """Accepts environment data from the ingestion service or external sensors."""
    row = EnvironmentData(**payload.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    return row
