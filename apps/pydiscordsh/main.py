
from typing import List
from fastapi import FastAPI, WebSocket, HTTPException, APIRouter, Depends, APIRouter
from pydiscordsh import Routes, CORS, TursoDatabase, SetupSchema, Hero, DiscordServerManager, Health, SchemaEngine, DiscordServer, DiscordRouter, DiscordTagManager
from contextlib import asynccontextmanager
from pydiscordsh.api.schema import DiscordTags
from pydiscordsh.apps.tags import TagStatus

import logging
logger = logging.getLogger("uvicorn")

schema_engine = SchemaEngine()
db = TursoDatabase(schema_engine)

def get_tag_manager():
    return DiscordTagManager(db)

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("[DB]@PENDING")
    await db.start_client()
    yield
    logger.info("[DB]@DISINT")
    await db.stop_client()
    logger.info("[DB]@STOPPING")


## Tags
tags_router = APIRouter(prefix="/v1/tags", tags=["tags"])

@tags_router.get("/tags_by_status", response_model=List[DiscordTags])
async def get_tags_by_status(status: TagStatus, tag_manager: DiscordTagManager = Depends(get_tag_manager)):
    """Fetch tags with a specific status.
            PENDING = 1
            APPROVED = 2      
            NSFW = 4          
            MODERATION = 8   
            BLOCKED = 16
    """
    return await tag_manager.get_tags_by_status(status)

@tags_router.post("/add_tag", response_model=DiscordTags)
async def add_tag(name: str, tag_manager: DiscordTagManager = Depends(get_tag_manager)):
    """Add a new tag."""
    return await tag_manager.add_tag(name)

@tags_router.put("/add_tag_status", response_model=dict)
async def add_tag_status(name: str, status: TagStatus, tag_manager: DiscordTagManager = Depends(get_tag_manager)):
    """Add a status to an existing tag using bitwise operations."""
    return await tag_manager.update_tag_status([DiscordTags(name=name, status=status)], add=True)

@tags_router.put("/remove_tag_status", response_model=dict)
async def remove_tag_status(name: str, status: TagStatus, tag_manager: DiscordTagManager = Depends(get_tag_manager)):
    """Remove a status from an existing tag using bitwise operations."""
    return await tag_manager.update_tag_status([DiscordTags(name=name, status=status)], add=False)

@tags_router.get("/status/join/{statuses:path}", response_model=List[DiscordTags])
async def get_tags_by_status_and(statuses: str, tag_manager: DiscordTagManager = Depends(get_tag_manager)):
    """
    Fetch tags where all specified statuses are present using bitwise AND.
    Example: /status/join/nsfw/approved/blocked/
    """
    try:
        # Convert the string list into a combined bitmask using AND
        status_list = [TagStatus[status.upper()] for status in statuses.split("/")]
        combined_status = sum(status_list)  # Bitwise AND approach (all must be present)
        return await tag_manager.get_tags_by_status(combined_status)
    except KeyError as e:
        raise HTTPException(status_code=400, detail=f"Invalid status provided: {e}")
    except Exception as e:
        raise HTTPException(status_code=500, detail="An error occurred while processing the request.")

@tags_router.get("/status/or/{statuses:path}", response_model=List[DiscordTags])
async def get_tags_by_status_or(statuses: str, tag_manager: DiscordTagManager = Depends(get_tag_manager)):
    """
    Fetch tags where any of the specified statuses are present using bitwise OR.
    Example: /status/or/nsfw/approved/blocked/
    """
    try:
        # Convert the string list into a combined bitmask using OR
        status_list = [TagStatus[status.upper()] for status in statuses.split("/")]
        combined_status = 0
        for status in status_list:
            combined_status |= status  # Bitwise OR for any match
        return await tag_manager.get_tags_by_status(combined_status)
    except KeyError as e:
        raise HTTPException(status_code=400, detail=f"Invalid status provided: {e}")
    except Exception as e:
        raise HTTPException(status_code=500, detail="An error occurred while processing the request.")

## Debug


## App

app = FastAPI(lifespan=lifespan)
app.include_router(tags_router)
routes = Routes(app, templates_dir="templates")
CORS(app)

##

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
    
