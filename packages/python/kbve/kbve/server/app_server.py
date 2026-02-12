"""Unified AppServer combining HTTP (FastAPI) and gRPC."""

import logging
from typing import Callable

from fastapi import FastAPI

from kbve.models.server_models import ServerConfig
from kbve.proto import kbve_pb2_grpc
from kbve.server.grpc_server import GrpcServer
from kbve.server.http_server import HttpServer
from kbve.server.services.health_service import HealthServicer
from kbve.server.services.echo_service import EchoServicer

logger = logging.getLogger(__name__)


class AppServer:
    """Unified server that runs both HTTP and gRPC on separate ports."""

    def __init__(
        self,
        config: ServerConfig | None = None,
        app: FastAPI | None = None,
        include_defaults: bool = True,
    ):
        self.config = config or ServerConfig()
        self.http = HttpServer(
            app=app,
            host=self.config.http_host,
            port=self.config.http_port,
            log_level=self.config.log_level,
        )
        self.grpc = GrpcServer(
            host=self.config.grpc_host,
            port=self.config.grpc_port,
        )
        self._startup_hooks: list[Callable] = []
        self._shutdown_hooks: list[Callable] = []

        if include_defaults:
            self._register_defaults()

    def _register_defaults(self) -> None:
        """Register default Health and Echo gRPC services + /health HTTP."""
        health = HealthServicer()
        echo = EchoServicer()

        self.grpc.add_service(
            lambda server: kbve_pb2_grpc.add_HealthServicer_to_server(
                health, server
            )
        )
        self.grpc.add_service(
            lambda server: kbve_pb2_grpc.add_EchoServicer_to_server(
                echo, server
            )
        )

        @self.http.app.get("/health")
        async def health_check():
            return {"status": "SERVING"}

    def add_grpc_service(self, registrar: Callable) -> None:
        """Add a custom gRPC service registrar."""
        self.grpc.add_service(registrar)

    def on_startup(self, callback: Callable) -> None:
        """Register a startup lifecycle hook."""
        self._startup_hooks.append(callback)

    def on_shutdown(self, callback: Callable) -> None:
        """Register a shutdown lifecycle hook."""
        self._shutdown_hooks.append(callback)

    async def serve(self) -> None:
        """Start both gRPC and HTTP servers, block until exit."""
        for hook in self._startup_hooks:
            await hook()

        await self.grpc.start()
        logger.info("gRPC server ready")

        try:
            await self.http.start()
        finally:
            await self.grpc.stop()
            for hook in self._shutdown_hooks:
                await hook()
            logger.info("AppServer shut down")
