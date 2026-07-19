"""The ``proto`` route — proto schema registry + drift report (JSON only).

Mirrors the ``ci-dashboard`` proto_drift job: regenerate the proto schemas,
build the registry via the codegen ``.mjs`` scripts, detect drift against the
committed generated sources, and merge the drift metadata into the registry
JSON. No MDX — the output feeds the proto dashboard's client fetch.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

from ..builder import BuildContext, BuildResult, PlanResult, repo_root_for
from ..router import route

_GEN_TIMEOUT = 300
_GENERATED_DIR = "packages/data/codegen/generated"


class ProtoAcquireError(Exception):
    """Raised when the proto registry cannot be regenerated."""


def _warn(msg: str) -> None:
    print("::warning::proto route: %s" % msg, file=sys.stderr)


def _run(cmd: list[str], cwd: Path, timeout: int = _GEN_TIMEOUT) -> str:
    proc = subprocess.run(
        cmd, cwd=str(cwd), capture_output=True, text=True, timeout=timeout
    )
    if proc.returncode != 0:
        raise ProtoAcquireError(
            "%s failed (exit %d): %s"
            % (" ".join(cmd), proc.returncode, proc.stderr.strip()[:300])
        )
    return proc.stdout


def _detect_drift(repo_root: Path) -> dict:
    """Diff the generated sources, ignoring the ``* Generated:`` timestamp."""
    diff = subprocess.run(
        ["git", "diff", "--", _GENERATED_DIR],
        cwd=str(repo_root),
        capture_output=True,
        text=True,
    ).stdout
    changed = False
    for line in diff.splitlines():
        if not line or line[0] not in "+-":
            continue
        if line.startswith(("+++", "---")):
            continue
        if line.lstrip("+-").strip().startswith("* Generated:"):
            continue
        changed = True
        break
    files: list[str] = []
    if changed:
        names = subprocess.run(
            ["git", "diff", "--name-only", "--", _GENERATED_DIR],
            cwd=str(repo_root),
            capture_output=True,
            text=True,
        ).stdout
        files = [f for f in names.splitlines() if f]
    return {"detected": changed, "files": files}


def _acquire(repo_root: Path) -> tuple[dict, dict]:
    _run(["npx", "tsx", "packages/data/codegen/gen-all.mjs"], repo_root)
    _run(
        ["npx", "prettier", "--write", "%s/*.ts" % _GENERATED_DIR],
        repo_root,
    )
    registry_json = _run(
        ["npx", "tsx", "packages/data/codegen/generate-proto-registry.mjs"],
        repo_root,
    )
    try:
        registry = json.loads(registry_json)
    except (ValueError, json.JSONDecodeError) as exc:
        raise ProtoAcquireError("registry output was not valid JSON (%s)" % exc)
    return registry, _detect_drift(repo_root)


@route("proto", "daily", needs=("node", "protoc"))
class ProtoRoute:
    def plan(self, ctx: BuildContext) -> PlanResult:
        return PlanResult(
            "proto", True, "regenerate (git-diff guard drops no-ops)", []
        )

    def build(self, ctx: BuildContext) -> BuildResult:
        repo_root = repo_root_for(ctx.content_root)
        registry = ctx.inputs.get("proto_registry")
        drift = ctx.inputs.get("proto_drift")
        if registry is None:
            try:
                registry, drift = _acquire(repo_root)
            except (ProtoAcquireError, subprocess.TimeoutExpired, OSError) as exc:
                _warn("%s — skipping proto regeneration" % exc)
                return BuildResult("proto", [], True, "acquire failed: %s" % exc)
        if drift is None:
            drift = {"detected": False, "files": []}

        data = dict(registry)
        data["checked_at"] = ctx.timestamp
        data["drift_detected"] = bool(drift.get("detected"))
        data["drift_files"] = list(drift.get("files", []))

        public_dir = Path(ctx.public_dir)
        json_out = public_dir / "nx-proto.json"
        if not ctx.dry_run:
            public_dir.mkdir(parents=True, exist_ok=True)
            with open(json_out, "w") as f:
                json.dump(data, f, indent=2)

        changed = [os.path.relpath(json_out, repo_root)]
        return BuildResult("proto", changed, False, "generated")
