"""Tests for AppServer construction and configuration."""

from fastapi import FastAPI

from kbve.models.server_models import ServerConfig
from kbve.server.app_server import AppServer


def test_app_server_default_config():
    """Test AppServer uses default config when none provided."""
    server = AppServer()
    assert server.config.http_port == 8000
    assert server.config.grpc_port == 50051


def test_app_server_custom_config():
    """Test AppServer accepts custom config."""
    config = ServerConfig(http_port=9000, grpc_port=9001)
    server = AppServer(config=config)
    assert server.http.port == 9000
    assert server.grpc.port == 9001


def test_app_server_custom_fastapi_app():
    """Test AppServer accepts a custom FastAPI app."""
    custom_app = FastAPI(title="CustomApp")
    server = AppServer(app=custom_app)
    assert server.http.app is custom_app
    assert server.http.app.title == "CustomApp"


def test_app_server_default_services_registered():
    """Test that default services register Health and Echo."""
    server = AppServer(include_defaults=True)
    assert len(server.grpc._service_registrars) == 2


def test_app_server_no_defaults():
    """Test that include_defaults=False skips service registration."""
    server = AppServer(include_defaults=False)
    assert len(server.grpc._service_registrars) == 0


def test_app_server_health_endpoint():
    """Test that /health HTTP endpoint is registered."""
    server = AppServer()
    routes = [r.path for r in server.http.app.routes]
    assert "/health" in routes


def test_app_server_add_grpc_service():
    """Test adding a custom gRPC service."""
    server = AppServer(include_defaults=False)

    def my_registrar(s):
        pass

    server.add_grpc_service(my_registrar)
    assert len(server.grpc._service_registrars) == 1


def test_app_server_lifecycle_hooks():
    """Test registering startup and shutdown hooks."""
    server = AppServer()

    async def startup():
        pass

    async def shutdown():
        pass

    server.on_startup(startup)
    server.on_shutdown(shutdown)
    assert len(server._startup_hooks) == 1
    assert len(server._shutdown_hooks) == 1
