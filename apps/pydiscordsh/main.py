from fastapi import FastAPI, WebSocket
from pydiscordsh import Routes, CORS
from contextlib import asynccontextmanager

import logging

logger = logging.getLogger("uvicorn")