"""Async gRPC server wrapper."""

import logging
from typing import Callable, Sequence

from grpc import aio

logger = logging.getLogger(__name__)


class GrpcServer:
    """Manages an async gRPC server lifecycle."""

    def __init__(
        self,
        host: str = "0.0.0.0",
        port: int = 50051,
        interceptors: list | None = None,
    ):
        self.host = host
        self.port = port
        self._interceptors = interceptors or []
        self._server: aio.Server | None = None
        self._service_registrars: list[Callable] = []
        self._service_names: list[str] = []
        self._reflection_enabled = False

    def add_service(
        self, registrar: Callable, name: str | None = None,
    ) -> None:
        """Register a gRPC service adder callable.

        The registrar should accept a server and call the generated
        ``add_*Servicer_to_server`` function. Optionally pass *name*
        (fully-qualified service name) for reflection advertisement.
        """
        self._service_registrars.append(registrar)
        if name:
            self._service_names.append(name)

    def enable_reflection(
        self, extra_names: Sequence[str] | None = None,
    ) -> None:
        """Mark this server for gRPC reflection on start."""
        self._reflection_enabled = True
        if extra_names:
            self._service_names.extend(extra_names)

    async def start(self) -> None:
        """Create the gRPC server, bind port, and start serving."""
        self._server = aio.server(
            interceptors=self._interceptors or None,
        )

        for registrar in self._service_registrars:
            registrar(self._server)

        if self._reflection_enabled:
            from kbve.grpc.reflection import enable_reflection
            enable_reflection(self._server, self._service_names)

        bind_address = self.host + ":" + str(self.port)
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
