import aiohttp
from aiohttp import ClientTimeout

import asyncio
from typing import Optional, Dict, Any


class APIConnector:
    def __init__(self, base_url: str, key: Optional[str] = None, websocket=None, timeout: int = 30):
        self.base_url = base_url
        self.key = key
        self.session = aiohttp.ClientSession(timeout=ClientTimeout(total=timeout))
        self.websocket = websocket

    async def _request(self, method: str, endpoint: str, **kwargs) -> Any:
        url = f"{self.base_url}/{endpoint}"
        headers = self._prepare_headers(kwargs.pop('auth', None))
        async with self.session.request(method, url, headers=headers, **kwargs) as response:
            response.raise_for_status()
            return await response.json()

    async def _get_session(self):
        if not self.session:
            self.session = aiohttp.ClientSession()
        return self.session

    async def get(self, endpoint: str, **kwargs) -> Any:
        return await self._request('GET', endpoint, **kwargs)

    async def post(self, endpoint: str, **kwargs) -> Any:
        return await self._request('POST', endpoint, **kwargs)

    async def delete(self, endpoint: str, **kwargs) -> Any:
        return await self._request('DELETE', endpoint, **kwargs)

    async def close(self):
        if self.websocket is not None and not self.websocket.closed:
            await self.websocket.close()
        await self.session.close()

    async def connect_websocket(self, endpoint: Optional[str] = None) -> aiohttp.ClientWebSocketResponse:
        headers = {}
        if self.key:
            headers['Authorization'] = f"Bearer {self.key}"
        if endpoint:
            websocket_url = f"{self.base_url}/{endpoint}"
        else:
            websocket_url = self.base_url

        self.websocket = await self.session.ws_connect(websocket_url, headers=headers)
        return self.websocket

    async def ensure_websocket_connected(self):
            """Ensure that the WebSocket connection is established."""
            if self.websocket is None or self.websocket.closed:
                # Attempt to connect or reconnect
                self.websocket = await self.session.ws_connect(f"{self.base_url}", headers=self._prepare_headers())
            return self.websocket

    async def send_websocket_message(self, message: str, timeout: float = 30.0):
        """Send a message through the WebSocket connection."""
        await self.ensure_websocket_connected()  # Ensure connection is open
        await asyncio.wait_for(self.websocket.send_str(message), timeout=timeout)

    async def receive_websocket_message(self, timeout: float = 30.0) -> str:
        """Receive a message from the WebSocket connection."""
        await self.ensure_websocket_connected()  # Ensure connection is open
        msg = await asyncio.wait_for(self.websocket.receive(), timeout=timeout)
        if msg.type == aiohttp.WSMsgType.TEXT:
            return msg.data
        elif msg.type in (aiohttp.WSMsgType.CLOSED, aiohttp.WSMsgType.ERROR):
            raise Exception("WebSocket connection closed or encountered an error.")

    def _prepare_headers(self, auth: Optional[str] = None) -> dict:
        """Prepare headers for HTTP or WebSocket connection."""
        headers = {}
        if self.key and auth == 'header':
            headers['Authorization'] = f"Bearer {self.key}"
        return headers
    
    async def get_raw_content(self, endpoint: str) -> bytes:
        """
        Performs a GET request to the specified endpoint and returns the raw response content.

        :param endpoint: The API endpoint to fetch.
        :return: Raw content of the response as bytes.
        """
        # Ensure the session is initialized
        session = await self._get_session()
        # Construct the full URL
        url = f"{self.base_url}/{endpoint}"
        async with session.get(url) as response:
            response.raise_for_status()  # Ensure we got a successful response
            return await response.read()  # Return the response content as bytes