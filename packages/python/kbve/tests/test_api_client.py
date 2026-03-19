"""Tests for kbve.api.http_client module."""

import pytest

from kbve.api.http_client import HttpClient


def test_http_client_init():
    client = HttpClient("https://api.example.com")
    assert client.base_url == "https://api.example.com"
    assert client.token is None
    assert client._session is None


def test_http_client_init_trailing_slash():
    client = HttpClient("https://api.example.com/")
    assert client.base_url == "https://api.example.com"


def test_http_client_url_building():
    client = HttpClient("https://api.example.com")
    assert client._url("users/1") == "https://api.example.com/users/1"
    assert client._url("/users/1") == "https://api.example.com/users/1"


def test_http_client_headers_no_token():
    client = HttpClient("https://example.com")
    headers = client._build_headers()
    assert "Authorization" not in headers


def test_http_client_headers_with_token():
    client = HttpClient("https://example.com", token="my-token")
    headers = client._build_headers()
    assert headers["Authorization"] == "Bearer my-token"


def test_http_client_headers_with_extra():
    client = HttpClient(
        "https://example.com",
        headers={"X-Custom": "value"},
    )
    headers = client._build_headers()
    assert headers["X-Custom"] == "value"


def test_http_client_headers_token_plus_extra():
    client = HttpClient(
        "https://example.com",
        token="tk",
        headers={"X-Id": "123"},
    )
    headers = client._build_headers()
    assert headers["Authorization"] == "Bearer tk"
    assert headers["X-Id"] == "123"


@pytest.mark.asyncio
async def test_http_client_close_no_session():
    client = HttpClient("https://example.com")
    await client.close()  # should not raise


@pytest.mark.asyncio
async def test_http_client_context_manager():
    async with HttpClient("https://example.com") as client:
        assert client._session is not None
    assert client._session is None


@pytest.mark.asyncio
async def test_http_client_ensure_session():
    client = HttpClient("https://example.com")
    assert client._session is None
    session = await client._ensure_session()
    assert session is not None
    assert client._session is session
    await client.close()


def test_top_level_import():
    from kbve.api import HttpClient as HC
    assert HC is HttpClient


def test_clients_re_export():
    from kbve.api.clients import HttpClient as HC
    assert HC is HttpClient
