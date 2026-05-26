from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import desc
from datetime import datetime, timedelta, timezone

from database import get_db
from models import TrafficData, Location
from schemas import TrafficDataCreate, TrafficDataRead

router = APIRouter(prefix="/traffic", tags=["traffic"])


@router.get("/", response_model=list[TrafficDataRead])
def get_traffic(
    location_id: int | None = Query(None),
    limit: int = Query(50, le=500),
    since_minutes: int = Query(60, le=1440),
    db: Session = Depends(get_db),
):
    """Latest traffic readings, optionally filtered by location and time window."""
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=since_minutes)
    q = db.query(TrafficData).filter(TrafficData.timestamp >= cutoff)
    if location_id:
        q = q.filter(TrafficData.location_id == location_id)
    return q.order_by(desc(TrafficData.timestamp)).limit(limit).all()


@router.get("/current", response_model=list[dict])
def get_current_traffic(db: Session = Depends(get_db)):
    """
    Most recent congestion reading for every location.
    Used by the dashboard and map heatmap.
    """
    locations = db.query(Location).all()
    result = []
    for loc in locations:
        latest = (
            db.query(TrafficData)
            .filter(TrafficData.location_id == loc.id)
            .order_by(desc(TrafficData.timestamp))
            .first()
        )
        result.append({
            "location_id":      loc.id,
            "name":             loc.name,
            "lat":              loc.lat,
            "lng":              loc.lng,
            "congestion_level": latest.congestion_level if latest else None,
            "vehicle_count":    latest.vehicle_count    if latest else None,
            "avg_speed_kmh":    latest.avg_speed_kmh    if latest else None,
            "timestamp":        latest.timestamp         if latest else None,
        })
    return result


@router.post("/", response_model=TrafficDataRead, status_code=201)
def ingest_traffic(payload: TrafficDataCreate, db: Session = Depends(get_db)):
    """Accepts traffic data from the simulation microservice or external sensors."""
    row = TrafficData(**payload.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    return row
