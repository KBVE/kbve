from typing import Optional, List
import os, re
from sqlmodel import Field, Session, SQLModel, create_engine, select, JSON, Column
from pydantic import validator, root_validator
import logging

logger = logging.getLogger("uvicorn")

import logging
import re
from typing import Optional
from sqlmodel import SQLModel, Field
from pydantic import root_validator

class SanitizedBaseModel(SQLModel):
    class Config:
        arbitrary_types_allowed = True
        validate_assignment = True

    @staticmethod
    def _sanitize_string(value: str, user_id: Optional[str] = None, server_id: Optional[int] = None) -> str:
        sanitized = re.sub(r'[^a-zA-Z0-9\s.,;:!?-_://?=]', '', value)
        sanitized = re.sub(r'<.*?>', '', sanitized)
        if sanitized != value:
            logging.error(f"Sanitization failed for value: '{value}'. Sanitized version: '{sanitized}'. Potential harmful content detected."
                          f" User ID: {user_id}, Server ID: {server_id}")
            raise ValueError("Invalid content in input: Contains potentially harmful characters.")
        return sanitized

    @root_validator(pre=True)
    def sanitize_all_fields(cls, values):
        user_id = values.get('user_id', None) #TODO: Pass user ID into this somwhow once we get users done
        server_id = values.get('server_id', None)

        for field, value in values.items():
            if isinstance(value, str):
                try:
                    sanitized_value = cls._sanitize_string(value, user_id, server_id)
                    values[field] = sanitized_value
                except ValueError as e:
                    logging.error(f"Failed to sanitize field '{field}' with value '{value}': {str(e)}"
                                  f" User ID: {user_id}, Server ID: {server_id}")
                    raise e
        return values



class Hero(SanitizedBaseModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(..., max_length=64)
    secret_name: str = Field(..., max_length=64)
    age: Optional[int] = Field(default=None, ge=0, le=10000)

# class User(SanitizedBaseModel, table=True):
#     user_id: int = Field(primary_key=True)

class DiscordServer(SanitizedBaseModel, table=True):
    server_id: int = Field(primary_key=True)  # Pre-existing unique server ID
    owner_id: str = Field(nullable=False, max_length=50)
    lang: Optional[List[str]] = Field(default=None, sa_column=Column(JSON))
    public: Optional[bool] = Field(default=False)
    invite: str = Field(..., max_length=100)
    nsfw: Optional[bool] = Field(default=False)
    name: str = Field(..., max_length=100)
    summary: str = Field(..., max_length=255)
    description: Optional[str] = Field(default=None, max_length=1024)
    website: str = Field(..., max_length=100)
    logo: str = Field(..., max_length=255)
    banner: str = Field(..., max_length=255)
    video: str = Field(..., max_length=255)
    bumps: int = Field(default=0, ge=0)  # Bumps or votes
    bump_at: Optional[int] = Field(default=None, nullable=True)  # UNIX timestamp for bump date
    categories: Optional[List[str]] = Field(default=None, sa_column=Column(JSON))  # List of categories
    tags: Optional[List[str]] = Field(default=None, sa_column=Column(JSON))  # List of tags
    vip: Optional[bool] = Field(default=False)  # VIP status
    url: Optional[str] = Field(default=None, max_length=255)
    invoice: Optional[str] = Field(default=None, max_length=255)  # Invoice field as a string
    invoice_at: Optional[int] = Field(default=None, nullable=True)  # UNIX timestamp for the invoice date
    created_at: Optional[int] = Field(default=None, nullable=False)  # UNIX timestamp for creation date
    updated_at: Optional[int] = Field(default=None, nullable=True)  # UNIX timestamp for update date
    
    @validator("invite", pre=True, always=True)
    def validate_invite(cls, value):
        if not value or not isinstance(value, str):
            raise ValueError("Invite must be a valid string.")
        discord_invite_pattern = (r"^(?:https?://(?:www\.)?discord(?:\.com)?/invite/|https?://discord\.gg/)([a-zA-Z0-9_-]+)$")
        match = re.match(discord_invite_pattern, value)
        if match:
            return match.group(1)
        plain_code_pattern = r"^[a-zA-Z0-9_-]{1,100}$"
        if re.match(plain_code_pattern, value):
            return value
        raise ValueError(f"Invalid invite link or invite code. Got: {value}")

    @validator("website", pre=True, always=True)
    def validate_website(cls, value):
        if not value:
            raise ValueError("Website must be a valid URL.")
        value = value.strip()
        if not value.startswith(("http://", "https://")):
            value = "http://" + value
        website_pattern = r"^(https?://(?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,})(?:/[^\s]*)?$"
        if not re.match(website_pattern, value):
            raise ValueError(f"Invalid website URL: {value}")
        return value


    @validator("categories", pre=True, always=True)
    def validate_categories(cls, value):
        if value and len(value) > 2:
            raise ValueError("Categories list cannot have more than 2 items.")
        return value
    
    @validator("video", pre=True, always=True)
    def validate_video(cls, value):
        youtube_url_pattern = r"(https?://(?:www\.)?(?:youtube\.com/(?:[^/]+/)*[^/]+(?:\?v=|\/)([a-zA-Z0-9_-]{1,50}))|youtu\.be/([a-zA-Z0-9_-]{1,50}))"
        if value:
            match = re.match(youtube_url_pattern, value)
            if match:
                return match.group(2) if match.group(2) else match.group(3)
            if len(value) < 50 and re.match(r"^[a-zA-Z0-9_-]{1,50}$", value):
                return value
        raise ValueError("Invalid YouTube video ID or URL.")

# class BumpVote(SanitizedBaseModel, table=False)


class SchemaEngine:
    def __init__(self):
        """Initialize the database connection."""
        self.TURSO_DATABASE_URL = os.getenv("TURSO_DATABASE_URL")
        self.TURSO_AUTH_TOKEN = os.getenv("TURSO_AUTH_TOKEN")
        
        if not self.TURSO_DATABASE_URL or not self.TURSO_AUTH_TOKEN:
            raise ValueError("TURSO_DATABASE_URL or TURSO_AUTH_TOKEN is not set in environment variables.")
        
        # Prepare the database connection URL
        db_url = f"sqlite+{self.TURSO_DATABASE_URL}/?authToken={self.TURSO_AUTH_TOKEN}&secure=true"
        
        # Create the engine
        self.engine = create_engine(db_url, connect_args={'check_same_thread': False}, echo=True)

    def get_session(self) -> Session:
        """Provide the database session."""
        return Session(self.engine)

    
class SetupSchema:
    def __init__(self, schema_engine: SchemaEngine):
        self.schema_engine = schema_engine

    def create_tables(self):
        """Create database tables based on the defined models."""
        SQLModel.metadata.create_all(self.schema_engine.engine)
        print("Database tables created successfully.")

    def fetch_hero_by_name(self, hero_name: str):
        """Fetch a hero by name for demonstration purposes."""
        with self.schema_engine.get_session() as session:
            statement = select(Hero).where(Hero.name == hero_name)
            hero = session.exec(statement).first()
            if hero:
                print(f"Hero found: {hero.name}")
            else:
                print("Hero not found.")
            return hero
        