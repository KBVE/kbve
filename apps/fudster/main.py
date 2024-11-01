from fastapi import FastAPI, Request
from fastapi.templating import Jinja2Templates

from fudster import Routes, CORS, RuneLiteClient

import logging

logger = logging.getLogger("uvicorn")

app = FastAPI()
templates = Jinja2Templates(directory="templates")
routes = Routes(app)

CORS(app)

@app.get("/")
async def home(request: Request):
    return templates.TemplateResponse("home.html", {"request": request})

@routes.get("/start-runelite", RuneLiteClient, "start_runelite_async")
def runelite_startup_message(startup_message):
    return startup_message

@routes.get("/stop-runelite",  RuneLiteClient, "stop_runelite_async")
def runelite_shutdown_message(shutdown_message):
    return shutdown_message

@routes.get("/status", RuneLiteClient, "status_runelite")
def status_runelite(message):
    return message
