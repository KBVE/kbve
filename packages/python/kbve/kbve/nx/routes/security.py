"""The ``security`` route — multi-ecosystem audit dashboard (MDX + JSON).

Mirrors the ``ci-dashboard`` security job: acquire raw audit payloads from
pnpm/cargo/pip-audit and the GitHub alerts feeds (tolerant fallbacks, never
hard-fail on one feed), parse via :func:`parse_all_ecosystems`, and render
the Starlight MDX + structured JSON with output parity to
``scripts/nx-security-to-mdx.py``.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

from ..alerts import ENDPOINTS, fetch_all, validate
from ..builder import BuildContext, BuildResult, PlanResult, repo_root_for
from ..render import render_security_json, render_security_mdx
from ..router import route
from ..security import parse_all_ecosystems

_NPM_FALLBACK: dict = {"advisories": {}}
_CARGO_FALLBACK: dict = {"vulnerabilities": {"found": 0}, "warnings": {}}
_AUDIT_TIMEOUT = 120


def _warn(msg: str) -> None:
    print("::warning::security route: %s" % msg, file=sys.stderr)


def _run_json(cmd: list[str], cwd: Path, fallback, timeout: int = _AUDIT_TIMEOUT):
    """Run ``cmd`` and parse stdout as JSON; degrade to ``fallback``.

    Audit tools exit non-zero when findings exist — that is fine, we still
    parse stdout. A missing binary, a hang, or non-JSON output degrades to the
    empty fallback with a ``::warning::`` so an all-zero dashboard is never
    silently mistaken for "secure".
    """
    tool = cmd[0]
    try:
        proc = subprocess.run(
            cmd, cwd=str(cwd), capture_output=True, text=True, timeout=timeout
        )
        return json.loads(proc.stdout)
    except FileNotFoundError:
        _warn("%s not found — using empty fallback" % tool)
        return fallback
    except subprocess.TimeoutExpired:
        _warn("%s timed out after %ss — using empty fallback" % (tool, timeout))
        return fallback
    except (OSError, ValueError, json.JSONDecodeError):
        _warn("%s produced no valid JSON — using empty fallback" % tool)
        return fallback


def _acquire_npm(repo_root: Path):
    return _run_json(["pnpm", "audit", "--json"], repo_root, _NPM_FALLBACK)


def _acquire_cargo(repo_root: Path):
    return _run_json(["cargo", "audit", "--json"], repo_root, _CARGO_FALLBACK)


def _acquire_python(repo_root: Path):
    pkg_root = repo_root / "packages" / "python"
    cwd = pkg_root if pkg_root.is_dir() else repo_root
    return _run_json(["pip-audit", "--format=json"], cwd, [])


def _acquire_alerts(endpoint: str):
    token = os.environ.get("GITHUB_TOKEN", "").strip()
    if not token:
        return []
    try:
        raw = fetch_all(ENDPOINTS[endpoint], token, 100, 30.0)
        return validate(raw)
    except Exception as exc:
        _warn("%s alert feed failed (%s) — using empty fallback" % (endpoint, exc))
        return []


def _acquire(ctx: BuildContext) -> dict:
    repo_root = repo_root_for(ctx.content_root)
    raw = {
        "npm": _acquire_npm(repo_root),
        "cargo": _acquire_cargo(repo_root),
        "python": _acquire_python(repo_root),
        "codeql": _acquire_alerts("code-scanning"),
        "dependabot": _acquire_alerts("dependabot"),
    }
    if ctx.workdir is not None:
        workdir = Path(ctx.workdir)
        workdir.mkdir(parents=True, exist_ok=True)
        for name, piece in raw.items():
            with open(workdir / ("nx-security-%s.json" % name), "w") as f:
                json.dump(piece, f, indent=2)
    return raw


@route("security", "on-demand", needs=("node", "rust", "python", "token"))
class SecurityRoute:
    def plan(self, ctx: BuildContext) -> PlanResult:
        return PlanResult(
            "security", True, "regenerate (git-diff guard drops no-ops)", []
        )

    def build(self, ctx: BuildContext) -> BuildResult:
        raw = ctx.inputs.get("raw") or ctx.inputs.get("security_raw")
        if raw is None:
            raw = _acquire(ctx)

        parsed = parse_all_ecosystems(raw)
        data = {
            "generated_at": ctx.timestamp,
            "summary": parsed["summary"],
            "ecosystems": parsed["ecosystems"],
        }

        public_dir = Path(ctx.public_dir)
        content_root = Path(ctx.content_root)
        json_out = public_dir / "nx-security.json"
        mdx_out = content_root / "dashboard" / "security.mdx"

        if not ctx.dry_run:
            public_dir.mkdir(parents=True, exist_ok=True)
            mdx_out.parent.mkdir(parents=True, exist_ok=True)
            with open(json_out, "w") as f:
                f.write(render_security_json(data))
            with open(mdx_out, "w") as f:
                f.write(render_security_mdx(data, ctx.timestamp))

        repo_root = repo_root_for(content_root)
        changed = [
            os.path.relpath(mdx_out, repo_root),
            os.path.relpath(json_out, repo_root),
        ]
        return BuildResult("security", changed, False, "generated")
