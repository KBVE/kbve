"""KBVE package basic tests."""

import kbve


def test_version():
    """Test the version is set."""
    assert kbve.__version__ == "0.1.0"


def test_exports():
    """Test that primary exports are available."""
    assert kbve.ServerConfig is not None
    assert kbve.AppServer is not None
    assert kbve.GrpcServer is not None
    assert kbve.HttpServer is not None
    assert kbve.HealthServicer is not None
    assert kbve.EchoServicer is not None
