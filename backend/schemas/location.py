from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional


class LocationCreate(BaseModel):
    name: str = Field(..., max_length=120)
    location_type: str = Field("intersection", max_length=60)
    lat: float = Field(..., ge=-90, le=90)
    lng: float = Field(..., ge=-180, le=180)


class LocationRead(LocationCreate):
    id: int
    created_at: datetime

    model_config = {"from_attributes": True}
