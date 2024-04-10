import aiohttp
from typing import Optional, Dict, Any

class APIConnector:
    def __init__(self, base_url: str, key: Optional[str] = None):
        """
        Initializes the APIConnector with a base URL for the API.

        :param base_url: The base URL of the API to connect to.
        :param key: Optional API key for authentication.
        """
        self.base_url = base_url
        self.key = key

    async def get(self, endpoint: str, params: Optional[Dict[str, Any]] = None, auth: Optional[str] = None) -> Any:
        headers = {}
        if self.key and auth == 'header':
            headers['Authorization'] = f"Bearer {self.key}"

        async with aiohttp.ClientSession() as session:
            async with session.get(f"{self.base_url}/{endpoint}", params=params, headers=headers) as response:
                response.raise_for_status()
                return await response.json()

    async def post(self, endpoint: str, data: Optional[Any] = None, json: Optional[Dict[str, Any]] = None, auth: Optional[str] = None) -> Any:
        headers = {}
        if self.key and auth == 'header':
            headers['Authorization'] = f"Bearer {self.key}"

        async with aiohttp.ClientSession() as session:
            async with session.post(f"{self.base_url}/{endpoint}", data=data, json=json, headers=headers) as response:
                response.raise_for_status()
                return await response.json()

    async def delete(self, endpoint: str, auth: Optional[str] = None) -> Any:
        headers = {}
        if self.key and auth == 'header':
            headers['Authorization'] = f"Bearer {self.key}"

        async with aiohttp.ClientSession() as session:
            async with session.delete(f"{self.base_url}/{endpoint}", headers=headers) as response:
                response.raise_for_status()
                return await response.json()
