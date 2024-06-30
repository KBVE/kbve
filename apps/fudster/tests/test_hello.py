"""Hello unit test module."""

from fudster.hello import hello


def test_hello():
    """Test the hello function."""
    assert hello() == "Hello fudster"
