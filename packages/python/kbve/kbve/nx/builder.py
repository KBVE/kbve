"""Builder — resolves the content root and drives routes.

``plan_all`` runs every route of a cadence read-only (for the router matrix);
``build_one`` executes a single route's edits (for the per-route fan-out).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date as _date
from datetime import datetime, timezone
from pathlib import Path

from ..seo._pages import find_content_dir
from .router import get, select


@dataclass
class BuildContext:
    content_root: Path
    date: _date | None = None
    dry_run: bool = False
    inputs: dict = field(default_factory=dict)
    public_dir: Path | None = None
    workdir: Path | None = None
    timestamp: str | None = None


def public_dir_for(content_root: Path) -> Path:
    """Default public data dir for a content root.

    ``content_root`` is ``apps/kbve/astro-kbve/src/content/docs``; the Astro
    public data dir is ``apps/kbve/astro-kbve/public/data/nx`` — three parents
    up from ``docs`` (``docs`` → ``content`` → ``src`` → ``astro-kbve``).
    """
    return Path(content_root).parent.parent.parent / "public" / "data" / "nx"


def repo_root_for(content_root: Path) -> Path:
    """Walk up from ``content_root`` to the monorepo root (holds ``nx.json``)."""
    p = Path(content_root).resolve()
    for cand in [p, *p.parents]:
        if (cand / "nx.json").exists() or (cand / "pnpm-workspace.yaml").exists():
            return cand
    return p


def default_timestamp() -> str:
    """ISO-8601 UTC timestamp (``YYYY-MM-DDTHH:MM:SSZ``)."""
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


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
        public_dir=None,
        workdir=None,
        timestamp: str | None = None,
    ) -> None:
        if content_root is None:
            content_root = find_content_dir(None)
        self.content_root = Path(content_root)
        self.date = date
        self.dry_run = dry_run
        self.inputs = inputs or {}
        self.public_dir = Path(public_dir) if public_dir else None
        self.workdir = Path(workdir) if workdir else None
        self.timestamp = timestamp

    def _ctx(self) -> BuildContext:
        public_dir = self.public_dir or public_dir_for(self.content_root)
        timestamp = self.timestamp or default_timestamp()
        return BuildContext(
            content_root=self.content_root,
            date=self.date,
            dry_run=self.dry_run,
            inputs=self.inputs,
            public_dir=public_dir,
            workdir=self.workdir,
            timestamp=timestamp,
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
