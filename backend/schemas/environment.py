from pydantic import BaseModel
from datetime import datetime
from typing import Optional


class EnvironmentDataCreate(BaseModel):
    location_id: int
    aqi: Optional[float] = None
    pm25: Optional[float] = None
    pm10: Optional[float] = None
    no2: Optional[float] = None
    o3: Optional[float] = None
    temperature: Optional[float] = None
    humidity: Optional[float] = None
    visibility: Optional[float] = None
    precipitation: Optional[float] = None
    wind_speed: Optional[float] = None
    source: str = "open-meteo"


class EnvironmentDataRead(EnvironmentDataCreate):
    id: int
    timestamp: datetime

    model_config = {"from_attributes": True}
