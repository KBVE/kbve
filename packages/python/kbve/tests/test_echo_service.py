"""Tests for the Echo gRPC service."""

import pytest
from unittest.mock import MagicMock

from kbve.proto import kbve_pb2
from kbve.server.services.echo_service import EchoServicer


@pytest.fixture
def servicer():
    return EchoServicer()


@pytest.fixture
def context():
    return MagicMock()


async def test_echo_ping_returns_same_message(servicer, context):
    """Test that Echo.Ping returns the same message."""
    request = kbve_pb2.EchoRequest(message="hello world")
    response = await servicer.Ping(request, context)
    assert response.message == "hello world"


async def test_echo_ping_empty_message(servicer, context):
    """Test that Echo.Ping handles empty messages."""
    request = kbve_pb2.EchoRequest(message="")
    response = await servicer.Ping(request, context)
    assert response.message == ""
