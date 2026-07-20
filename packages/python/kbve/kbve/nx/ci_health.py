"""Fetch and aggregate GitHub Actions run health for KBVE/kbve.

Pages the Actions ``runs`` REST endpoint over a trailing window (default 7
days) and rolls the runs up into per-workflow health: success rate, average
duration, and flaky count (a run that only went green on a re-run). The fetch
uses ``GITHUB_TOKEN``; the pure :func:`aggregate` is unit-tested via the
route's ``inputs`` seam.
"""

from __future__ import annotations

import json
import urllib.request
from datetime import datetime, timedelta, timezone

OWNER = "KBVE"
REPO = "kbve"
API_BASE = "https://api.github.com"
API_VERSION = "2022-11-28"
USER_AGENT = "kbve-ci-daily-content-fetch/1.0"

_TERMINAL = {"success", "failure", "cancelled", "skipped", "timed_out",
             "action_required", "neutral", "stale"}


def _next_link(header: str) -> str | None:
    for part in header.split(","):
        segs = [s.strip() for s in part.split(";")]
        if len(segs) >= 2 and 'rel="next"' in segs[1:]:
            url = segs[0].strip()
            if url.startswith("<") and url.endswith(">"):
                return url[1:-1]
    return None


def fetch_runs(token: str, since_date: str, per_page: int = 100,
               timeout: float = 30.0, max_pages: int = 40) -> list[dict]:
    """Page ``/actions/runs?created=>=<since_date>`` into one list."""
    url = (f"{API_BASE}/repos/{OWNER}/{REPO}/actions/runs"
           f"?per_page={per_page}&created=%3E%3D{since_date}")
    headers = {
        "Accept": "application/vnd.github+json",
        "Authorization": f"Bearer {token}",
        "User-Agent": USER_AGENT,
        "X-GitHub-Api-Version": API_VERSION,
    }
    runs: list[dict] = []
    pages = 0
    while url and pages < max_pages:
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            payload = json.load(resp)
            runs.extend(payload.get("workflow_runs", []))
            url = _next_link(resp.headers.get("Link") or "")
        pages += 1
    return runs


def _duration_s(run: dict) -> float | None:
    start = run.get("run_started_at")
    end = run.get("updated_at")
    if not start or not end:
        return None
    try:
        s = datetime.fromisoformat(start.replace("Z", "+00:00"))
        e = datetime.fromisoformat(end.replace("Z", "+00:00"))
    except ValueError:
        return None
    d = (e - s).total_seconds()
    return d if d >= 0 else None


def _blank() -> dict:
    return {"runs": 0, "success": 0, "failure": 0, "cancelled": 0,
            "skipped": 0, "other": 0, "flaky": 0, "_dur": []}


def _bucket_conclusion(acc: dict, concl: str | None) -> None:
    if concl == "success":
        acc["success"] += 1
    elif concl == "failure":
        acc["failure"] += 1
    elif concl == "cancelled":
        acc["cancelled"] += 1
    elif concl == "skipped":
        acc["skipped"] += 1
    else:
        acc["other"] += 1


def _rate(success: int, failure: int) -> float:
    denom = success + failure
    return round(success / denom * 100, 1) if denom else 0.0


def _finalize(acc: dict) -> dict:
    durs = acc.pop("_dur")
    avg = round(sum(durs) / len(durs)) if durs else 0
    acc["success_rate"] = _rate(acc["success"], acc["failure"])
    acc["avg_duration_s"] = avg
    return acc


def aggregate(runs: list[dict], since_iso: str, now_iso: str,
              days: int = 7) -> dict:
    """Roll raw runs into totals + per-workflow health + recent failures."""
    try:
        now = datetime.fromisoformat(now_iso.replace("Z", "+00:00"))
    except ValueError:
        now = datetime.now(timezone.utc)
    day_ago = now - timedelta(days=1)

    totals = _blank()
    per_wf: dict[str, dict] = {}
    t24 = {"runs": 0, "success": 0, "failure": 0}
    failures: list[dict] = []

    for run in runs:
        concl = run.get("conclusion")
        name = run.get("name") or "(unnamed)"
        attempt = run.get("run_attempt") or 1
        dur = _duration_s(run)

        totals["runs"] += 1
        _bucket_conclusion(totals, concl)
        if dur is not None:
            totals["_dur"].append(dur)

        wf = per_wf.setdefault(name, _blank())
        wf["runs"] += 1
        _bucket_conclusion(wf, concl)
        if dur is not None:
            wf["_dur"].append(dur)

        if concl == "success" and attempt > 1:
            totals["flaky"] += 1
            wf["flaky"] += 1

        started = run.get("run_started_at")
        if started:
            try:
                ts = datetime.fromisoformat(started.replace("Z", "+00:00"))
            except ValueError:
                ts = None
            if ts and ts >= day_ago:
                t24["runs"] += 1
                if concl == "success":
                    t24["success"] += 1
                elif concl == "failure":
                    t24["failure"] += 1

        if concl == "failure":
            failures.append({
                "name": name,
                "branch": run.get("head_branch"),
                "event": run.get("event"),
                "url": run.get("html_url"),
                "finished_at": run.get("updated_at"),
            })

    workflows = [{"name": n, **_finalize(a)} for n, a in per_wf.items()]
    workflows.sort(key=lambda w: (-w["runs"], w["name"]))

    failures.sort(key=lambda f: f.get("finished_at") or "", reverse=True)

    return {
        "window": {"days": days, "since": since_iso},
        "totals": _finalize(totals),
        "totals_24h": {**t24, "success_rate": _rate(
            t24["success"], t24["failure"])},
        "workflows": workflows,
        "recent_failures": failures[:15],
    }


def since_date(now_iso: str, days: int = 7) -> str:
    """``YYYY-MM-DD`` for ``days`` before ``now_iso`` (for the created filter)."""
    try:
        now = datetime.fromisoformat(now_iso.replace("Z", "+00:00"))
    except ValueError:
        now = datetime.now(timezone.utc)
    return (now - timedelta(days=days)).strftime("%Y-%m-%d")
