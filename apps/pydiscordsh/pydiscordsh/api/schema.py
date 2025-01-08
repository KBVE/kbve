from typing import Optional, List
import os
from sqlmodel import Field, Session, SQLModel, create_engine, select, JSON, Column

class Hero(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(..., max_length=64)
    secret_name: str = Field(..., max_length=64)
    age: Optional[int] = Field(default=None, ge=0, le=10000)

class DiscordServer(SQLModel, table=True):
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

    class Config:
        arbitrary_types_allowed = True

# class BumpVote(SQLModel, table=False)


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
        