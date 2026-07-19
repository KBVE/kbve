"""The ``report`` route — Nx workspace report dashboard (MDX + raw JSON).

Mirrors the ``ci-dashboard`` report job: acquire ``pnpm nx report`` (versions),
``scc``/``cloc`` LOC statistics, and per-package coverage as raw text, then
render the Bento MDX + the frozen ``nx-report.json`` contract consumed by
``AstroNxReport``. Each feed is tolerant — a single failure degrades to empty
rather than hard-failing the whole route.
"""

from __future__ import annotations

import os
import re
import subprocess
import sys
from pathlib import Path

from ..builder import BuildContext, BuildResult, PlanResult, repo_root_for
from ..render import parse_report, render_report_json, render_report_mdx
from ..router import route

_NX_REPORT_TIMEOUT = 120
_LOC_TIMEOUT = 600
_COVERAGE_TIMEOUT = 1800
_SCC_EXCLUDES = "node_modules,dist,.nx,.git,target,coverage,pumpkin,ergo,postgres"
_ANSI = re.compile(r"\x1b\[[0-9;]*m")


def _warn(msg: str) -> None:
    print("::warning::report route: %s" % msg, file=sys.stderr)


def _strip_ansi(text: str) -> str:
    return _ANSI.sub("", text)


def _acquire_nx_report(repo_root: Path) -> str:
    try:
        proc = subprocess.run(
            ["pnpm", "nx", "report"],
            cwd=str(repo_root),
            capture_output=True,
            text=True,
            timeout=_NX_REPORT_TIMEOUT,
        )
        return _strip_ansi(proc.stdout + proc.stderr)
    except (OSError, subprocess.SubprocessError) as exc:
        _warn("nx report failed (%s)" % exc)
        return ""


def _acquire_loc(repo_root: Path) -> str:
    try:
        proc = subprocess.run(
            [
                "scc", ".",
                "--exclude-dir=%s" % _SCC_EXCLUDES,
                "--no-cocomo",
            ],
            cwd=str(repo_root),
            capture_output=True,
            text=True,
            timeout=_LOC_TIMEOUT,
        )
        text = _strip_ansi(proc.stdout + proc.stderr)
        if text.strip():
            return text
    except FileNotFoundError:
        _warn("scc not found — falling back to cloc")
    except (OSError, subprocess.SubprocessError) as exc:
        _warn("scc failed (%s) — falling back to cloc" % exc)

    try:
        proc = subprocess.run(
            [
                "npx", "--yes", "cloc", ".",
                "--exclude-dir=%s" % _SCC_EXCLUDES,
            ],
            cwd=str(repo_root),
            capture_output=True,
            text=True,
            timeout=_LOC_TIMEOUT,
        )
        return _strip_ansi(proc.stdout + proc.stderr)
    except (OSError, subprocess.SubprocessError) as exc:
        _warn("cloc failed (%s) — LOC stats empty" % exc)
        return ""


def _acquire_coverage(repo_root: Path) -> str:
    try:
        proc = subprocess.run(
            [
                "pnpm", "nx", "run-many", "-t", "coverage",
                "--projects=droid,devops,khashvault,laser",
            ],
            cwd=str(repo_root),
            capture_output=True,
            text=True,
            timeout=_COVERAGE_TIMEOUT,
        )
        return _strip_ansi(proc.stdout + proc.stderr)
    except subprocess.TimeoutExpired:
        _warn("coverage timed out — coverage empty")
        return ""
    except (OSError, subprocess.SubprocessError) as exc:
        _warn("coverage failed (%s) — coverage empty" % exc)
        return ""


def _acquire(ctx: BuildContext) -> dict:
    repo_root = repo_root_for(ctx.content_root)
    raw = _acquire_nx_report(repo_root)
    if not raw.strip():
        return {}
    loc_text = _acquire_loc(repo_root)
    cov_text = _acquire_coverage(repo_root)
    return {
        "generated_at": ctx.timestamp,
        "environment": parse_report(raw),
        "nx_report": raw,
        "loc_stats": loc_text,
        "coverage": cov_text or None,
    }


@route("report", "daily", needs=("node",))
class ReportRoute:
    def plan(self, ctx: BuildContext) -> PlanResult:
        return PlanResult(
            "report", True, "regenerate (git-diff guard drops no-ops)", []
        )

    def build(self, ctx: BuildContext) -> BuildResult:
        data = ctx.inputs.get("report_data")
        if not isinstance(data, dict):
            data = _acquire(ctx)
        if not data:
            _warn("nx report empty — skipping report regeneration")
            return BuildResult("report", [], True, "acquire failed")

        public_dir = Path(ctx.public_dir)
        content_root = Path(ctx.content_root)
        json_out = public_dir / "nx-report.json"
        mdx_out = content_root / "dashboard" / "report.mdx"

        if not ctx.dry_run:
            public_dir.mkdir(parents=True, exist_ok=True)
            mdx_out.parent.mkdir(parents=True, exist_ok=True)
            with open(json_out, "w") as f:
                f.write(render_report_json(data))
            with open(mdx_out, "w") as f:
                f.write(render_report_mdx(data, ctx.timestamp))

        repo_root = repo_root_for(content_root)
        changed = [
            os.path.relpath(mdx_out, repo_root),
            os.path.relpath(json_out, repo_root),
        ]
        return BuildResult("report", changed, False, "generated")
