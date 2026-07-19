"""Repository activity pulse — commits, merged PRs, issues over a window.

Pulls the commit list (author leaderboard) plus merged-PR / opened / closed
issue counts from the GitHub REST + search APIs over a trailing window
(``GITHUB_TOKEN``). Fetching is tolerant; the pure :func:`aggregate` is
unit-tested via the route's ``inputs`` seam.
"""

from __future__ import annotations

import json
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone

OWNER = "KBVE"
REPO = "kbve"
API_BASE = "https://api.github.com"
API_VERSION = "2022-11-28"
USER_AGENT = "kbve-ci-daily-content-fetch/1.0"


def _headers(token: str) -> dict:
    return {
        "Accept": "application/vnd.github+json",
        "Authorization": f"Bearer {token}",
        "User-Agent": USER_AGENT,
        "X-GitHub-Api-Version": API_VERSION,
    }


def _next_link(header: str) -> str | None:
    for part in header.split(","):
        segs = [s.strip() for s in part.split(";")]
        if len(segs) >= 2 and 'rel="next"' in segs[1:]:
            url = segs[0].strip()
            if url.startswith("<") and url.endswith(">"):
                return url[1:-1]
    return None


def fetch_commits(token: str, since_iso: str, timeout: float = 30.0,
                  max_pages: int = 20) -> list[dict]:
    """Page ``/commits?since=<iso>`` into a flat list (capped)."""
    url = (f"{API_BASE}/repos/{OWNER}/{REPO}/commits"
           f"?since={urllib.parse.quote(since_iso)}&per_page=100")
    out: list[dict] = []
    pages = 0
    while url and pages < max_pages:
        req = urllib.request.Request(url, headers=_headers(token))
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            out.extend(json.load(resp))
            url = _next_link(resp.headers.get("Link") or "")
        pages += 1
    return out


def search_count(token: str, query: str, timeout: float = 30.0) -> dict:
    """Return ``{total, items}`` for a ``/search/issues`` query (first page)."""
    url = (f"{API_BASE}/search/issues"
           f"?q={urllib.parse.quote(query)}&per_page=20&sort=updated")
    req = urllib.request.Request(url, headers=_headers(token))
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        data = json.load(resp)
    return {"total": data.get("total_count", 0),
            "items": data.get("items", [])}


def _commit_author(c: dict) -> str:
    author = c.get("author")
    if isinstance(author, dict) and author.get("login"):
        return author["login"]
    commit = c.get("commit") or {}
    return (commit.get("author") or {}).get("name") or "unknown"


def aggregate(commits: list[dict], prs: dict, issues_opened: dict,
              issues_closed: dict, since_iso: str, days: int) -> dict:
    """Roll raw feeds into leaderboard + counts + recent lists."""
    by_author: dict[str, int] = {}
    recent_commits = []
    for c in commits:
        author = _commit_author(c)
        by_author[author] = by_author.get(author, 0) + 1
        commit = c.get("commit") or {}
        msg = (commit.get("message") or "").split("\n", 1)[0]
        recent_commits.append({
            "sha": (c.get("sha") or "")[:7],
            "author": author,
            "message": msg,
            "url": c.get("html_url"),
            "date": (commit.get("author") or {}).get("date"),
        })

    leaderboard = sorted(
        ({"author": a, "commits": n} for a, n in by_author.items()),
        key=lambda d: (-d["commits"], d["author"]),
    )[:10]

    recent_prs = [{
        "number": p.get("number"),
        "title": p.get("title"),
        "user": (p.get("user") or {}).get("login"),
        "url": p.get("html_url"),
    } for p in prs.get("items", [])[:10]]

    return {
        "window": {"days": days, "since": since_iso},
        "commits": {
            "total": len(commits),
            "authors": len(by_author),
            "leaderboard": leaderboard,
            "recent": recent_commits[:12],
        },
        "pull_requests": {
            "merged": prs.get("total", 0),
            "recent": recent_prs,
        },
        "issues": {
            "opened": issues_opened.get("total", 0),
            "closed": issues_closed.get("total", 0),
        },
    }


def since_iso(now_iso: str, days: int) -> str:
    """ISO-8601 for ``days`` before ``now_iso``."""
    try:
        now = datetime.fromisoformat(now_iso.replace("Z", "+00:00"))
    except ValueError:
        now = datetime.now(timezone.utc)
    return (now - timedelta(days=days)).strftime("%Y-%m-%dT%H:%M:%SZ")


def since_day(now_iso: str, days: int) -> str:
    """``YYYY-MM-DD`` for ``days`` before ``now_iso`` (search date filters)."""
    return since_iso(now_iso, days)[:10]
