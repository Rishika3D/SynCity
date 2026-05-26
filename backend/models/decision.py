"""
Decision — audit log of every action the decision engine takes.
Immutable append-only table: never update, only insert.
Allows replay, debugging, and ML training data generation.
"""
from sqlalchemy import (
    Column, Integer, String, DateTime, ForeignKey,
    Text, func, JSON,
)
from sqlalchemy.orm import relationship
from database import Base


ACTION_TYPES = (
    "REROUTE",
    "SIGNAL_ADJUST",
    "ENVIRONMENTAL_ALERT",
    "EMERGENCY_REROUTE",
    "CONGESTION_WARNING",
    "NO_ACTION",
)


class Decision(Base):
    __tablename__ = "decisions"

    id                  = Column(Integer, primary_key=True, index=True)
    timestamp           = Column(DateTime(timezone=True), nullable=False,
                                 server_default=func.now(), index=True)

    # What triggered this decision
    trigger_type        = Column(String(40), nullable=False)
    # e.g. congestion_threshold | event_detected | aqi_spike

    trigger_value       = Column(String(80), nullable=True)
    # Human-readable value that crossed a threshold, e.g. "congestion=87"

    # Where
    location_id         = Column(Integer, ForeignKey("locations.id", ondelete="SET NULL"),
                                 nullable=True)

    # What was decided
    action_type         = Column(String(40), nullable=False)   # see ACTION_TYPES
    action_description  = Column(Text, nullable=True)

    # Rich context — store the full snapshot that led to this decision
    metadata_json       = Column(JSON, nullable=True)
    # e.g. {"congestion_level": 87, "recent_avg": 72, "events_nearby": 1}

    location = relationship("Location", back_populates="decisions")

    def __repr__(self) -> str:
        return (
            f"<Decision id={self.id} trigger={self.trigger_type!r} "
            f"action={self.action_type!r} ts={self.timestamp}>"
        )
