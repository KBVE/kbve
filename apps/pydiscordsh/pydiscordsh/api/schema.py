from typing import Optional, List, Tuple
import os, re, html
from sqlmodel import Field, Session, SQLModel, create_engine, select, JSON, Column
from pydantic import field_validator, model_validator
import logging
from pydiscordsh.models.basemodels import SanitizedBaseModel
from pydiscordsh.models.category import DiscordCategories
from pydiscordsh.api.utils import Utils

logger = logging.getLogger("uvicorn")


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
    website: Optional[str] = Field(default=None, max_length=255)
    logo: str = Field(..., max_length=255)
    banner: Optional[str] = Field(default=None, max_length=255)
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
    
    @field_validator("website", "logo", "banner", "url")
    def validate_common_urls(cls, value):
        try:
            return Utils.validate_url(value)
        except ValueError as e:
                # Log the error and raise a more specific error message
                logger.error(f"URL validation failed for value: '{value}'")
                raise ValueError(f"Invalid URL format for field '{cls.__name__}'. Please provide a valid URL.") from e
        return value
    
    @field_validator("lang")
    def validate_lang(cls, value):
        if value:
            if len(value) > 2:
                raise ValueError("Language list cannot have more than two languages.")
            valid_languages = {"en", "es", "zh", "hi", "fr", "ar", "de", "ja", "ru", "pt", "it", "ko", "tr", "vi", "pl"}
            for lang in value:
                if lang not in valid_languages:
                    raise ValueError(f"Invalid language code: {lang}. Must be one of {', '.join(valid_languages)}.")
        return value

    @field_validator("invite")
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

    @field_validator("categories")
    def validate_categories(cls, value):
            if not isinstance(value, list):
                raise ValueError("Categories must be a list.")
            try:
                value = [int(item) for item in value]
            except ValueError:
                raise ValueError("Categories must be a list of integers or strings representing integers.")
            if not (1 <= len(value) <= 2):
                raise ValueError("Categories list must have 1 or 2 items.")
            for category_index in value:
                if not DiscordCategories.is_valid_category(category_index):
                    raise ValueError(f"Invalid category index: {category_index}.")
            return value
    
    @field_validator("video")
    def validate_video(cls, value):
        youtube_url_pattern = r"(https?://(?:www\.)?(?:youtube\.com/(?:[^/]+/)*[^/]+(?:\?v=|\/)([a-zA-Z0-9_-]{1,50}))|youtu\.be/([a-zA-Z0-9_-]{1,50}))"
        if value:
            match = re.match(youtube_url_pattern, value)
            if match:
                return match.group(2) if match.group(2) else match.group(3)
            if len(value) < 50 and re.match(r"^[a-zA-Z0-9_-]{1,50}$", value):
                return value
        raise ValueError("Invalid YouTube video ID or URL.")

class DiscordTags(SQLModel, table=True):
    name: str = Field(primary_key=True)  # Name as primary key
    approved: Optional[bool] = Field(default=False)  # Optional approval flag (default: False)
    nsfw: Optional[bool] = Field(default=False)  # Optional NSFW flag (default: False)
    moderation: bool = Field(default=True)
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
        self.engine = create_engine(db_url, connect_args={'check_same_thread': False}, pool_pre_ping=True, echo=True)

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