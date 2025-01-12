from sqlmodel import SQLModel, Field
from typing import Optional, Any
from datetime import datetime
from uuid import UUID

class UserProfiles(SQLModel):
    id: UUID = Field(primary_key=True)
    updated_at: Optional[datetime] = None
    username: Optional[str] = None


class UserCards(SQLModel):
    id: UUID = Field(primary_key=True)
    bio: Optional[str] = None
    socials: Optional[Any] = None  # Assuming any JSON-serializable structure
    style: Optional[Any] = None    # Assuming any JSON-serializable structure
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class UserCardsPublic(SQLModel):
    username: Optional[str] = None
    bio: Optional[str] = None
    socials: Optional[Any] = None
    style: Optional[Any] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
