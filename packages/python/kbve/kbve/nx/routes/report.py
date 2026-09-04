"""The ``report`` route — workspace report dashboard (MDX + raw JSON).

Three feeds: the pinned toolchain versions, ``scc``/``cloc`` LOC statistics,
and per-package coverage. Renders the Bento MDX and writes ``report.json``,
which ``AstroWorkspaceReport`` reads. Each feed is tolerant — one failure
degrades to empty rather than losing the whole route.

This replaced a parse of ``nx report`` output. Two of its panels went with
it: the plugin inventory and the cache-usage figure, neither of which has
anything on the other side of the migration. The toolchain versions do, and
they come from .prototools, which is where they are pinned.
"""

from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path

from ..builder import BuildContext, BuildResult, PlanResult, emit_page, repo_root_for
from ..render import render_report_json, render_report_mdx
from ..router import route

_VERSION_TIMEOUT = 60
_QUERY_TIMEOUT = 120
_LOC_TIMEOUT = 600
_COVERAGE_TIMEOUT = 1800
_SCC_EXCLUDES = "node_modules,dist,.moon,.git,target,coverage,pumpkin,ergo,postgres"
_ANSI = re.compile(r"\x1b\[[0-9;]*m")


def _warn(msg: str) -> None:
    print("::warning::report route: %s" % msg, file=sys.stderr)


def _strip_ansi(text: str) -> str:
    return _ANSI.sub("", text)


def _acquire_toolchain(repo_root: Path) -> list[dict[str, str]]:
    """The pinned toolchain, read from .prototools.

    proto is the single place these versions are declared, and every runner --
    local and CI alike -- installs from it, so the file is the truth rather
    than whatever happens to be on this machine's PATH.
    """
    entries: list[dict[str, str]] = []
    try:
        for line in (repo_root / ".prototools").read_text().splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            name, _, version = line.partition("=")
            name = name.strip()
            version = version.strip().strip('"')
            if name and version and "." not in name:
                entries.append({"name": name, "version": version})
    except OSError as exc:
        _warn("could not read .prototools (%s)" % exc)

    try:
        proc = subprocess.run(
            ["uname", "-srm"],
            capture_output=True,
            text=True,
            timeout=_VERSION_TIMEOUT,
        )
        if proc.stdout.strip():
            entries.append({"name": "os", "version": proc.stdout.strip()})
    except (OSError, subprocess.SubprocessError):
        pass
    return entries


def _acquire_workspace(repo_root: Path) -> dict:
    """Project and task counts, straight off the moon graph."""
    try:
        proc = subprocess.run(
            ["moon", "query", "projects"],
            cwd=str(repo_root),
            check=True,
            capture_output=True,
            text=True,
            timeout=_QUERY_TIMEOUT,
        )
        projects = json.loads(proc.stdout).get("projects", [])
    except (OSError, subprocess.SubprocessError, ValueError) as exc:
        _warn("moon query failed (%s)" % exc)
        return {}

    by_language: dict[str, int] = {}
    tasks = 0
    for project in projects:
        by_language[project.get("language") or "unknown"] = by_language.get(project.get("language") or "unknown", 0) + 1
        tasks += len(project.get("tasks") or {})
    return {
        "projects": len(projects),
        "tasks": tasks,
        "by_language": dict(sorted(by_language.items(), key=lambda kv: -kv[1])),
    }


def _acquire_loc(repo_root: Path) -> str:
    try:
        proc = subprocess.run(
            [
                "scc",
                ".",
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
                "npx",
                "--yes",
                "cloc",
                ".",
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
                "moon",
                "run",
                "droid:coverage",
                "devops:coverage",
                "khashvault:coverage",
                "laser:coverage",
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
    toolchain = _acquire_toolchain(repo_root)
    workspace = _acquire_workspace(repo_root)
    if not toolchain and not workspace:
        return {}
    return {
        "generated_at": ctx.timestamp,
        "toolchain": toolchain,
        "workspace": workspace,
        "loc_stats": _acquire_loc(repo_root),
        "coverage": _acquire_coverage(repo_root) or None,
    }


@route("report", "daily", needs=("node", "moon"))
class ReportRoute:
    def plan(self, ctx: BuildContext) -> PlanResult:
        return PlanResult("report", True, "regenerate (git-diff guard drops no-ops)", [])

    def build(self, ctx: BuildContext) -> BuildResult:
        data = ctx.inputs.get("report_data")
        if not isinstance(data, dict):
            data = _acquire(ctx)
        if not data:
            _warn("report feeds all empty — skipping report regeneration")
            return BuildResult("report", [], True, "acquire failed")

        return emit_page(
            ctx,
            "report",
            page="report.mdx",
            mdx_text=render_report_mdx(data, ctx.timestamp),
            json_name="report.json",
            json_text=render_report_json(data),
        )
