"""KBVE health check primitives for microservice deployments."""

from .checker import (  # noqa: F401
    HealthCheck,
    HealthStatus,
    CheckResult,
    create_health_router,
)
