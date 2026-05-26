from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from sqlalchemy import desc
from datetime import datetime, timezone

from database import get_db
from models import Event
from schemas import EventCreate, EventRead, EventUpdate

router = APIRouter(prefix="/events", tags=["events"])


@router.get("/", response_model=list[EventRead])
def list_events(
    active_only: bool = Query(True),
    location_id: int | None = Query(None),
    event_type: str | None = Query(None),
    limit: int = Query(100, le=500),
    db: Session = Depends(get_db),
):
    """
    List events. Defaults to only active ones.
    Filterable by location and event type.
    """
    q = db.query(Event)
    if active_only:
        q = q.filter(Event.active == True)  # noqa: E712
    if location_id is not None:
        q = q.filter(Event.location_id == location_id)
    if event_type:
        q = q.filter(Event.event_type == event_type)
    return q.order_by(desc(Event.started_at)).limit(limit).all()


@router.get("/{event_id}", response_model=EventRead)
def get_event(event_id: int, db: Session = Depends(get_db)):
    ev = db.query(Event).filter(Event.id == event_id).first()
    if not ev:
        raise HTTPException(status_code=404, detail="Event not found")
    return ev


@router.post("/", response_model=EventRead, status_code=status.HTTP_201_CREATED)
def create_event(payload: EventCreate, db: Session = Depends(get_db)):
    """
    Create a new event (e.g. from an external sensor or operator report).
    The decision engine will pick it up on the next cycle.
    """
    ev = Event(**payload.model_dump(), active=True)
    db.add(ev)
    db.commit()
    db.refresh(ev)
    return ev


@router.patch("/{event_id}", response_model=EventRead)
def update_event(event_id: int, payload: EventUpdate, db: Session = Depends(get_db)):
    """
    Resolve or update an event.
    Setting active=False stamps resolved_at automatically.
    """
    ev = db.query(Event).filter(Event.id == event_id).first()
    if not ev:
        raise HTTPException(status_code=404, detail="Event not found")

    update_data = payload.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(ev, field, value)

    # Auto-stamp resolved_at when resolving
    if update_data.get("active") is False and ev.resolved_at is None:
        ev.resolved_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(ev)
    return ev


@router.delete("/{event_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_event(event_id: int, db: Session = Depends(get_db)):
    """Hard-delete an event (prefer PATCH active=false for audit trail)."""
    ev = db.query(Event).filter(Event.id == event_id).first()
    if not ev:
        raise HTTPException(status_code=404, detail="Event not found")
    db.delete(ev)
    db.commit()
