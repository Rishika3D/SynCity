"""
EnvironmentData — time-series environmental readings per location.
Sources: WAQI (AQI), Open-Meteo (weather), or simulation.
Same TimescaleDB hypertable recommendation as traffic_data.
"""
from sqlalchemy import (
    Column, Integer, Float, String, DateTime,
    ForeignKey, Index, func,
)
from sqlalchemy.orm import relationship
from database import Base


class EnvironmentData(Base):
    __tablename__ = "environment_data"

    id            = Column(Integer, primary_key=True, index=True)
    location_id   = Column(Integer, ForeignKey("locations.id", ondelete="CASCADE"), nullable=False)
    timestamp     = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    # Air quality
    aqi           = Column(Float, nullable=True)    # US AQI (WAQI)
    pm25          = Column(Float, nullable=True)    # µg/m³
    pm10          = Column(Float, nullable=True)    # µg/m³
    no2           = Column(Float, nullable=True)    # µg/m³
    o3            = Column(Float, nullable=True)    # µg/m³

    # Weather (Open-Meteo)
    temperature   = Column(Float, nullable=True)    # °C
    humidity      = Column(Float, nullable=True)    # %
    visibility    = Column(Float, nullable=True)    # km
    precipitation = Column(Float, nullable=True)    # mm/h
    wind_speed    = Column(Float, nullable=True)    # km/h

    source        = Column(String(40), nullable=False, default="open-meteo")

    __table_args__ = (
        Index("ix_env_location_time", "location_id", "timestamp"),
    )

    location = relationship("Location", back_populates="environment_data")

    def __repr__(self) -> str:
        return (
            f"<EnvironmentData loc={self.location_id} "
            f"aqi={self.aqi} temp={self.temperature} ts={self.timestamp}>"
        )
