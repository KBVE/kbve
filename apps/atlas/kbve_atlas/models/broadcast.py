from pydantic import BaseModel
from typing import Any, List

class CommandModel(BaseModel):
    command: str
    package: str
    class_name: str
    method: str
    args: List[str] = []
    priority: int = 5

class LoggerModel(BaseModel):
    message: str
    priority: int
    
class BroadcastModel(BaseModel):
    channel: str
    content: Any 