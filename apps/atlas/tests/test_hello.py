"""Hello unit test module."""

from kbve_atlas.hello import hello


def test_hello():
    """Test the hello function."""
    assert hello() == "Hello atlas"
