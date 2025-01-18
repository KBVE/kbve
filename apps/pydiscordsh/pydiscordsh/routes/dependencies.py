from typing import Optional
from pydiscordsh.api.schema import SetupSchema
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
    user_token = kilobase.issue_jwt(user_id="123456789012345678", role="user", expires_in=3600)

    logger.info(f"Generated Admin Token: {admin_token}")
    logger.info(f"Generated User Token: {user_token}")


    yield
    await db.stop_client()

def get_tag_manager() -> DiscordTagManager:
    return DiscordTagManager(kb)

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

def get_setup_schema():
    """Dependency to provide SetupSchema with the current database schema engine."""
    return SetupSchema(get_database().schema_engine)

def get_user_token(token: dict = Security(kb.verify_role_jwt(["admin", "user"]))):
    """Optional token check for admin or owner roles."""
    return token
