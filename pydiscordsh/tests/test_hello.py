"""Hello unit test module."""

from pydiscordsh.hello import hello


def test_hello():
    """Test the hello function."""
    assert hello() == "Hello pydiscordsh"
