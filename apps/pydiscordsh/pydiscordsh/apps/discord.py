from sqlmodel import SQLModel, Session, select
from fastapi import HTTPException
from fastapi.responses import JSONResponse
from datetime import datetime, timedelta, timezone
import logging
from pydiscordsh.api.schema import DiscordServer, DiscordCategories
from pydiscordsh.apps.turso import TursoDatabase
# from pydiscordsh.routes.dependencies import get_tag_manager

logger = logging.getLogger("uvicorn")

class DiscordServerManager:
    def __init__(self, db: TursoDatabase):
        self.db = db
        
    async def add_server(self, data: dict):
        """Add a new Discord server."""
        try:
            server = DiscordServer(**data)
            with self.db.schema_engine.get_session() as session:
                session.add(server)
                session.commit()
                logger.info(f"Server added successfully with server_id: {server.server_id}")
            return {"status": 200, "message": "Discord server added successfully."}
        except Exception as e:
            logger.error(f"Error adding server: {e}")
            raise HTTPException(status_code=500, detail=f"Error adding server: {e}")
        
    async def get_server(self, server_id: int):
        """Retrieve a Discord server by server_id."""
        try:
            with self.db.schema_engine.get_session() as session:
                #statement = select(DiscordServer).where(DiscordServer.server_id == server_id)
                #server = session.exec(statement).first()
                
                server = session.get(DiscordServer, server_id)

                if server:
                    logger.info(f"Server found: {server.server_id}")
                    return server
                else:
                    logger.warning(f"Server with ID {server_id} not found.")
                    raise HTTPException(status_code=404, detail=f"Server with ID {server_id} not found.")
                
        except Exception as e:
            logger.error(f"Error retrieving server: {e}")
            raise HTTPException(status_code=500, detail=f"Error retrieving server: {e}")

    async def bump_server(self, server_id: int):
        """Bump the Discord server, ensuring it can only be bumped once per hour."""
        try:
            with self.db.schema_engine.get_session() as session:
                # server = session.exec(select(DiscordServer).where(DiscordServer.server_id == server_id)).first()
                server = session.get(DiscordServer, server_id)
                                
                if not server:
                    raise HTTPException(status_code=404, detail="Server not found.")
                
                if server.bump_at:
                    last_bumped = datetime.fromtimestamp(server.bump_at, tz=timezone.utc)
                    if datetime.now(tz=timezone.utc) - last_bumped < timedelta(hours=1):
                        raise HTTPException(status_code=400, detail="Server can only be bumped once every hour.")
                
                server.bumps += 1
                server.bump_at = int(datetime.now(tz=timezone.utc).timestamp())  # Current timestamp in UNIX format
                
                session.commit()
                logger.info(f"Server with server_id: {server_id} bumped successfully.")
            
            return {"status": 200, "message": "Server bumped successfully."}
        
        except Exception as e:
            logger.error(f"Error bumping server: {e}")
            raise HTTPException(status_code=500, detail=f"Error bumping server: {e}")

    ## TODO: Make it admin only.
    async def reset_bump(self, server_id: int):
        """Reset the bump for the specified Discord server to 5 hours ago."""
        try:
            five_hours_ago = datetime.now(tz=timezone.utc) - timedelta(hours=5)

            with self.db.schema_engine.get_session() as session:
                server = session.get(DiscordServer, server_id)
                
                if not server:
                    raise HTTPException(status_code=404, detail="Server not found.")
                
                server.bump_at = int(five_hours_ago.timestamp())
                
                session.commit()
                logger.info(f"Bump for server {server_id} reset to {five_hours_ago}.")
            
            return {"status": 200, "message": f"Bump for server {server_id} reset to {five_hours_ago}."}
        
        except Exception as e:
            logger.error(f"Error resetting bump for server {server_id}: {e}")
            raise HTTPException(status_code=500, detail=f"Error resetting bump: {e}")

    ## TODO: Add Permissions, making sure the owner / mod => are on the list    
    async def update_server(self, data: dict, admin=False) -> dict:
        """Update a new Discord server."""
        try:
            server_id = data.get("server_id")
            if not server_id:
                raise HTTPException(status_code=400, detail="server_id is required for updating.")

            with self.db.schema_engine.get_session() as session:
                og_server = session.get(DiscordServer, server_id)

                if not og_server:
                    raise HTTPException(status_code=404, detail="Server not found.")
                    
                allowed_fields = ["lang", "public", "invite", "nsfw", "summary", "description", "website", "video", "categories", "tags"]
                updated = False

                # If admin, bypass the allowed_fields and check all fields in data
                if admin:
                    for field, value in data.items():
                        if hasattr(og_server, field) and getattr(og_server, field) != value:
                            setattr(og_server, field, value)
                            updated = True
                else:
                    # If not admin, use allowed_fields restriction
                    for field in allowed_fields:
                        if field in data and getattr(og_server, field) != data[field]:
                            setattr(og_server, field, data[field])
                            updated = True

                if updated:
                    session.commit()
                    logger.info(f"Server updated successfully with server_id: {og_server.server_id}")
                    return {"status": 200, "message": "Discord server updated successfully."}
                else:
                    logger.info(f"No changes detected for server_id: {server_id}")
                    return {"status": 200, "message": "No changes were made."}
        except Exception as e:
            logger.error(f"Error adding server: {e}")
            raise HTTPException(status_code=500, detail=f"Error updating server: {e}")

class DiscordRouter:
    def get_server_categories():
            """Retrieve all active server categories with their index and name as JSON."""
            try:
                active_categories = DiscordCategories.get_all_active_categories()
                return JSONResponse(content=active_categories)
            except Exception as e:
                logger.error(f"Error retrieving server categories: {e}")
                raise HTTPException(status_code=500, detail="Failed to retrieve server categories.")