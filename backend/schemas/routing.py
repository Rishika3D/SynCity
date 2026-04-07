from pydantic import BaseModel, Field
from typing import Optional


class Coordinate(BaseModel):
    lat: float = Field(..., ge=-90, le=90)
    lng: float = Field(..., ge=-180, le=180)


class RouteRequest(BaseModel):
    origin: Coordinate
    destination: Coordinate
    avoid_high_aqi: bool = True         # skip zones with AQI > threshold
    avoid_events: bool = True           # skip active event zones
    congestion_threshold: float = 70.0  # avoid locations above this level


class CongestedZone(BaseModel):
    location_id: int
    name: str
    lat: float
    lng: float
    congestion_level: float
    reason: str   # "congestion" | "event" | "aqi"


class RouteResponse(BaseModel):
    origin: Coordinate
    destination: Coordinate
    avoid_zones: list[CongestedZone]
    mapbox_waypoints: list[Coordinate]  # waypoints to pass to Mapbox Directions
    decision_ids: list[int]             # decisions logged for this routing call
    summary: str
