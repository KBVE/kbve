from pydantic import BaseModel
from typing import Any, List, Optional

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

class KBVELoginModel(BaseModel):
    command: str = "login"
    username: str
    password: str
    bankpin: str
    world: int
    uuid: Optional[str] = Field(default="default-uuid")

model_map = {
    "execute": CommandModel,
    "log": LoggerModel,
    "login": KBVELoginModel,
    # Add future command mappings here
}