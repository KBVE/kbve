"""Unified AppServer combining HTTP (FastAPI) and gRPC."""

import logging
from typing import Callable

from fastapi import FastAPI

from kbve.config import EnvConfig
from kbve.health import HealthCheck, create_health_router
from kbve.models.server_models import ServerConfig
from kbve.proto import kbve_pb2_grpc
from kbve.server.grpc_server import GrpcServer
from kbve.server.http_server import HttpServer
from kbve.server.services.health_service import HealthServicer
from kbve.server.services.echo_service import EchoServicer
from kbve.tasks import TaskRunner

logger = logging.getLogger(__name__)


class AppServer:
    """Unified server that runs both HTTP and gRPC on separate ports.

    Integrates ``HealthCheck`` for composable probes, ``TaskRunner`` for
    startup jobs, and supports ``EnvConfig`` for environment-driven
    configuration.
    """

    def __init__(
        self,
        config: ServerConfig | None = None,
        app: FastAPI | None = None,
        include_defaults: bool = True,
        env_config: EnvConfig | None = None,
    ):
        self.config = config or ServerConfig()
        self.env_config = env_config
        self.health = HealthCheck()
        self.startup_tasks = TaskRunner()
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

    @classmethod
    def from_env(
        cls,
        prefix: str = "KBVE",
        env_file: str | None = None,
        **kwargs,
    ) -> "AppServer":
        """Create an AppServer from environment variables.

        Reads ``{PREFIX}_HTTP_HOST``, ``{PREFIX}_HTTP_PORT``,
        ``{PREFIX}_GRPC_PORT``, ``{PREFIX}_LOG_LEVEL`` from env.
        """
        env = EnvConfig.from_env(
            prefix=prefix,
            defaults={
                "http_host": "0.0.0.0",
                "http_port": "8000",
                "grpc_host": "0.0.0.0",
                "grpc_port": "50051",
                "log_level": "info",
            },
            env_file=env_file,
        )
        config = ServerConfig(
            http_host=env.get("http_host", "0.0.0.0"),
            http_port=env.get_int("http_port", 8000),
            grpc_host=env.get("grpc_host", "0.0.0.0"),
            grpc_port=env.get_int("grpc_port", 50051),
            log_level=env.get("log_level", "info"),
        )
        return cls(config=config, env_config=env, **kwargs)

    def _register_defaults(self) -> None:
        """Register default gRPC services + health endpoints."""
        health_svc = HealthServicer()
        echo = EchoServicer()

        self.grpc.add_service(
            lambda server: kbve_pb2_grpc.add_HealthServicer_to_server(
                health_svc, server
            )
        )
        self.grpc.add_service(
            lambda server: kbve_pb2_grpc.add_EchoServicer_to_server(
                echo, server
            )
        )

        self.health.add("self", lambda: True)
        router = create_health_router(self.health)
        self.http.app.include_router(router)

    def add_grpc_service(self, registrar: Callable) -> None:
        """Add a custom gRPC service registrar."""
        self.grpc.add_service(registrar)

    def add_health_check(self, name: str, check_fn: Callable) -> None:
        """Register a named health probe."""
        self.health.add(name, check_fn)

    def add_startup_task(
        self, name: str, fn: Callable,
        timeout: float | None = None,
    ) -> None:
        """Register a named async startup task."""
        self.startup_tasks.add(name, fn, timeout=timeout)

    def on_startup(self, callback: Callable) -> None:
        """Register a startup lifecycle hook."""
        self._startup_hooks.append(callback)

    def on_shutdown(self, callback: Callable) -> None:
        """Register a shutdown lifecycle hook."""
        self._shutdown_hooks.append(callback)

    async def serve(self) -> None:
        """Start both gRPC and HTTP servers, block until exit."""
        if self.startup_tasks.task_names():
            results = await self.startup_tasks.run_sequential()
            for r in results:
                if r.state.value == "failed":
                    logger.warning(
                        "Startup task '%s' failed: %s",
                        r.name, r.error,
                    )

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
