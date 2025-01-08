from fastapi import FastAPI, WebSocket
from pydiscordsh import Routes, CORS, TursoDatabase, SetupSchema, Hero, DiscordServerManager, Health, SchemaEngine
from contextlib import asynccontextmanager

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

##

routes.db_post("/v1/discord/add_server", DiscordServerManager, db, "add_server")
routes.db_get("/v1/discord/get_server/{server_id}", DiscordServerManager, db, "get_server")

# @app.post("/v1/discord/add_server")
# async def discord_add_server():
#     return await discord.add_server()

