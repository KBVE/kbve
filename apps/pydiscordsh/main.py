from fastapi import FastAPI, WebSocket
from pydiscordsh import Routes, CORS, TursoDatabase
from contextlib import asynccontextmanager

import logging

logger = logging.getLogger("uvicorn")


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("[DB]@PENDING")
    await database.start_client()
    yield
    logger.info("[DB]@DISINT")
    await database.stop_client()
    logger.info("[DB]@STOPPING")

app = FastAPI(lifespan=lifespan)
routes = Routes(app, templates_dir="templates")
CORS(app)

database = TursoDatabase()


@app.get("/v1/db/start_client")
async def start_client():
    return await database.start_client()

@app.get("/v1/db/stop_client")
async def stop_client():
    return await database.stop_client()

@app.get("/v1/db/status_client")
async def status_client():
    return await database.status_client()