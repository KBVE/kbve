from fastapi import FastAPI, WebSocket
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, Response
from fudster import Routes, CORS, RuneLiteClient, WS
from contextlib import asynccontextmanager
import os
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

# Mount static files directory for assets
app.mount("/assets", StaticFiles(directory="assets"), name="assets")

CORS(app)


# Worker file routes - serve local worker files
@app.get("/assets/canvas-worker.js")
async def serve_canvas_worker():
    worker_path = "assets/canvas-worker.js"
    if os.path.exists(worker_path):
        return FileResponse(worker_path, media_type="application/javascript")
    else:
        return Response(content="// Worker file not found", media_type="application/javascript", status_code=404)


@app.get("/assets/db-worker.js")
async def serve_db_worker():
    worker_path = "assets/db-worker.js"
    if os.path.exists(worker_path):
        return FileResponse(worker_path, media_type="application/javascript")
    else:
        return Response(content="// Worker file not found", media_type="application/javascript", status_code=404)


@app.get("/assets/ws-worker.js")
async def serve_ws_worker():
    worker_path = "assets/ws-worker.js"
    if os.path.exists(worker_path):
        return FileResponse(worker_path, media_type="application/javascript")
    else:
        return Response(content="// Worker file not found", media_type="application/javascript", status_code=404)


@app.websocket("/ws")
async def websocket_handshake(websocket: WebSocket):
    await ws_handler.handle_websocket(websocket)


routes.render("/ws/", "home.html")
routes.get("/ws/start-runelite", RuneLiteClient, "start_runelite_async")
routes.get("/ws/stop-runelite", RuneLiteClient, "stop_runelite_async")
routes.get("/ws/status", RuneLiteClient, "status_runelite")
