"""
Event — discrete city events (accidents, sudden congestion, road closures).
active=True means the event is ongoing and should influence routing.
geom allows PostGIS radius queries: avoid routes within X metres of event.
"""
from sqlalchemy import (
    Column, Integer, String, Boolean, DateTime,
    ForeignKey, Text, func,
)
from sqlalchemy.orm import relationship
from geoalchemy2 import Geometry
from database import Base


EVENT_TYPES = ("accident", "congestion_spike", "road_closure", "signal_failure", "weather_event")
SEVERITIES  = ("low", "medium", "high", "critical")


class Event(Base):
    __tablename__ = "events"

    id          = Column(Integer, primary_key=True, index=True)
    location_id = Column(Integer, ForeignKey("locations.id", ondelete="SET NULL"), nullable=True)
    event_type  = Column(String(40), nullable=False)   # see EVENT_TYPES
    severity    = Column(String(20), nullable=False, default="medium")
    description = Column(Text, nullable=True)
    active      = Column(Boolean, nullable=False, default=True, index=True)

    # Spatial footprint of the event (may differ from location centroid)
    geom        = Column(Geometry("POINT", srid=4326), nullable=True)

    started_at  = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    resolved_at = Column(DateTime(timezone=True), nullable=True)

    # Source of event detection
    source      = Column(String(40), nullable=False, default="decision_engine")
    # source: decision_engine | simulation | manual | sensor

    location = relationship("Location", back_populates="events")

    def __repr__(self) -> str:
        return (
            f"<Event id={self.id} type={self.event_type!r} "
            f"severity={self.severity} active={self.active}>"
        )
