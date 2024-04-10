from pydantic import BaseModel
from typing import List, Optional

class RssItem(BaseModel):
    title: Optional[str]
    link: Optional[str]
    description: Optional[str]
    pubDate: Optional[str]

class RssFeed(BaseModel):
    title: Optional[str]
    link: Optional[str]
    description: Optional[str]
    items: List[RssItem] = []