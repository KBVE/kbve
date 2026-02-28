"""Fudster library unit tests."""

from fudster import (
    CommandModel, LoggerModel, BroadcastModel,
    KBVELoginModel, HandshakeModel, model_map,
    Routes, CORS, WS, RuneLiteClient,
    APIConnector,
    RssItem, RssFeed, PoemDB,
    AiGroqPayload,
    CoinDeskClient, PoetryDBClient, GroqClient, WebsocketEchoClient,
    RSSUtility, KRDecorator, DynamicEndpoint,
)


def test_version():
    """Test the version is set."""
    from fudster import __version__
    assert __version__ == "0.1.0"


def test_command_model():
    """Test CommandModel creation."""
    cmd = CommandModel(
        command="execute",
        packageName="test.pkg",
        className="TestClass",
        method="run",
    )
    assert cmd.command == "execute"
    assert cmd.priority == 5
    assert cmd.args == []


def test_logger_model():
    """Test LoggerModel creation."""
    log = LoggerModel(message="test message", priority=1)
    assert log.command == "log"
    assert log.message == "test message"


def test_broadcast_model():
    """Test BroadcastModel creation."""
    broadcast = BroadcastModel(channel="default", content={"key": "value"})
    assert broadcast.channel == "default"


def test_login_model():
    """Test KBVELoginModel creation."""
    login = KBVELoginModel(
        username="user",
        password="pass",
        bankpin="1234",
        world=301,
    )
    assert login.command == "login"
    assert login.uuid == "default-uuid"


def test_handshake_model():
    """Test HandshakeModel creation."""
    hs = HandshakeModel(
        channel="default",
        content="hello",
        timestamp="2024-01-01T00:00:00Z",
    )
    assert hs.command == "handshake"


def test_model_map():
    """Test model_map contains expected entries."""
    assert "execute" in model_map
    assert "log" in model_map
    assert "login" in model_map
    assert "handshake" in model_map
    assert model_map["execute"] is CommandModel


def test_exports():
    """Test that all expected classes are importable."""
    assert Routes is not None
    assert CORS is not None
    assert WS is not None
    assert RuneLiteClient is not None


def test_api_connector_export():
    """Test APIConnector is importable."""
    assert APIConnector is not None


def test_rss_models():
    """Test RSS model creation."""
    item = RssItem(title="Test", link="http://example.com", description="Desc", pubDate="Mon, 01 Jan 2024")
    assert item.title == "Test"

    feed = RssFeed(title="Feed", link="http://example.com", description="A feed", items=[item])
    assert len(feed.items) == 1


def test_poem_model():
    """Test PoemDB model creation."""
    poem = PoemDB(title="Test Poem", author="Author", lines=["Line 1", "Line 2"], linecount=2)
    assert poem.title == "Test Poem"
    assert poem.linecount == 2


def test_groq_payload_model():
    """Test AiGroqPayload model creation."""
    payload = AiGroqPayload(message="hello", model="llama3", system="You are helpful")
    assert payload.message == "hello"


def test_api_clients_importable():
    """Test that API clients are importable."""
    assert CoinDeskClient is not None
    assert PoetryDBClient is not None
    assert GroqClient is not None
    assert WebsocketEchoClient is not None


def test_utils_importable():
    """Test that utility classes are importable."""
    assert RSSUtility is not None
    assert KRDecorator is not None
    assert DynamicEndpoint is not None
