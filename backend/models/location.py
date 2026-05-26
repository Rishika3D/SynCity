"""
Location — static city locations (intersections, districts, sensors).
geom is a PostGIS Point (SRID 4326 = WGS-84 lat/lng).
GIST index on geom enables fast ST_DWithin and ST_Contains queries.
"""
from sqlalchemy import Column, Integer, String, Float, DateTime, func
from sqlalchemy.orm import relationship
from geoalchemy2 import Geometry
from database import Base


class Location(Base):
    __tablename__ = "locations"

    id            = Column(Integer, primary_key=True, index=True)
    name          = Column(String(120), nullable=False)
    location_type = Column(String(60), nullable=False, default="intersection")
    # e.g. intersection | district | sensor_node | poi
    lat           = Column(Float, nullable=False)
    lng           = Column(Float, nullable=False)
    geom          = Column(
        Geometry("POINT", srid=4326),
        nullable=False,
        comment="PostGIS point — enables spatial queries via ST_DWithin etc."
    )
    created_at    = Column(DateTime(timezone=True), server_default=func.now())

    # ── Relationships ──────────────────────────────────────────────────────
    traffic_data   = relationship("TrafficData",    back_populates="location", cascade="all, delete-orphan")
    environment_data = relationship("EnvironmentData", back_populates="location", cascade="all, delete-orphan")
    events         = relationship("Event",          back_populates="location", cascade="all, delete-orphan")
    decisions      = relationship("Decision",       back_populates="location")

    def __repr__(self) -> str:
        return f"<Location id={self.id} name={self.name!r} type={self.location_type}>"
