"""Health check primitives for liveness and readiness probes.

Provides a composable ``HealthCheck`` that aggregates named checks
and exposes results as dicts (for JSON APIs) or as a FastAPI router.
"""

from __future__ import annotations

import time
from dataclasses import dataclass
from enum import Enum
from typing import Any, Callable


class HealthStatus(str, Enum):
    """Overall health status."""

    HEALTHY = "healthy"
    DEGRADED = "degraded"
    UNHEALTHY = "unhealthy"


@dataclass
class CheckResult:
    """Result of a single health check."""

    name: str
    healthy: bool
    message: str = ""
    duration_ms: float = 0.0


class HealthCheck:
    """Aggregates named health checks for liveness/readiness.

    Usage::

        hc = HealthCheck()
        hc.add("database", lambda: db.ping())
        hc.add("redis", lambda: redis.ping())

        result = await hc.run()
        # {"status": "healthy", "checks": [...], "uptime_s": 123.4}
    """

    def __init__(self) -> None:
        self._checks: list[tuple[str, Callable]] = []
        self._start_time = time.monotonic()

    def add(self, name: str, check_fn: Callable) -> "HealthCheck":
        """Register a named check function.

        *check_fn* should return True/truthy for healthy, or raise
        an exception for unhealthy. It can be sync or async.
        """
        self._checks.append((name, check_fn))
        return self

    async def run(self) -> dict[str, Any]:
        """Execute all checks and return an aggregate result."""
        import asyncio

        results: list[CheckResult] = []
        for name, fn in self._checks:
            start = time.monotonic()
            try:
                ret = fn()
                if asyncio.iscoroutine(ret):
                    ret = await ret
                healthy = bool(ret) if ret is not None else True
                msg = ""
            except Exception as exc:
                healthy = False
                msg = str(exc)
            elapsed = (time.monotonic() - start) * 1000
            results.append(CheckResult(
                name=name,
                healthy=healthy,
                message=msg,
                duration_ms=round(elapsed, 2),
            ))

        all_healthy = all(r.healthy for r in results)
        any_healthy = any(r.healthy for r in results)

        if all_healthy:
            status = HealthStatus.HEALTHY
        elif any_healthy:
            status = HealthStatus.DEGRADED
        else:
            status = HealthStatus.UNHEALTHY

        uptime = round(time.monotonic() - self._start_time, 1)

        return {
            "status": status.value,
            "uptime_s": uptime,
            "checks": [
                {
                    "name": r.name,
                    "healthy": r.healthy,
                    "message": r.message,
                    "duration_ms": r.duration_ms,
                }
                for r in results
            ],
        }

    def uptime_seconds(self) -> float:
        """Return seconds since this HealthCheck was created."""
        return round(time.monotonic() - self._start_time, 1)


def create_health_router(
    health_check: HealthCheck,
    path: str = "/health",
    liveness_path: str = "/health/live",
) -> Any:
    """Create a FastAPI APIRouter with health endpoints.

    - ``GET {path}`` — full health check with all probes
    - ``GET {liveness_path}`` — simple liveness (always 200)

    Returns an ``APIRouter`` instance ready to include in a FastAPI app.
    """
    from fastapi import APIRouter

    router = APIRouter()

    @router.get(path)
    async def health():
        return await health_check.run()

    @router.get(liveness_path)
    async def liveness():
        return {
            "status": "alive",
            "uptime_s": health_check.uptime_seconds(),
        }

    return router
