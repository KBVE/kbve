from fastapi import FastAPI, WebSocket
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, Response
from fudster import (
    Routes, CORS, WS, RuneLiteClient,
    CoinDeskClient, PoetryDBClient, WebsocketEchoClient,
    RSSUtility,
)
from kbve import AppServer, ServerConfig
from contextlib import asynccontextmanager
import os
import logging

# Desktop automation clients (conditional imports)
try:
    from fudster import ScreenClient, ChromeClient, DiscordClient
except ImportError:
    ScreenClient = None
    ChromeClient = None
    DiscordClient = None

logger = logging.getLogger("uvicorn")

os.environ['DISPLAY'] = ':1'

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


# --- WebSocket routes (/ws/) ---

@app.websocket("/ws")
async def websocket_handshake(websocket: WebSocket):
    await ws_handler.handle_websocket(websocket)


routes.render("/ws/", "home.html")
routes.get("/ws/start-runelite", RuneLiteClient, "start_runelite_async")
routes.get("/ws/stop-runelite", RuneLiteClient, "stop_runelite_async")
routes.get("/ws/status", RuneLiteClient, "status_runelite")


# --- RESTful API routes (/api/) ---

routes.get("/api/bitcoin-price", CoinDeskClient, "get_current_bitcoin_price")
routes.get("/api/poem", PoetryDBClient, "get_random_poem")
routes.get("/api/config-runelite", RuneLiteClient, "start_and_configure_runelite")


@app.get("/api/echo")
async def echo_main():
    websocket_client = WebsocketEchoClient()
    try:
        await websocket_client.example()
    finally:
        await websocket_client.close()
        return {"ws": "true"}


@app.get("/api/news")
async def google_news():
    rss_utility = RSSUtility(base_url="https://news.google.com/rss?hl=en-US&gl=US&ceid=US:en")
    try:
        soup = await rss_utility.fetch_and_parse_rss()
        rss_feed_model = await rss_utility.convert_to_model(soup)
        formatted_feed = RSSUtility.format_rss_feed(rss_feed_model)
        return {"news": formatted_feed}
    except Exception:
        return {"news": "failed"}


# Desktop automation endpoints (only available if optional deps are installed)
if ScreenClient is not None:
    @app.get("/api/click")
    async def click_main():
        image_url = "https://utfs.io/f/f2af0bde-9e51-40e3-b68b-5a4e6805ac2e-a8zuzm.png"
        client = ScreenClient(image_url, timeout=3)
        message = await client.find_and_click_image()
        return {"message": message}

if ChromeClient is not None:
    routes.get("/api/start-chrome", ChromeClient, "start_chrome_async")
    routes.get("/api/stop-chrome", ChromeClient, "stop_chrome_async")
    routes.get("/api/go-to-gitlab", ChromeClient, "go_to_gitlab")
    routes.get("/api/go-to-greenboard", ChromeClient, "fetch_embedded_job_board")

if DiscordClient is not None:
    routes.get("/api/discord-login", DiscordClient, "login_with_passkey")


# --- Server entry point using kbve AppServer ---

config = ServerConfig(http_port=8086)
server = AppServer(config=config, app=app)

if __name__ == "__main__":
    import asyncio
    asyncio.run(server.serve())
