"""Integration tests for fudster API layer — Routes, CORS, APIConnector."""

from fastapi import FastAPI
from fastapi.testclient import TestClient

from fudster.api.cors import CORS, DEFAULT_ORIGINS, _origins_from_env
from fudster.api.routes import Routes


# ── CORS ─────────────────────────────────────────────────────────────

def test_cors_default_origins():
    app = FastAPI()
    cors = CORS(app)
    assert cors.origins == DEFAULT_ORIGINS


def test_cors_custom_origins():
    app = FastAPI()
    custom = ["https://my-app.com"]
    cors = CORS(app, origins=custom)
    assert cors.origins == custom


def test_cors_from_env(monkeypatch):
    monkeypatch.setenv(
        "CORS_ORIGINS",
        "https://a.com, https://b.com",
    )
    app = FastAPI()
    cors = CORS(app)
    assert cors.origins == ["https://a.com", "https://b.com"]
    monkeypatch.delenv("CORS_ORIGINS")


def test_cors_env_empty(monkeypatch):
    monkeypatch.setenv("CORS_ORIGINS", "")
    app = FastAPI()
    cors = CORS(app)
    assert cors.origins == DEFAULT_ORIGINS
    monkeypatch.delenv("CORS_ORIGINS")


def test_cors_explicit_overrides_env(monkeypatch):
    monkeypatch.setenv("CORS_ORIGINS", "https://env.com")
    app = FastAPI()
    cors = CORS(app, origins=["https://explicit.com"])
    assert cors.origins == ["https://explicit.com"]
    monkeypatch.delenv("CORS_ORIGINS")


def test_cors_middleware_applied():
    app = FastAPI()
    CORS(app)
    middleware_classes = [
        m.cls.__name__ for m in app.user_middleware
    ]
    assert "CORSMiddleware" in middleware_classes


def test_origins_from_env_helper(monkeypatch):
    monkeypatch.setenv("CORS_ORIGINS", "a, b, c")
    result = _origins_from_env()
    assert result == ["a", "b", "c"]
    monkeypatch.delenv("CORS_ORIGINS")


def test_origins_from_env_not_set():
    result = _origins_from_env("NONEXISTENT_CORS_KEY")
    assert result is None


# ── Routes ───────────────────────────────────────────────────────────

def test_routes_get(tmp_path):
    templates_dir = tmp_path / "templates"
    templates_dir.mkdir()

    app = FastAPI()
    routes = Routes(app, templates_dir=str(templates_dir))

    class MockClient:
        async def fetch(self):
            return {"value": 42}

        async def close(self):
            pass

    routes.get("/api/test", MockClient, "fetch")

    client = TestClient(app)
    resp = client.get("/api/test")
    assert resp.status_code == 200
    assert resp.json() == {"value": 42}


def test_routes_post(tmp_path):
    templates_dir = tmp_path / "templates"
    templates_dir.mkdir()

    app = FastAPI()
    routes = Routes(app, templates_dir=str(templates_dir))

    class MockClient:
        async def create(self, data):
            return {"created": True, "input": data}

        async def close(self):
            pass

    routes.post("/api/create", MockClient, "create")

    client = TestClient(app)
    resp = client.post(
        "/api/create",
        json={"name": "test"},
    )
    assert resp.status_code == 200
    assert resp.json()["created"] is True


def test_routes_get_string_result(tmp_path):
    templates_dir = tmp_path / "templates"
    templates_dir.mkdir()

    app = FastAPI()
    routes = Routes(app, templates_dir=str(templates_dir))

    class MockClient:
        async def text(self):
            return "plain text"

        async def close(self):
            pass

    routes.get("/api/text", MockClient, "text")

    client = TestClient(app)
    resp = client.get("/api/text")
    assert resp.status_code == 200
    assert resp.json() == {"data": "plain text"}


def test_routes_render(tmp_path):
    templates_dir = tmp_path / "templates"
    templates_dir.mkdir()
    (templates_dir / "home.html").write_text(
        "<html><body>Hello</body></html>"
    )

    app = FastAPI()
    routes = Routes(app, templates_dir=str(templates_dir))
    routes.render("/", "home.html")

    client = TestClient(app)
    resp = client.get("/")
    assert resp.status_code == 200
    assert "Hello" in resp.text


def test_routes_invalid_method(tmp_path):
    templates_dir = tmp_path / "templates"
    templates_dir.mkdir()

    app = FastAPI()
    routes = Routes(app, templates_dir=str(templates_dir))

    class MockClient:
        async def close(self):
            pass

    routes.get("/api/bad", MockClient, "nonexistent_method")

    client = TestClient(app)
    resp = client.get("/api/bad")
    assert resp.status_code == 500


# ── APIConnector ─────────────────────────────────────────────────────
# APIConnector creates an aiohttp.ClientSession eagerly in __init__,
# which requires a running event loop. Test _prepare_headers by calling
# the unbound method directly with a simple namespace object.

def _make_connector_attrs(base_url="https://x.com", key=None):
    """Create a simple namespace with APIConnector fields."""
    from types import SimpleNamespace
    return SimpleNamespace(
        base_url=base_url,
        key=key,
        session=None,
        websocket=None,
    )


def test_api_connector_prepare_headers():
    from fudster.api.api_connector import APIConnector
    obj = _make_connector_attrs(key="secret")
    headers = APIConnector._prepare_headers(obj, auth="header")
    assert headers["Authorization"] == "Bearer secret"


def test_api_connector_prepare_headers_no_auth():
    from fudster.api.api_connector import APIConnector
    obj = _make_connector_attrs(key="secret")
    headers = APIConnector._prepare_headers(obj)
    assert "Authorization" not in headers


def test_api_connector_prepare_headers_no_key():
    from fudster.api.api_connector import APIConnector
    obj = _make_connector_attrs()
    headers = APIConnector._prepare_headers(obj, auth="header")
    assert "Authorization" not in headers


def test_api_connector_attributes():
    obj = _make_connector_attrs(
        base_url="https://api.example.com", key="tk",
    )
    assert obj.base_url == "https://api.example.com"
    assert obj.key == "tk"
