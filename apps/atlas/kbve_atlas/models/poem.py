from pydantic import BaseModel, Field
from typing import List

class PoemDB(BaseModel):
    title: str
    author: str
    lines: List[str]
    linecount: int = Field(..., alias='linecount')