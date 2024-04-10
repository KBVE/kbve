import aiohttp

from ..api_connector import APIConnector
from ...models.poem import PoemDB


class PoetryDBClient(APIConnector):
    def __init__(self):
        """
        Initializes the PoetryDBClient with the base URL for the PoetryDB API.
        No API key is required for accessing the public PoetryDB API.
        """
        super().__init__("https://poetrydb.org", key=None)

    async def get_random_poem(self) -> PoemDB:
        """
        Fetches a random poem from the PoetryDB API and returns it as a Poem model instance.

        :return: A Poem model instance if successful, raises an exception otherwise.
        """
        response = await self.get("random", auth=None)
        if response:
            # Since the API returns a list of poems, even if it's just one,
            # we take the first element and parse it into a Poem model.
            poem = PoemDB.model_validate(response[0])
            return poem
        else:
            # It might be useful to raise an exception if the request failed,
            # so the caller knows something went wrong.
            raise aiohttp.ClientResponseError("Failed to fetch a random poem.")
