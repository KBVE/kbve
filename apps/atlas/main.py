from fastapi import FastAPI, WebSocket,  HTTPException
from fastapi.responses import HTMLResponse, FileResponse
from fastapi.staticfiles import StaticFiles

import websockets
import asyncio

import uvicorn
import os

from contextlib import asynccontextmanager

from kbve_atlas.api.clients import CoinDeskClient, WebsocketEchoClient, PoetryDBClient, ScreenClient, NoVNCClient, RuneLiteClient, ChromeClient, DiscordClient
from kbve_atlas.api.utils import RSSUtility, KRDecorator, CORSUtil, ThemeCore, BroadcastUtility


import logging
logger = logging.getLogger("uvicorn")

os.environ['DISPLAY'] = ':1'
broadcast = BroadcastUtility()

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("[BROADCAST]@PENDING")
    await broadcast.connect()
    
    yield  # Start FastAPI lifecycle tasks

    logger.info("[BROADCAST]@DISINT")
    await broadcast.disconnect()
    logger.info("[BROADCAST]@STOPPING")

app = FastAPI(lifespan=lifespan)

kr_decorator = KRDecorator(app)

CORSUtil(app)

@app.websocket("/")
async def websocket_handshake(websocket: WebSocket):
    await broadcast.handle_websocket(websocket)

@app.get("/", response_class=HTMLResponse)
async def get():
    return ThemeCore.example_chat_page()

@app.get("/click")
async def click_main():
    image_url = "https://utfs.io/f/f2af0bde-9e51-40e3-b68b-5a4e6805ac2e-a8zuzm.png"
    client = ScreenClient(image_url, timeout=3)
    message = await client.find_and_click_image()
    print(os.getenv('DISPLAY'))
    return {"message": message}

@app.get("/debug")
async def click_debug():
    print(os.getenv('DISPLAY'))
    coordinates = [(100, 100), (200, 200), (300, 300), (400, 400), (500, 500)]
    client = ScreenClient()
    message = client.debug_mouse_move_and_click(coordinates, move_duration=1.5)
    return {"message": message}


@app.get("/echo")
async def echo_main():
    websocket_client = WebsocketEchoClient()
    try:
        await websocket_client.example()
    finally:
        await websocket_client.close()
        return {"ws": "true"}


@app.get("/news")
async def google_news():
    rss_utility = RSSUtility(base_url="https://news.google.com/rss?hl=en-US&gl=US&ceid=US:en")
    try:
        soup = await rss_utility.fetch_and_parse_rss()
        
        rss_feed_model = await rss_utility.convert_to_model(soup)
        formatted_feed = RSSUtility.format_rss_feed(rss_feed_model)
        return {"news": formatted_feed}
    except:
        return {"news": "failed"}

@kr_decorator.k_r("/bitcoin-price", CoinDeskClient, "get_current_bitcoin_price")
def bitcoin_price(price):
    return price

@kr_decorator.k_r("/poem", PoetryDBClient, "get_random_poem")
def poetry_db(poem):
    return  poem

@kr_decorator.k_r("/start-runelite", RuneLiteClient, "start_runelite_async")
def runelite_startup_message(startup_message):
    return startup_message

@kr_decorator.k_r("/stop-runelite", RuneLiteClient, "stop_runelite_async")
def runelite_shutdown_message(shutdown_message):
    return shutdown_message

@kr_decorator.k_r("/status", RuneLiteClient, "status_runelite")
def status_runelite(message):
    return message

@kr_decorator.k_r("/config-runelite", RuneLiteClient, "start_and_configure_runelite")
def runelite_configuration_message(configuration_message):
    return configuration_message

@kr_decorator.k_r("/start-chrome", ChromeClient, "start_chrome_async")
def chrome_startup_message(startup_message):
    return startup_message

@kr_decorator.k_r("/stop-chrome", ChromeClient, "stop_chrome_async")
def chrome_shutdown_message(shutdown_message):
    return shutdown_message

@kr_decorator.k_r("/perform-chrome-task", ChromeClient, "perform_task_with_chrome")
def chrome_task_message(task_message):
    return task_message


@kr_decorator.k_r("/go-to-gitlab", ChromeClient, "go_to_gitlab")
def gitlab_navigation_message(navigation_message):
    return navigation_message

@kr_decorator.k_r("/go-to-greenboard", ChromeClient, "fetch_embedded_job_board")
def fetch_embedded_job_board(navigation_message):
    return navigation_message

@kr_decorator.k_r("/discord-login", DiscordClient, "login_with_passkey")
def discord_login_message(message):
    return message