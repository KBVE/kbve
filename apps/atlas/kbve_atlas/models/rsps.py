from typing import List, Union
from pydantic import BaseModel, Field

# Models for /stats endpoint
class Stat(BaseModel):
    stat: str
    level: int
    boostedLevel: int
    xp: int
    xp_gained: Union[int, str] = Field(alias='xp gained')

class GameStat(BaseModel):
    stats: List[Stat]

# Models for /events endpoint
class WorldPoint(BaseModel):
    x: int
    y: int
    plane: int
    regionID: int = Field(alias='regionID')
    regionX: int = Field(alias='regionX')
    regionY: int = Field(alias='regionY')

class Camera(BaseModel):
    yaw: int
    pitch: int
    x: int
    y: int
    z: int
    x2: int
    y2: int
    z2: int

class Mouse(BaseModel):
    x: int
    y: int

class GameEvent(BaseModel):
    animation: int
    animation_pose: int = Field(alias='animation pose')
    latest_msg: str = Field(alias='latest msg')
    run_energy: int = Field(alias='run energy')
    game_tick: int = Field(alias='game tick')
    health: str
    interacting_code: Union[str, None] = Field(alias='interacting code')
    npc_name: Union[str, None] = Field(alias='npc name')
    npc_health: int = Field(alias='npc health', default=0)
    MAX_DISTANCE: int = Field(alias='MAX_DISTANCE')
    worldPoint: WorldPoint = Field(alias='worldPoint')
    camera: Camera
    mouse: Mouse

# Model for /inv endpoint
class InventoryItem(BaseModel):
    id: int
    quantity: int

class GameInventory(BaseModel):
    items: List[InventoryItem]