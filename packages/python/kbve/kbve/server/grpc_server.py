"""Async gRPC server wrapper."""

import logging
from typing import Callable

from grpc import aio

logger = logging.getLogger(__name__)


class GrpcServer:
    """Manages an async gRPC server lifecycle."""

    def __init__(self, host: str = "0.0.0.0", port: int = 50051):
        self.host = host
        self.port = port
        self._server: aio.Server | None = None
        self._service_registrars: list[Callable] = []

    def add_service(self, registrar: Callable) -> None:
        """Register a gRPC service adder callable.

        The registrar should accept (servicer_instance, server) and call
        the generated add_*Servicer_to_server function.
        """
        self._service_registrars.append(registrar)

    async def start(self) -> None:
        """Create the gRPC server, bind port, and start serving."""
        self._server = aio.server()

        for registrar in self._service_registrars:
            registrar(self._server)

        bind_address = f"{self.host}:{self.port}"  # noqa: E231
        self._server.add_insecure_port(bind_address)
        await self._server.start()
        logger.info("gRPC server started on %s", bind_address)

    async def stop(self, grace: float = 5.0) -> None:
        """Gracefully stop the gRPC server."""
        if self._server is not None:
            await self._server.stop(grace)
            logger.info("gRPC server stopped")

    async def wait_for_termination(self) -> None:
        """Block until the server terminates."""
        if self._server is not None:
            await self._server.wait_for_termination()
