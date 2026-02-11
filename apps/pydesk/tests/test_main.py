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
