from pydantic import BaseModel
from typing import List

class CommandModel(BaseModel):
    command: str
    package: str
    class_name: str
    method: str
    args: List[str] = []
    priority: int = 5  # Default priority if not specified