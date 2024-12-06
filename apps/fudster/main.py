from fastapi import FastAPI, WebSocket
from fudster import Routes, CORS, RuneLiteClient, WS
from contextlib import asynccontextmanager

import logging

logger = logging.getLogger("uvicorn")

ws_handler = WS(max_message_history=100)

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("[BROADCAST]@PENDING")
    await ws_handler.connect()
    yield
    logger.info("[BROADCAST]@DISINT")
    await ws_handler.disconnect()
    logger.info("[BROADCAST]@STOPPING")


app = FastAPI(lifespan=lifespan)
routes = Routes(app, templates_dir="templates")

CORS(app)

@app.websocket("/ws")
async def websocket_handshake(websocket: WebSocket):
    await ws_handler.handle_websocket(websocket)

routes.render("/ws/", "home.html")
routes.get("/ws/start-runelite", RuneLiteClient, "start_runelite_async")
routes.get("/ws/stop-runelite", RuneLiteClient, "stop_runelite_async")
routes.get("/ws/status", RuneLiteClient, "status_runelite")