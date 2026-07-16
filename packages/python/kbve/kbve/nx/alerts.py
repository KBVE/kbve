"""Fetch GitHub security alerts (code-scanning or dependabot) for KBVE/kbve.

The fetch/pagination/validation logic that feeds
:func:`kbve.nx.security.parse_codeql` and
:func:`kbve.nx.security.parse_dependabot`. Client-side pagination via the
``Link: rel="next"`` header stitches paged arrays into one JSON document
(avoiding the ``gh api --paginate`` concatenated-payload quirk).
"""

from __future__ import annotations

import json
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


def fetch_all(path: str, token: str, per_page: int,
              timeout: float) -> list[dict[str, Any]]:
    """Page through a GitHub REST endpoint that returns arrays.

    Uses the ``Link: rel="next"`` header for pagination, stitched
    client-side into one JSON array.
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
    """Parse ``Link: <url>; rel="next", ...`` into the next URL."""
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
    """Keep only open alert-shaped dict entries; skip (not fail) the rest."""
    clean: list[dict[str, Any]] = []
    for a in alerts:
        if isinstance(a, dict) and a.get("state") == "open":
            clean.append(a)
    return clean
