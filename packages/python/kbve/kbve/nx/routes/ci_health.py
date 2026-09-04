"""The ``ci_health`` route — GitHub Actions run health (MDX + raw JSON).

Pages the Actions ``runs`` REST endpoint over a trailing 7-day window
(``GITHUB_TOKEN``) and rolls it into per-workflow health — success rate,
average duration, flaky count — then renders the Bento MDX + companion JSON.
A missing token or a fetch error degrades to a graceful skip.
"""

from __future__ import annotations

import os
import sys

from ..builder import BuildContext, BuildResult, PlanResult, emit_page
from ..ci_health import aggregate, fetch_runs, since_date
from ..render import (
    build_ci_health_payload,
    render_ci_health_json,
    render_ci_health_mdx,
)
from ..router import route

_WINDOW_DAYS = 7
_FETCH_TIMEOUT = 30.0


def _warn(msg: str) -> None:
    print("::warning::ci_health route: %s" % msg, file=sys.stderr)


def _acquire(ctx: BuildContext) -> dict | None:
    since = since_date(ctx.timestamp, _WINDOW_DAYS)
    seam = ctx.inputs.get("ci_runs")
    if isinstance(seam, list):
        runs = seam
    else:
        token = os.environ.get("GITHUB_TOKEN", "").strip()
        if not token:
            _warn("GITHUB_TOKEN not set — skipping CI health sync")
            return None
        try:
            runs = fetch_runs(token, since, timeout=_FETCH_TIMEOUT)
        except Exception as exc:  # noqa: BLE001 — degrade, never hard-fail
            _warn("runs fetch failed (%s)" % exc)
            return None

    agg = aggregate(runs, since, ctx.timestamp, days=_WINDOW_DAYS)
    return build_ci_health_payload(agg, ctx.timestamp)


@route("ci-health", "daily", needs=("token",))
class CiHealthRoute:
    def plan(self, ctx: BuildContext) -> PlanResult:
        return PlanResult("ci-health", True, "regenerate (git-diff guard drops no-ops)", [])

    def build(self, ctx: BuildContext) -> BuildResult:
        payload = _acquire(ctx)
        if payload is None:
            return BuildResult("ci-health", [], True, "acquire failed")

        return emit_page(
            ctx,
            "ci-health",
            page="ci-health.mdx",
            mdx_text=render_ci_health_mdx(payload, ctx.timestamp),
            json_name="nx-ci-health.json",
            json_text=render_ci_health_json(payload),
        )
