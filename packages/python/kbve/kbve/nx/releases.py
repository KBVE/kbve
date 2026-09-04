"""Release radar — what has shipped and what is waiting.

The release act is a git tag (``<moon id>@<semver>``) and the declaration is
the project's version manifest, so "has this shipped?" is a question about the
relationship between the two. ``tools/release/status.mjs`` already answers it
against the moon graph and the tag list; this reads that answer rather than
re-deriving it from a second source.

The registry comparison this used to make read ``.github/ci-dispatch-manifest.json``,
which the tag-based release pipeline deleted.
"""

from __future__ import annotations

import json
import subprocess
from pathlib import Path

STATUS_TIMEOUT = 300

STATES = (
    "tag-pending",
    "changes-unreleased",
    "manifest-behind",
    "no-version",
    "never-released",
    "current",
)

STATE_LABEL = {
    "tag-pending": "Tag pending",
    "changes-unreleased": "Changes unreleased",
    "manifest-behind": "Manifest behind",
    "no-version": "No version",
    "never-released": "Never released",
    "current": "Current",
}


class StatusError(Exception):
    """Raised when ``release-tools:status`` cannot be run or parsed."""


def status_rows(repo_root: Path, timeout: float = STATUS_TIMEOUT) -> list[dict]:
    """Run ``moon run release-tools:status -- --json`` and return its rows."""
    try:
        out = subprocess.run(
            ["moon", "run", "release-tools:status", "--", "--json"],
            cwd=str(repo_root),
            check=True,
            capture_output=True,
            text=True,
            timeout=timeout,
        ).stdout
    except (OSError, subprocess.SubprocessError) as exc:
        raise StatusError("release-tools:status failed (%s)" % exc) from exc

    # moon frames task output; the payload is the JSON array the task printed.
    start = out.find("[")
    end = out.rfind("]")
    if start < 0 or end < start:
        raise StatusError("no JSON array in release-tools:status output")
    try:
        rows = json.loads(out[start : end + 1])
    except json.JSONDecodeError as exc:
        raise StatusError("unparsable release-tools:status output (%s)" % exc) from exc
    if not isinstance(rows, list):
        raise StatusError("release-tools:status did not return a list")
    return rows


def aggregate(rows: list[dict]) -> dict:
    """Summarize status rows into per-state counts and per-lane totals."""
    summary = {s: 0 for s in STATES}
    per_lane: dict[str, dict] = {}
    normalized: list[dict] = []

    for row in rows:
        state = row.get("state") or "no-version"
        summary[state] = summary.get(state, 0) + 1
        lanes = [lane for lane in (row.get("lanes") or "").split(",") if lane]
        for lane in lanes:
            acc = per_lane.setdefault(lane, {"total": 0, "waiting": 0})
            acc["total"] += 1
            if state in ("tag-pending", "changes-unreleased"):
                acc["waiting"] += 1
        normalized.append(
            {
                "project": row.get("project", ""),
                "lanes": lanes,
                "manifest": row.get("manifest"),
                "released": row.get("released"),
                "commits_since": row.get("commitsSince"),
                "state": state,
            }
        )

    normalized.sort(key=lambda r: (STATES.index(r["state"]) if r["state"] in STATES else len(STATES), r["project"]))
    return {
        "summary": summary,
        "lanes": dict(sorted(per_lane.items(), key=lambda kv: -kv[1]["total"])),
        "rows": normalized,
        "total": len(normalized),
        "waiting": summary.get("tag-pending", 0) + summary.get("changes-unreleased", 0),
    }
