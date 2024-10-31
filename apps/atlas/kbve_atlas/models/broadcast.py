from pydantic import BaseModel, Field
from typing import Any, List, Optional, Union

class CommandModel(BaseModel):
    command: str
    packageName: str
    className: str
    method: str
    args: List[Union[str, int, float, bool]] = []
    priority: int = 5

class LoggerModel(BaseModel):
    command: str = "log"
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