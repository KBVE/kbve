
from typing import List
from fastapi import FastAPI, WebSocket, HTTPException, APIRouter, Depends, APIRouter
from pydiscordsh import Routes, CORS, TursoDatabase, SetupSchema, Hero, DiscordServerManager, Health, SchemaEngine, DiscordServer, DiscordRouter, DiscordTagManager
from pydiscordsh.api.schema import DiscordTags
from pydiscordsh.apps.tags import TagStatus
from pydiscordsh.routes import lifespan, get_database, get_tag_manager, tags_router, users_router, misc_router

import logging
logger = logging.getLogger("uvicorn")

## App

app = FastAPI(lifespan=lifespan)
app.include_router(tags_router)
app.include_router(users_router)
app.include_router(misc_router)
routes = Routes(app, templates_dir="templates")
CORS(app)

routes.db_post("/v1/discord/add_server", DiscordServerManager, get_database(), "add_server")
routes.db_post("/v1/discord/update_server", DiscordServerManager, get_database(), "update_server")

#TODO: make route admin only
@app.post("/v1/admin/discord/update_server")
async def update_server_admin(data: dict):
    try:
        manager = DiscordServerManager(get_database())
        response = await manager.update_server(data, admin=True)
        return response
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error updating server: {str(e)}")

@app.get("/v1/discord/get_categories")
async def get_categories():
    try:
        categories = DiscordRouter.get_server_categories()
        return categories
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/v1/discord/get_server/{server_id}")
async def get_server(server_id: int):
    try:
        manager = DiscordServerManager(get_database())
        result = await manager.get_server(server_id)
        return result if isinstance(result, DiscordServer) else {"data": str(result)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/v1/discord/bump_server/{server_id}")
async def bump_server(server_id: int):
    try:
        manager = DiscordServerManager(get_database())
        result = await manager.bump_server(server_id)
        return result
    except HTTPException as http_ex:
        raise http_ex 
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

##

@app.get("/v1/discord/reset_bump/{server_id}")
async def reset_bump(server_id: int):
    try:
        manager = DiscordServerManager(get_database())
        result = await manager.reset_bump(server_id)
        return result
    except HTTPException as http_ex:
        raise http_ex 
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    
