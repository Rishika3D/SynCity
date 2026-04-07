from pydantic import BaseModel
from datetime import datetime
from typing import Optional


class EventCreate(BaseModel):
    location_id: Optional[int] = None
    event_type: str
    severity: str = "medium"
    description: Optional[str] = None
    source: str = "decision_engine"


class EventUpdate(BaseModel):
    active: Optional[bool] = None
    severity: Optional[str] = None
    description: Optional[str] = None


class EventRead(EventCreate):
    id: int
    active: bool
    started_at: datetime
    resolved_at: Optional[datetime] = None

    model_config = {"from_attributes": True}
