"""
TrafficData — high-frequency time-series congestion readings.

NOTE: If TimescaleDB is available, run after migration:
  SELECT create_hypertable('traffic_data', 'timestamp');
This gives automatic time partitioning and 10× query speed on recent windows.

Covering index on (location_id, timestamp DESC) avoids full scans in the
decision engine's "last N readings per location" query.
"""
from sqlalchemy import (
    Column, Integer, Float, String, DateTime,
    ForeignKey, Index, func, CheckConstraint,
)
from sqlalchemy.orm import relationship
from database import Base


class TrafficData(Base):
    __tablename__ = "traffic_data"

    id               = Column(Integer, primary_key=True, index=True)
    location_id      = Column(Integer, ForeignKey("locations.id", ondelete="CASCADE"), nullable=False)
    timestamp        = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    congestion_level = Column(Float, nullable=False)   # 0–100
    vehicle_count    = Column(Integer, nullable=True)
    avg_speed_kmh    = Column(Float, nullable=True)
    source           = Column(String(40), nullable=False, default="simulation")
    # source: simulation | mapbox_traffic | sensor

    __table_args__ = (
        CheckConstraint("congestion_level >= 0 AND congestion_level <= 100",
                        name="ck_congestion_range"),
        # Covering index — crucial for decision engine latency
        Index("ix_traffic_location_time", "location_id", "timestamp"),
    )

    location = relationship("Location", back_populates="traffic_data")

    def __repr__(self) -> str:
        return (
            f"<TrafficData loc={self.location_id} "
            f"congestion={self.congestion_level:.1f} ts={self.timestamp}>"
        )
