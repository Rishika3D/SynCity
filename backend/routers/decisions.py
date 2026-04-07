from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import desc
from datetime import datetime, timedelta, timezone

from database import get_db
from models import Decision
from schemas import DecisionRead
from services.decision_engine import run_cycle

router = APIRouter(prefix="/decisions", tags=["decisions"])


@router.get("/", response_model=list[DecisionRead])
def list_decisions(
    location_id: int | None = Query(None),
    action_type: str | None = Query(None),
    since_minutes: int = Query(60, le=1440),
    limit: int = Query(100, le=500),
    db: Session = Depends(get_db),
):
    """Audit log of all autonomous decisions made by the decision engine."""
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=since_minutes)
    q = db.query(Decision).filter(Decision.timestamp >= cutoff)
    if location_id is not None:
        q = q.filter(Decision.location_id == location_id)
    if action_type:
        q = q.filter(Decision.action_type == action_type)
    return q.order_by(desc(Decision.timestamp)).limit(limit).all()


@router.post("/run-cycle", response_model=list[DecisionRead])
def trigger_decision_cycle(db: Session = Depends(get_db)):
    """
    Manually trigger a decision engine cycle.
    Useful for testing or when the scheduler is disabled.
    Returns all decisions created in this cycle.
    """
    decisions = run_cycle(db)
    return decisions
