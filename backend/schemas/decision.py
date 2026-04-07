from pydantic import BaseModel
from datetime import datetime
from typing import Optional, Any


class DecisionRead(BaseModel):
    id: int
    timestamp: datetime
    trigger_type: str
    trigger_value: Optional[str]
    location_id: Optional[int]
    action_type: str
    action_description: Optional[str]
    metadata_json: Optional[dict[str, Any]]

    model_config = {"from_attributes": True}
