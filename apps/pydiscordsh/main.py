from fastapi import FastAPI, WebSocket, HTTPException
from pydiscordsh import Routes, CORS, TursoDatabase, SetupSchema, Hero, DiscordServerManager, Health, SchemaEngine, DiscordServer, DiscordRouter
from contextlib import asynccontextmanager
from pydiscordsh.apps import DiscordTagManager
from typing import List, Dict, Optional

import logging

logger = logging.getLogger("uvicorn")


schema_engine = SchemaEngine()
db = TursoDatabase(schema_engine)

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("[DB]@PENDING")
    await db.start_client()
    yield
    logger.info("[DB]@DISINT")
    await db.stop_client()
    logger.info("[DB]@STOPPING")

app = FastAPI(lifespan=lifespan)
routes = Routes(app, templates_dir="templates")
CORS(app)


## Debug

@app.get("/v1/db/setup")
async def setup_database():
    try:
        setup_schema = SetupSchema(schema_engine)
        setup_schema.create_tables()
        db.sync()
        return {"status": 200, "message": "Database schema setup completed successfully."}
    except Exception as e:
        logger.error(f"Error setting up the database: {e}")
        return {"status": 500, "message": f"Error setting up the database: {e}"}

## 

routes.db_get("/v1/db/start_client", Health, db, "start_client")
routes.db_get("/v1/db/stop_client", Health, db, "stop_client")
routes.db_get("/v1/db/status_client", Health, db, "status_client")

## TODO : Health Status

@app.get("/v1/health/supabase")
async def check_supabase():
    """Check the Supabase connection health"""
    return await Health(db).check_supabase()


##

routes.db_post("/v1/discord/add_server", DiscordServerManager, db, "add_server")
routes.db_post("/v1/discord/update_server", DiscordServerManager, db, "update_server")

#TODO: make route admin only
@app.post("/v1/admin/discord/update_server")
async def update_server_admin(data: dict):
    try:
        manager = DiscordServerManager(db)
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
        manager = DiscordServerManager(db)
        result = await manager.get_server(server_id)
        return result if isinstance(result, DiscordServer) else {"data": str(result)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/v1/discord/bump_server/{server_id}")
async def bump_server(server_id: int):
    try:
        manager = DiscordServerManager(db)
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
        manager = DiscordServerManager(db)
        result = await manager.reset_bump(server_id)
        return result
    except HTTPException as http_ex:
        raise http_ex 
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    
@app.post("/v1/discord/tags/add")
async def add_or_get_tag(data: dict):
    try:
        manager = DiscordTagManager(db)
        tag_name = data.get("tag_name")
        approved = data.get("approved")
        nsfw = data.get("nsfw", False)
        response = await manager.add_or_get_tag(tag_name)
        return response
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error adding or updating tag: {str(e)}")

@app.get("/v1/discord/tags/get/{tag_name}")
async def get_tag(tag_name: str):
    try:
        manager = DiscordTagManager(db)
        tag = await manager.get_tag(tag_name)
        return tag
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error retrieving tag: {str(e)}")

# Update Tag Status (Admin Only)
@app.post("/v1/admin/discord/tags/update")
async def update_tag_status(tag_data: List[Dict[str, Optional[bool]]]):
    try:
        manager = DiscordTagManager(db)
        result = await manager.update_tag_status(tag_data)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Get Tag (Public)
@app.get("/v1/discord/tags/{tag_name}/get")
async def get_tag(tag_name: str):
    try:
        manager = DiscordTagManager(db)
        result = await manager.get_tag(tag_name)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Get All Active Tags (Public)
@app.get("/v1/discord/tags/active")
async def get_all_active_tags():
    try:
        manager = DiscordTagManager(db)
        result = await manager.get_all_active_tags()
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Get Pending Tags (Admin Only)
@app.get("/v1/admin/discord/tags/pending")
async def get_pending_tags():
    try:
        manager = DiscordTagManager(db)
        result = await manager.get_pending_tags()
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))