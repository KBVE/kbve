"""Tests for AppServer integration with config, health, and tasks modules."""

from kbve.server.app_server import AppServer
from kbve.config import EnvConfig
from kbve.health import HealthCheck
from kbve.tasks import TaskRunner


def test_app_server_has_health_check():
    server = AppServer()
    assert isinstance(server.health, HealthCheck)


def test_app_server_has_task_runner():
    server = AppServer()
    assert isinstance(server.startup_tasks, TaskRunner)


def test_app_server_add_health_check():
    server = AppServer()
    server.add_health_check("db", lambda: True)
    # Should have "self" (default) + "db"
    assert len(server.health._checks) == 2


def test_app_server_add_startup_task():
    server = AppServer()

    async def noop():
        pass

    server.add_startup_task("migrate", noop, timeout=10.0)
    assert "migrate" in server.startup_tasks.task_names()


def test_app_server_env_config():
    server = AppServer(env_config=EnvConfig(values={"key": "val"}))
    assert server.env_config is not None
    assert server.env_config.get("key") == "val"


def test_app_server_from_env(monkeypatch):
    monkeypatch.setenv("TEST_HTTP_PORT", "9999")
    monkeypatch.setenv("TEST_LOG_LEVEL", "debug")
    server = AppServer.from_env(prefix="TEST")
    assert server.config.http_port == 9999
    assert server.config.log_level == "debug"
    assert server.env_config is not None

    monkeypatch.delenv("TEST_HTTP_PORT")
    monkeypatch.delenv("TEST_LOG_LEVEL")


def test_app_server_from_env_defaults():
    server = AppServer.from_env(prefix="UNUSED_PREFIX_XYZ")
    assert server.config.http_port == 8000
    assert server.config.http_host == "0.0.0.0"


def test_app_server_from_env_with_file(tmp_path, monkeypatch):
    f = tmp_path / ".env"
    f.write_text("FILECFG_HTTP_PORT=7777\n")
    monkeypatch.delenv("FILECFG_HTTP_PORT", raising=False)

    server = AppServer.from_env(prefix="FILECFG", env_file=str(f))
    assert server.config.http_port == 7777

    monkeypatch.delenv("FILECFG_HTTP_PORT", raising=False)


def test_app_server_no_defaults():
    server = AppServer(include_defaults=False)
    # health should still exist but have no checks
    assert len(server.health._checks) == 0


def test_app_server_default_health_endpoint():
    server = AppServer()
    routes = [r.path for r in server.http.app.routes]
    assert "/health" in routes
    assert "/health/live" in routes
