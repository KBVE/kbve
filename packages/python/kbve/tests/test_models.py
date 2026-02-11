"""Tests for server configuration models."""

from kbve.models.server_models import ServerConfig


def test_default_config():
    """Test ServerConfig has sensible defaults."""
    config = ServerConfig()
    assert config.http_host == "0.0.0.0"
    assert config.http_port == 8000
    assert config.grpc_host == "0.0.0.0"
    assert config.grpc_port == 50051
    assert config.log_level == "info"


def test_custom_config():
    """Test ServerConfig accepts custom values."""
    config = ServerConfig(
        http_host="127.0.0.1",
        http_port=9000,
        grpc_host="127.0.0.1",
        grpc_port=9001,
        log_level="debug",
    )
    assert config.http_port == 9000
    assert config.grpc_port == 9001
    assert config.log_level == "debug"
