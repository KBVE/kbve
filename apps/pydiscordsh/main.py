from fastapi import FastAPI, WebSocket
from pydiscordsh import Routes, CORS, TursoDatabase, SetupSchema, Hero, DiscordServer, Health
from contextlib import asynccontextmanager

import logging

logger = logging.getLogger("uvicorn")


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

db = TursoDatabase()

## Debug

@app.get("/v1/db/setup")
async def setup_database():
    try:
        schema_setup = SetupSchema()
        schema_setup.create_tables()
        db.sync()
        return {"status": 200, "message": "Database schema setup completed successfully."}
    except Exception as e:
        logger.error(f"Error setting up the database: {e}")
        return {"status": 500, "message": f"Error setting up the database: {e}"}

## 

routes.db_get("/v1/db/start_client", Health, db, "start_client")
routes.db_get("/v1/db/stop_client", Health, db, "stop_client")
routes.db_get("/v1/db/status_client", Health, db, "status_client")

##

# @app.post("/v1/discord/add_server")
# async def discord_add_server():
#     return await discord.add_server()

