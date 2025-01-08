from typing import Optional
import os
from sqlmodel import Field, Session, SQLModel, create_engine, select

class Hero(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(..., max_length=64)
    secret_name: str = Field(..., max_length=64)
    age: Optional[int] = Field(default=None, ge=0, le=10000)
    
class SetupSchema:
    def __init__(self):
        # Load the database URL and token from environment variables
        self.TURSO_DATABASE_URL = os.getenv("TURSO_DATABASE_URL")
        self.TURSO_AUTH_TOKEN = os.getenv("TURSO_AUTH_TOKEN")
        
        if not self.TURSO_DATABASE_URL or not self.TURSO_AUTH_TOKEN:
            raise ValueError("TURSO_DATABASE_URL or TURSO_AUTH_TOKEN is not set in environment variables.")
        
        # Prepare the database connection URL
        db_url = f"sqlite+{self.TURSO_DATABASE_URL}/?authToken={self.TURSO_AUTH_TOKEN}&secure=true"
        
        # Create the engine
        self.engine = create_engine(db_url, connect_args={'check_same_thread': False}, echo=True)

    def create_tables(self):
        """Create database tables based on the defined models."""
        SQLModel.metadata.create_all(self.engine)
        print("Database tables created successfully.")

    def get_session(self) -> Session:
        """Provide a new database session."""
        return Session(self.engine)

    def fetch_hero_by_name(self, hero_name: str):
        """Fetch a hero by name for demonstration purposes."""
        with self.get_session() as session:
            statement = select(Hero).where(Hero.name == hero_name)
            hero = session.exec(statement).first()
            if hero:
                print(f"Hero found: {hero.name}")
            else:
                print("Hero not found.")
            return hero