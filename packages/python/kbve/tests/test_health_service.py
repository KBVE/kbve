"""Tests for the Health gRPC service."""

import pytest
from unittest.mock import MagicMock

from kbve.proto import kbve_pb2
from kbve.server.services.health_service import HealthServicer


@pytest.fixture
def servicer():
    return HealthServicer()


@pytest.fixture
def context():
    return MagicMock()


async def test_health_check_returns_serving(servicer, context):
    """Test that Health.Check returns SERVING status."""
    request = kbve_pb2.HealthCheckRequest()
    response = await servicer.Check(request, context)
    assert response.status == kbve_pb2.HealthCheckResponse.SERVING
