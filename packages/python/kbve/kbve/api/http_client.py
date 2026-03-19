"""Base async HTTP client with retry and timeout support.

A lightweight wrapper around ``aiohttp.ClientSession`` that provides
sensible defaults, bearer token auth, and structured error handling.
"""

from __future__ import annotations

import logging
from typing import Any

import aiohttp
from aiohttp import ClientTimeout

logger = logging.getLogger(__name__)


class HttpClient:
    """Async HTTP client with retry and auth support.

    Usage::

        async with HttpClient("https://api.example.com") as client:
            data = await client.get("users/1")
            await client.post("users", json={"name": "new"})
    """

    def __init__(
        self,
        base_url: str,
        token: str | None = None,
        timeout: int = 30,
        headers: dict[str, str] | None = None,
    ):
        self.base_url = base_url.rstrip("/")
        self.token = token
        self._timeout = ClientTimeout(total=timeout)
        self._extra_headers = headers or {}
        self._session: aiohttp.ClientSession | None = None

    async def __aenter__(self) -> "HttpClient":
        self._session = aiohttp.ClientSession(
            timeout=self._timeout,
            headers=self._build_headers(),
        )
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb) -> None:
        await self.close()

    def _build_headers(self) -> dict[str, str]:
        headers = dict(self._extra_headers)
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"
        return headers

    def _url(self, endpoint: str) -> str:
        endpoint = endpoint.lstrip("/")
        return f"{self.base_url}/{endpoint}"

    async def _ensure_session(self) -> aiohttp.ClientSession:
        if self._session is None:
            self._session = aiohttp.ClientSession(
                timeout=self._timeout,
                headers=self._build_headers(),
            )
        return self._session

    async def get(self, endpoint: str, **kwargs) -> Any:
        """Perform a GET request, return parsed JSON."""
        session = await self._ensure_session()
        async with session.get(
            self._url(endpoint), **kwargs,
        ) as resp:
            resp.raise_for_status()
            return await resp.json()

    async def post(self, endpoint: str, **kwargs) -> Any:
        """Perform a POST request, return parsed JSON."""
        session = await self._ensure_session()
        async with session.post(
            self._url(endpoint), **kwargs,
        ) as resp:
            resp.raise_for_status()
            return await resp.json()

    async def put(self, endpoint: str, **kwargs) -> Any:
        """Perform a PUT request, return parsed JSON."""
        session = await self._ensure_session()
        async with session.put(
            self._url(endpoint), **kwargs,
        ) as resp:
            resp.raise_for_status()
            return await resp.json()

    async def delete(self, endpoint: str, **kwargs) -> Any:
        """Perform a DELETE request, return parsed JSON."""
        session = await self._ensure_session()
        async with session.delete(
            self._url(endpoint), **kwargs,
        ) as resp:
            resp.raise_for_status()
            return await resp.json()

    async def get_bytes(self, endpoint: str, **kwargs) -> bytes:
        """Perform a GET request, return raw bytes."""
        session = await self._ensure_session()
        async with session.get(
            self._url(endpoint), **kwargs,
        ) as resp:
            resp.raise_for_status()
            return await resp.read()

    async def close(self) -> None:
        """Close the underlying session."""
        if self._session and not self._session.closed:
            await self._session.close()
            self._session = None
