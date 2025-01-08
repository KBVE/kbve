from sqlmodel import SQLModel, Session
from fastapi import HTTPException

from pydiscordsh.api.schema import DiscordServer
from pydiscordsh.apps.turso import TursoDatabase

class DiscordServerManager:
    def __init__(self, db: TursoDatabase):
        self.db = db

    async def add_server(self, data: dict):
        """Add a new Discord server."""
        try:
            server = DiscordServer(**data)
            cursor = self.db.get_cursor()
            cursor.execute(
                """
                INSERT INTO discordserver (
                    server_id, owner_id, name, description, bumps, categories, tags, vip, url, invoice, invoice_at, created_at, updated_at, bump_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    server.server_id,
                    server.owner_id,
                    server.name,
                    server.description,
                    server.bumps,
                    str(server.categories),
                    str(server.tags),
                    server.vip,
                    server.url,
                    server.invoice,
                    server.invoice_at,
                    server.created_at,
                    server.updated_at,
                    server.bump_at
                )
            )
            self.db.conn.commit()
            return {"status": 200, "message": "Discord server added successfully."}
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Error adding server: {e}")