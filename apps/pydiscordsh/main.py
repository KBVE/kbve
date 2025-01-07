from fastapi import FastAPI, WebSocket
from pydiscordsh import Routes, CORS, TursoDatabase

import logging

logger = logging.getLogger("uvicorn")

app = FastAPI()
routes = Routes(app, templates_dir="templates")
CORS(app)

routes.get("/", TursoDatabase, "start_client")