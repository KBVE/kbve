import aiohttp

from ..api_connector import APIConnector
from ...models.poem import PoemDB


class PoetryDBClient(APIConnector):
    def __init__(self):
        """
        Initializes the PoetryDBClient with the base URL for the PoetryDB API.
        """
        super().__init__("https://poetrydb.org", key=None)

    async def get_random_poem(self) -> PoemDB:
        """
        Fetches a random poem from the PoetryDB API and returns it as a PoemDB model instance.
        """
        response = await self.get("random", auth=None)
        if response:
            poem = PoemDB.model_validate(response[0])
            return poem
        else:
            raise aiohttp.ClientResponseError("Failed to fetch a random poem.")
