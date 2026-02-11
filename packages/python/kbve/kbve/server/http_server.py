"""Async HTTP server wrapping FastAPI + uvicorn."""

import logging

import uvicorn
from fastapi import FastAPI

logger = logging.getLogger(__name__)


class HttpServer:
    """Manages a FastAPI application served by uvicorn."""

    def __init__(
        self,
        app: FastAPI | None = None,
        host: str = "0.0.0.0",
        port: int = 8000,
        log_level: str = "info",
    ):
        self.app = app or FastAPI()
        self.host = host
        self.port = port
        self.log_level = log_level
        self._server: uvicorn.Server | None = None

    async def start(self) -> None:
        """Start the uvicorn server (non-blocking via serve)."""
        config = uvicorn.Config(
            app=self.app,
            host=self.host,
            port=self.port,
            log_level=self.log_level,
        )
        self._server = uvicorn.Server(config)
        logger.info(
            "HTTP server starting on %s:%s", self.host, self.port
        )
        await self._server.serve()

    async def stop(self) -> None:
        """Signal the uvicorn server to shut down."""
        if self._server is not None:
            self._server.should_exit = True
            logger.info("HTTP server stopping")
