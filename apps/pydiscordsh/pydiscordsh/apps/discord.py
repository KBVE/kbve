from sqlmodel import SQLModel, Session, select
from fastapi import HTTPException
import logging
from pydiscordsh.api.schema import DiscordServer
from pydiscordsh.apps.turso import TursoDatabase

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
                statement = select(DiscordServer).where(DiscordServer.server_id == server_id)
                server = session.exec(statement).first()
                
                if server:
                    logger.info(f"Server found: {server.server_id}")
                    return server
                else:
                    logger.warning(f"Server with ID {server_id} not found.")
                    raise HTTPException(status_code=404, detail=f"Server with ID {server_id} not found.")
        except Exception as e:
            logger.error(f"Error retrieving server: {e}")
            raise HTTPException(status_code=500, detail=f"Error retrieving server: {e}")
