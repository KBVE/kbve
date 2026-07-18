"""Route registry for the daily content pipeline.

Each content job registers a :class:`Route` pairing a ``plan`` (read-only work
detection) with a ``build`` (surgical edit + change report). The router selects
routes by cadence so a single scheduled workflow can fan out per route.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING, Callable

if TYPE_CHECKING:
    from .builder import BuildContext, BuildResult, PlanResult


@dataclass(frozen=True)
class Route:
    name: str
    cadence: str
    plan: Callable[["BuildContext"], "PlanResult"]
    build: Callable[["BuildContext"], "BuildResult"]


ROUTES: dict[str, Route] = {}


def route(name: str, cadence: str):
    """Class decorator registering a Route from ``plan``/``build`` methods."""

    def decorator(cls):
        instance = cls()
        ROUTES[name] = Route(
            name=name,
            cadence=cadence,
            plan=instance.plan,
            build=instance.build,
        )
        return cls

    return decorator


def select(cadence: str) -> list[Route]:
    """Return routes matching ``cadence``."""
    return [r for r in ROUTES.values() if r.cadence == cadence]


def get(name: str) -> Route:
    """Return the route named ``name`` or raise ``KeyError``."""
    try:
        return ROUTES[name]
    except KeyError:
        raise KeyError("unknown route: %s" % name) from None
