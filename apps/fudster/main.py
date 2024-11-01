from fastapi import FastAPI, Request
from fudster import Routes, CORS, RuneLiteClient

import logging

logger = logging.getLogger("uvicorn")

app = FastAPI()
routes = Routes(app, templates_dir="templates")

CORS(app)

routes.render("/", "home.html")
routes.get("/start-runelite", RuneLiteClient, "start_runelite_async")
routes.get("/stop-runelite", RuneLiteClient, "stop_runelite_async")
routes.get("/status", RuneLiteClient, "status_runelite")