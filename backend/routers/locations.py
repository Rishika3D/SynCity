from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from geoalchemy2.elements import WKTElement

from database import get_db
from models import Location
from schemas import LocationCreate, LocationRead

router = APIRouter(prefix="/locations", tags=["locations"])


@router.get("/", response_model=list[LocationRead])
def list_locations(db: Session = Depends(get_db)):
    return db.query(Location).order_by(Location.name).all()


@router.get("/{location_id}", response_model=LocationRead)
def get_location(location_id: int, db: Session = Depends(get_db)):
    loc = db.query(Location).filter(Location.id == location_id).first()
    if not loc:
        raise HTTPException(status_code=404, detail="Location not found")
    return loc


@router.post("/", response_model=LocationRead, status_code=status.HTTP_201_CREATED)
def create_location(payload: LocationCreate, db: Session = Depends(get_db)):
    geom = WKTElement(f"POINT({payload.lng} {payload.lat})", srid=4326)
    loc = Location(**payload.model_dump(), geom=geom)
    db.add(loc)
    db.commit()
    db.refresh(loc)
    return loc
