from typing import List, Optional
from fastapi import HTTPException, APIRouter, Depends, Security
from pydiscordsh.routes import get_tag_manager, get_kilobase, get_admin_token, get_moderator_token, get_database, get_setup_schema, get_user_token
from pydiscordsh.api import Health, SetupSchema
from pydiscordsh.apps import DiscordServerManager
from pydiscordsh.api.schema import DiscordServer
import logging
logger = logging.getLogger("uvicorn")

discord_router = APIRouter(prefix="/v1/discord", tags=["Discord"])

# Add server route using a database dependency
@discord_router.post("/add_server", response_model=DiscordServer)
async def add_server(data: dict, db=Depends(get_database)):
    try:
        manager = DiscordServerManager(db)
        response = await manager.add_server(data)
        if not isinstance(response, DiscordServer):
            raise ValueError("Invalid response type from manager")
        return response
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error adding server: {str(e)}")

# Update server route -> token: dict = Depends(get_admin_token) || token: dict = Depends(get_user_token)
@discord_router.post("/update_server", response_model=dict)
async def update_server(data: dict, db=Depends(get_database), tag_manager=Depends(get_tag_manager), token: dict = Depends(get_user_token)):
    try:

        if token is None or 'role' not in token:
            raise HTTPException(status_code=403, detail="Invalid token or missing role")
        
        admin = token["role"] == "admin"

        manager = DiscordServerManager(db)
        response = await manager.update_server(data, tag_manager, admin=admin)
        if not isinstance(response, dict):
            raise ValueError("Invalid response type from manager")
        return response
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error updating server: {str(e)}")

# Get categories route
@discord_router.get("/get_categories")
async def get_categories():
    try:
        categories = DiscordServerManager.get_server_categories()
        return categories
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Get server by ID route
@discord_router.get("/get_server/{server_id}", response_model=DiscordServer)
async def get_server(server_id: int, db=Depends(get_database)):
    try:
        manager = DiscordServerManager(db)
        result = await manager.get_server(server_id)
        if not isinstance(result, DiscordServer):
            raise ValueError("Invalid response type from manager")
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Bump server route 
# TODO: Have it Return BumpServer Model
@discord_router.get("/bump_server/{server_id}", response_model=DiscordServer)
async def bump_server(server_id: int, db=Depends(get_database)):
    try:
        manager = DiscordServerManager(db)
        result = await manager.bump_server(server_id)
        if not isinstance(result, DiscordServer):
            raise ValueError("Invalid response type from manager")
        return result
    except HTTPException as http_ex:
        raise http_ex
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Reset bump route
@discord_router.get("/reset_bump/{server_id}", response_model=DiscordServer)
async def reset_bump(server_id: int, db=Depends(get_database), token: dict = Depends(get_admin_token)):
    try:
        manager = DiscordServerManager(db)
        result = await manager.reset_bump(server_id)
        if not isinstance(result, DiscordServer):
            raise ValueError("Invalid response type from manager")
        return result
    except HTTPException as http_ex:
        raise http_ex
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
