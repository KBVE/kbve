from pydantic import BaseModel
from typing import Any

class BroadcastModel(BaseModel):
    channel: str
    content: Any