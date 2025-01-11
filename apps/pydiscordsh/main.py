from fastapi import FastAPI, WebSocket, HTTPException
from pydiscordsh import Routes, CORS, TursoDatabase, SetupSchema, Hero, DiscordServerManager, Health, SchemaEngine, DiscordServer, DiscordRouter
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
routes.db_post("/v1/discord/update_server", DiscordServerManager, db, "update_server")

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