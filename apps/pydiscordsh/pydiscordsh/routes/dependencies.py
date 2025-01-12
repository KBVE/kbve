from pydiscordsh.apps.turso import TursoDatabase
from fastapi import FastAPI, Security
from contextlib import asynccontextmanager
from pydiscordsh import DiscordTagManager, SchemaEngine, Kilobase, UserManager
import logging
logger = logging.getLogger("uvicorn")

schema_engine = SchemaEngine()
db = TursoDatabase(schema_engine)
kb = Kilobase()

@asynccontextmanager
async def lifespan(app: FastAPI):
    await db.start_client()
    kilobase = get_kilobase()
    admin_token = kilobase.issue_jwt(user_id="admin_user", role="admin", expires_in=3600)
    logger.info(f"Generated Admin Token: {admin_token}")

    yield
    await db.stop_client()

def get_tag_manager() -> DiscordTagManager:
    return DiscordTagManager(db)

def get_database() -> TursoDatabase:
    """Return the database instance directly."""
    return db

def get_kilobase() -> Kilobase:
    """Return the Kilobase instance for dependency injection."""
    return kb

def get_admin_token(token: dict = Security(kb.verify_role_jwt("admin"))):
    """Ensure the provided token has admin access."""
    return token

def get_moderator_token(token: dict = Security(kb.verify_role_jwt("moderator"))):
    """Ensure the provided token has moderator access."""
    return token

def get_user_manager() -> UserManager:
    return UserManager(kb)