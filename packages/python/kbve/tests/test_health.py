"""Tests for kbve.health module."""

import asyncio

import pytest

from kbve.health.checker import (
    CheckResult,
    HealthCheck,
    HealthStatus,
)


@pytest.fixture
def hc():
    return HealthCheck()


# ── HealthCheck basics ───────────────────────────────────────────────

def test_health_check_empty(hc):
    result = asyncio.get_event_loop().run_until_complete(hc.run())
    assert result["status"] == "healthy"
    assert result["checks"] == []
    assert "uptime_s" in result


def test_health_check_all_healthy(hc):
    hc.add("a", lambda: True)
    hc.add("b", lambda: True)
    result = asyncio.get_event_loop().run_until_complete(hc.run())
    assert result["status"] == "healthy"
    assert len(result["checks"]) == 2
    assert all(c["healthy"] for c in result["checks"])


def test_health_check_one_unhealthy(hc):
    hc.add("ok", lambda: True)
    hc.add("bad", lambda: False)
    result = asyncio.get_event_loop().run_until_complete(hc.run())
    assert result["status"] == "degraded"


def test_health_check_all_unhealthy(hc):
    hc.add("bad1", lambda: False)
    hc.add("bad2", lambda: False)
    result = asyncio.get_event_loop().run_until_complete(hc.run())
    assert result["status"] == "unhealthy"


def test_health_check_exception(hc):
    def failing():
        raise ConnectionError("db down")

    hc.add("db", failing)
    result = asyncio.get_event_loop().run_until_complete(hc.run())
    assert result["status"] == "unhealthy"
    assert result["checks"][0]["healthy"] is False
    assert "db down" in result["checks"][0]["message"]


def test_health_check_async_fn(hc):
    async def async_check():
        return True

    hc.add("async", async_check)
    result = asyncio.get_event_loop().run_until_complete(hc.run())
    assert result["status"] == "healthy"
    assert result["checks"][0]["name"] == "async"


def test_health_check_async_exception(hc):
    async def async_fail():
        raise RuntimeError("timeout")

    hc.add("fail", async_fail)
    result = asyncio.get_event_loop().run_until_complete(hc.run())
    assert result["checks"][0]["healthy"] is False
    assert "timeout" in result["checks"][0]["message"]


def test_health_check_none_return(hc):
    hc.add("none", lambda: None)
    result = asyncio.get_event_loop().run_until_complete(hc.run())
    assert result["checks"][0]["healthy"] is True


def test_health_check_duration(hc):
    hc.add("fast", lambda: True)
    result = asyncio.get_event_loop().run_until_complete(hc.run())
    assert result["checks"][0]["duration_ms"] >= 0


def test_health_check_chaining(hc):
    result = hc.add("a", lambda: True).add("b", lambda: True)
    assert result is hc


def test_uptime_seconds(hc):
    uptime = hc.uptime_seconds()
    assert uptime >= 0


# ── HealthStatus enum ────────────────────────────────────────────────

def test_health_status_values():
    assert HealthStatus.HEALTHY.value == "healthy"
    assert HealthStatus.DEGRADED.value == "degraded"
    assert HealthStatus.UNHEALTHY.value == "unhealthy"


# ── CheckResult ──────────────────────────────────────────────────────

def test_check_result_defaults():
    cr = CheckResult(name="test", healthy=True)
    assert cr.message == ""
    assert cr.duration_ms == 0.0
