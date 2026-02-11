"""Hello unit test module."""

from kbve.hello import hello


def test_hello():
    """Test the hello function."""
    assert hello() == "Hello python-kbve"
