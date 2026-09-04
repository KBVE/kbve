"""The ``activity`` route — repository pulse (commits/PRs/issues) MDX + JSON."""

from __future__ import annotations

import os
import sys

from ..activity import (
    aggregate,
    fetch_commits,
    search_count,
    since_day,
    since_iso,
)
from ..builder import BuildContext, BuildResult, PlanResult, emit_page
from ..render import (
    build_activity_payload,
    render_activity_json,
    render_activity_mdx,
)
from ..router import route

_WINDOW_DAYS = 7
_TIMEOUT = 30.0
_REPO = "repo:KBVE/kbve"


def _warn(msg: str) -> None:
    print("::warning::activity route: %s" % msg, file=sys.stderr)


def _acquire(ctx: BuildContext) -> dict | None:
    days = _WINDOW_DAYS
    start_iso = since_iso(ctx.timestamp, days)
    start_day = since_day(ctx.timestamp, days)

    seam = ctx.inputs.get("activity")
    if isinstance(seam, dict):
        return aggregate(
            seam.get("commits", []),
            seam.get("prs", {}),
            seam.get("issues_opened", {}),
            seam.get("issues_closed", {}),
            start_iso,
            days,
        )

    token = os.environ.get("GITHUB_TOKEN", "").strip()
    if not token:
        _warn("GITHUB_TOKEN not set — skipping activity sync")
        return None
    try:
        commits = fetch_commits(token, start_iso, timeout=_TIMEOUT)
        prs = search_count(token, f"{_REPO} is:pr is:merged merged:>={start_day}", _TIMEOUT)
        opened = search_count(token, f"{_REPO} is:issue created:>={start_day}", _TIMEOUT)
        closed = search_count(token, f"{_REPO} is:issue closed:>={start_day}", _TIMEOUT)
    except Exception as exc:  # noqa: BLE001 — degrade, never hard-fail
        _warn("activity fetch failed (%s)" % exc)
        return None
    return aggregate(commits, prs, opened, closed, start_iso, days)


@route("activity", "daily", needs=("token",))
class ActivityRoute:
    def plan(self, ctx: BuildContext) -> PlanResult:
        return PlanResult("activity", True, "regenerate (git-diff guard drops no-ops)", [])

    def build(self, ctx: BuildContext) -> BuildResult:
        payload = _acquire(ctx)
        if payload is None:
            return BuildResult("activity", [], True, "acquire failed")
        payload = build_activity_payload(payload, ctx.timestamp)

        return emit_page(
            ctx,
            "activity",
            page="activity.mdx",
            mdx_text=render_activity_mdx(payload, ctx.timestamp),
            json_name="nx-activity.json",
            json_text=render_activity_json(payload),
        )
