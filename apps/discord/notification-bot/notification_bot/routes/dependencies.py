from fastapi import FastAPI, Security
from contextlib import asynccontextmanager
import logging
logger = logging.getLogger("uvicorn")


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info(f"Preparing FastAPI Lifespan")
    yield

