"""PyDesk application tests."""

from pydesk import __version__


def test_version():
    """Test the version is set."""
    assert __version__ == "0.1.0"


def test_fudster_imports():
    """Test that fudster library is importable from pydesk."""
    from fudster import Routes, CORS, WS, RuneLiteClient
    assert Routes is not None
    assert CORS is not None
    assert WS is not None
    assert RuneLiteClient is not None


def test_fudster_models():
    """Test that fudster models are importable."""
    from fudster import CommandModel
    cmd = CommandModel(
        command="execute",
        packageName="test",
        className="Test",
        method="run",
    )
    assert cmd.command == "execute"


def test_fudster_api_clients():
    """Test that migrated API clients are importable."""
    from fudster import CoinDeskClient, PoetryDBClient, GroqClient, WebsocketEchoClient
    assert CoinDeskClient is not None
    assert PoetryDBClient is not None
    assert GroqClient is not None
    assert WebsocketEchoClient is not None


def test_fudster_new_models():
    """Test that migrated models are importable."""
    from fudster import RssItem, RssFeed, PoemDB, CoinDeskAPIResponse, AiGroqPayload
    assert RssItem is not None
    assert RssFeed is not None
    assert PoemDB is not None
    assert CoinDeskAPIResponse is not None
    assert AiGroqPayload is not None


def test_fudster_utils():
    """Test that migrated utility classes are importable."""
    from fudster import RSSUtility, KRDecorator, DynamicEndpoint
    assert RSSUtility is not None
    assert KRDecorator is not None
    assert DynamicEndpoint is not None


def test_kbve_imports():
    """Test that kbve library is importable from pydesk."""
    from kbve import AppServer, ServerConfig, HttpServer, GrpcServer
    assert AppServer is not None
    assert ServerConfig is not None
    assert HttpServer is not None
    assert GrpcServer is not None


def test_kbve_server_config():
    """Test kbve ServerConfig with custom port."""
    from kbve import ServerConfig
    config = ServerConfig(http_port=8086)
    assert config.http_port == 8086
    assert config.grpc_port == 50051
