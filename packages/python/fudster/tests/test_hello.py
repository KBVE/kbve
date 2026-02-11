"""Fudster library unit tests."""

from fudster import (
    CommandModel, LoggerModel, BroadcastModel,
    KBVELoginModel, HandshakeModel, model_map,
    Routes, CORS, WS, RuneLiteClient,
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
