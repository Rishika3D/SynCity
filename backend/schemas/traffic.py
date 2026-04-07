from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional


class TrafficDataCreate(BaseModel):
    location_id: int
    congestion_level: float = Field(..., ge=0, le=100)
    vehicle_count: Optional[int] = None
    avg_speed_kmh: Optional[float] = None
    source: str = "simulation"


class TrafficDataRead(TrafficDataCreate):
    id: int
    timestamp: datetime

    model_config = {"from_attributes": True}
