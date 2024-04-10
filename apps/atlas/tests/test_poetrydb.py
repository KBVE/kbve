"""Poetry unit test module."""

from kbve_atlas.api.clients.poetry_db_client import PoetryDBClient

def test_get_random_poem_live():
    poetry_client = PoetryDBClient()
    # Attempt to fetch a random poem
    random_poem = poetry_client.get_random_poem()
    
    # Test passes if random_poem is not None or empty, indicating a successful API call
    assert random_poem is not None and len(random_poem) > 0