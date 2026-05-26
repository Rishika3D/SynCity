from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from database import get_db
from schemas.routing import RouteRequest, RouteResponse
from services.routing_service import compute_route

router = APIRouter(prefix="/routing", tags=["routing"])


@router.post("/", response_model=RouteResponse)
def get_smart_route(payload: RouteRequest, db: Session = Depends(get_db)):
    """
    Compute a smart route between two coordinates.

    Analyses current congestion, active events, and AQI across all monitored
    locations in the corridor, then returns zones to avoid and Mapbox-compatible
    waypoints for the frontend to use in a Directions API call.

    A Decision row is logged for every routing call that triggers an avoidance.
    """
    return compute_route(db, payload)
