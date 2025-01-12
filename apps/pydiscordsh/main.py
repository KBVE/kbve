
from typing import List
from fastapi import FastAPI, WebSocket, HTTPException, APIRouter, Depends, APIRouter
from pydiscordsh import Routes, CORS, TursoDatabase, SetupSchema, Hero, DiscordServerManager, Health, SchemaEngine, DiscordServer, DiscordRouter, DiscordTagManager
from pydiscordsh.api.schema import DiscordTags
from pydiscordsh.apps.tags import TagStatus
from pydiscordsh.routes import lifespan, get_database, get_tag_manager, tags_router, users_router

import logging
logger = logging.getLogger("uvicorn")

## App

app = FastAPI(lifespan=lifespan)
app.include_router(tags_router)
app.include_router(users_router)
routes = Routes(app, templates_dir="templates")
CORS(app)

##

@app.get("/v1/db/setup")
async def setup_database():
    try:
        setup_schema = SetupSchema(get_database().schema_engine)
        setup_schema.create_tables()
        get_database().sync()
        return {"status": 200, "message": "Database schema setup completed successfully."}
    except Exception as e:
        logger.error(f"Error setting up the database: {e}")
        return {"status": 500, "message": f"Error setting up the database: {e}"}

## 

routes.db_get("/v1/db/start_client", Health, get_database(), "start_client")
routes.db_get("/v1/db/stop_client", Health, get_database(), "stop_client")
routes.db_get("/v1/db/status_client", Health, get_database(), "status_client")

## TODO : Health Status

@app.get("/v1/health/supabase")
async def check_supabase():
    """Check the Supabase connection health"""
    return await Health(get_database()).check_supabase()


##

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
    
