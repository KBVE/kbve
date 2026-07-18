"""Builder — resolves the content root and drives routes.

``plan_all`` runs every route of a cadence read-only (for the router matrix);
``build_one`` executes a single route's edits (for the per-route fan-out).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date as _date
from pathlib import Path

from ..seo._pages import find_content_dir
from .router import get, select


@dataclass
class BuildContext:
    content_root: Path
    date: _date | None = None
    dry_run: bool = False
    inputs: dict = field(default_factory=dict)


@dataclass
class PlanResult:
    route: str
    needs_work: bool
    reason: str
    targets: list[str]


@dataclass
class BuildResult:
    route: str
    changed: list[str]
    skipped: bool
    note: str


class Builder:
    def __init__(
        self,
        content_root=None,
        date: _date | None = None,
        dry_run: bool = False,
        inputs: dict | None = None,
    ) -> None:
        if content_root is None:
            content_root = find_content_dir(None)
        self.content_root = Path(content_root)
        self.date = date
        self.dry_run = dry_run
        self.inputs = inputs or {}

    def _ctx(self) -> BuildContext:
        return BuildContext(
            content_root=self.content_root,
            date=self.date,
            dry_run=self.dry_run,
            inputs=self.inputs,
        )

    def plan_all(self, cadence: str) -> list[PlanResult]:
        results = []
        for r in select(cadence):
            plan = r.plan(self._ctx())
            if plan.needs_work:
                results.append(plan)
        return results

    def build_one(self, route_name: str) -> BuildResult:
        return get(route_name).build(self._ctx())
