#!/usr/bin/env python3
"""
Fetch GitHub security alerts (code-scanning or dependabot) for KBVE/kbve.

Replaces inline shell in .github/workflows/ci-dashboard.yml so that:
  * pagination is handled by the Python script (no `gh api --paginate`
    quirks that emit one JSON array per page → invalid combined doc)
  * no shell interpolation of intermediate paths (security boundary)
  * schema validation lives next to the fetch logic
  * the script is unit-testable and re-runnable outside CI

Exit codes:
  0  success — JSON array of open alerts written to --out
  2  fetch failed (HTTP error, schema mismatch, etc.) — empty `[]`
     written so downstream aggregate step still succeeds

MIGRATION (pending): ported into the ``kbve`` Python package as
``kbve.nx.alerts`` (fetch/pagination/validation) with CLI
``kbve-nx-alerts`` (kbve/nx/cli.py), same flags and exit codes, covered by
tests/test_nx_alerts.py. This file remains the authoritative runner until
ci-dashboard.yml flips from ``python3 scripts/fetch-github-alerts.py`` to
``uv run kbve-nx-alerts``. Keep the two in sync until then.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.request
from typing import Any

OWNER = "KBVE"
REPO = "kbve"
API_BASE = "https://api.github.com"
API_VERSION = "2022-11-28"
USER_AGENT = "kbve-ci-dashboard-fetch/1.0"

ENDPOINTS = {
    "code-scanning": f"/repos/{OWNER}/{REPO}/code-scanning/alerts",
    "dependabot": f"/repos/{OWNER}/{REPO}/dependabot/alerts",
}


def fetch_all(path: str, token: str, per_page: int, timeout: float) -> list[dict[str, Any]]:
    """Page through a GitHub REST endpoint that returns arrays.

    Uses the Link: rel=\"next\" header for pagination — the same contract
    `gh api --paginate` follows, but stitched together client-side so we
    end up with one JSON array instead of N concatenated payloads.
    """
    url = f"{API_BASE}{path}?per_page={per_page}&state=open"
    out: list[dict[str, Any]] = []
    headers = {
        "Accept": "application/vnd.github+json",
        "Authorization": f"Bearer {token}",
        "User-Agent": USER_AGENT,
        "X-GitHub-Api-Version": API_VERSION,
    }
    while url:
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            payload = json.load(resp)
            if not isinstance(payload, list):
                raise ValueError(
                    f"expected list, got {type(payload).__name__}")
            out.extend(payload)
            url = next_link(resp.headers.get("Link") or "")
    return out


def next_link(header: str) -> str | None:
    """Parse Link: <url>; rel=\"next\", ..."""
    for part in header.split(","):
        segments = [s.strip() for s in part.split(";")]
        if len(segments) < 2:
            continue
        if 'rel="next"' in segments[1:]:
            url = segments[0].strip()
            if url.startswith("<") and url.endswith(">"):
                return url[1:-1]
    return None


def validate(alerts: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Drop entries that don't look like alert objects.

    GitHub's API has been stable on `state` since 2022, but the schema
    check keeps the downstream aggregate step honest if shape ever
    drifts. Bad entries are skipped, not failed — partial data beats
    nothing.
    """
    clean: list[dict[str, Any]] = []
    for a in alerts:
        if isinstance(a, dict) and a.get("state") == "open":
            clean.append(a)
    return clean


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--endpoint",
        required=True,
        choices=sorted(ENDPOINTS),
        help="Which security feed to fetch.",
    )
    parser.add_argument(
        "--out",
        required=True,
        help="Where to write the filtered JSON array.",
    )
    parser.add_argument(
        "--per-page",
        type=int,
        default=100,
        help="Pagination size (max 100 per GitHub).",
    )
    parser.add_argument(
        "--timeout",
        type=float,
        default=30.0,
        help="Per-request timeout in seconds.",
    )
    args = parser.parse_args()

    token = os.environ.get("GITHUB_TOKEN", "").strip()
    if not token:
        print("::error::GITHUB_TOKEN env not set", file=sys.stderr)
        with open(args.out, "w") as f:
            json.dump([], f)
        return 2

    path = ENDPOINTS[args.endpoint]
    try:
        raw = fetch_all(path, token, args.per_page, args.timeout)
    except urllib.error.HTTPError as e:
        if e.code in (403, 404):
            print(
                f"::notice::{args.endpoint} returned HTTP {e.code} — assuming zero alerts",
                file=sys.stderr,
            )
            with open(args.out, "w") as f:
                json.dump([], f)
            return 0
        print(
            f"::error::{args.endpoint} HTTP {e.code}: {e.reason}", file=sys.stderr)
        with open(args.out, "w") as f:
            json.dump([], f)
        return 2
    except (urllib.error.URLError, ValueError, json.JSONDecodeError) as e:
        print(f"::warning::{args.endpoint} fetch failed: {e}", file=sys.stderr)
        with open(args.out, "w") as f:
            json.dump([], f)
        return 2

    clean = validate(raw)
    with open(args.out, "w") as f:
        json.dump(clean, f, indent=2)
    print(f"{args.endpoint}: {len(clean)} open alerts")
    return 0


if __name__ == "__main__":
    sys.exit(main())
