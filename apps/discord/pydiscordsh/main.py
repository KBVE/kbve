
from typing import List
from fastapi import FastAPI, WebSocket, HTTPException, APIRouter, Depends, APIRouter
from pydiscordsh import Routes, CORS, TursoDatabase, SetupSchema, Hero, DiscordServerManager, Health, SchemaEngine, DiscordServer, DiscordRouter, DiscordTagManager
from pydiscordsh.api.schema import DiscordTags
from pydiscordsh.apps.tags import TagStatus
from pydiscordsh.routes import lifespan, get_database, get_tag_manager, tags_router, users_router, misc_router, discord_router

import logging
logger = logging.getLogger("uvicorn")

## App

app = FastAPI(lifespan=lifespan)
app.include_router(tags_router)
app.include_router(users_router)
app.include_router(misc_router)
app.include_router(discord_router)
routes = Routes(app, templates_dir="templates")

CORS(app)
