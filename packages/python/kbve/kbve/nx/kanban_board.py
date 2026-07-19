"""Fetch and bucket the KBVE Projects v2 board (org KBVE, project #5).

Mirrors the ``ci-dashboard`` kanban ``github-script`` step: a paginated
GraphQL walk of the org project, then a bucket of each item into one of the
nine board columns keyed by its ``Status`` single-select field. The
``UNITY_PAT`` token (org Projects read) drives the fetch; parsing/bucketing
is pure so it is unit-tested via the route's ``inputs`` seam.
"""

from __future__ import annotations

import json
import urllib.error
import urllib.request
from typing import Any

ORG = "KBVE"
PROJECT_NUMBER = 5
GRAPHQL_URL = "https://api.github.com/graphql"
USER_AGENT = "kbve-ci-daily-content-fetch/1.0"

COLUMNS = [
    "Theory", "AI", "Todo", "Backlog", "Error",
    "Support", "Staging", "Review", "Done",
]

VIEWS = {
    "kanban": {"number": 1,
               "url": "https://github.com/orgs/KBVE/projects/5/views/1"},
    "task": {"number": 2,
             "url": "https://github.com/orgs/KBVE/projects/5/views/2"},
    "map": {"number": 3,
            "url": "https://github.com/orgs/KBVE/projects/5/views/3"},
}

_QUERY = """
query($org: String!, $num: Int!, $cursor: String) {
  organization(login: $org) {
    projectV2(number: $num) {
      title
      url
      items(first: 100, after: $cursor) {
        pageInfo { hasNextPage endCursor }
        nodes {
          type
          fieldValues(first: 15) {
            nodes {
              ... on ProjectV2ItemFieldTextValue {
                text
                field { ... on ProjectV2Field { name } }
              }
              ... on ProjectV2ItemFieldSingleSelectValue {
                name
                field { ... on ProjectV2SingleSelectField { name } }
              }
              ... on ProjectV2ItemFieldDateValue {
                date
                field { ... on ProjectV2Field { name } }
              }
              ... on ProjectV2ItemFieldNumberValue {
                number
                field { ... on ProjectV2Field { name } }
              }
              ... on ProjectV2ItemFieldIterationValue {
                title
                field { ... on ProjectV2IterationField { name } }
              }
            }
          }
          content {
            ... on Issue {
              title number state url
              labels(first: 10) { nodes { name } }
              assignees(first: 5) { nodes { login } }
              milestone { title }
            }
            ... on PullRequest {
              title number state url
              labels(first: 10) { nodes { name } }
              assignees(first: 5) { nodes { login } }
              milestone { title }
            }
            ... on DraftIssue {
              title
            }
          }
        }
      }
    }
  }
}
"""


def _post(token: str, cursor: str | None, timeout: float) -> dict[str, Any]:
    body = json.dumps({
        "query": _QUERY,
        "variables": {"org": ORG, "num": PROJECT_NUMBER, "cursor": cursor},
    }).encode("utf-8")
    req = urllib.request.Request(
        GRAPHQL_URL,
        data=body,
        method="POST",
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "User-Agent": USER_AGENT,
        },
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        payload = json.load(resp)
    if payload.get("errors"):
        raise ValueError(f"GraphQL errors: {payload['errors']}")
    return payload["data"]


def fetch_items(token: str, timeout: float = 30.0) -> dict[str, Any]:
    """Page the org project into ``{title, url, items}`` (max 20 pages)."""
    items: list[dict[str, Any]] = []
    cursor: str | None = None
    title = ""
    url = ""
    for _ in range(20):
        data = _post(token, cursor, timeout)
        project = data["organization"]["projectV2"]
        title = project["title"]
        url = project["url"]
        node = project["items"]
        items.extend(node["nodes"])
        if not node["pageInfo"]["hasNextPage"]:
            break
        cursor = node["pageInfo"]["endCursor"]
    return {"title": title, "url": url, "items": items}


def _entry(item: dict[str, Any]) -> tuple[str | None, dict[str, Any]]:
    content = item.get("content") or {}
    fields = (item.get("fieldValues") or {}).get("nodes") or []

    status = None
    matrix = None
    date = None
    for fv in fields:
        field = fv.get("field") or {}
        name = field.get("name")
        if not name:
            continue
        if name == "Status":
            status = fv.get("name")
        elif name == "Matrix":
            num = fv.get("number")
            matrix = str(num) if num is not None else fv.get("text")
        elif name == "Date":
            date = fv.get("date")

    entry = {
        "type": item.get("type") or "DRAFT_ISSUE",
        "number": content.get("number"),
        "title": content.get("title") or "(untitled)",
        "state": content.get("state"),
        "url": content.get("url"),
        "assignees": [a["login"]
                      for a in (content.get("assignees") or {}).get("nodes", [])],
        "labels": [l["name"]
                   for l in (content.get("labels") or {}).get("nodes", [])],
        "matrix": matrix,
        "date": date,
        "milestone": (content.get("milestone") or {}).get("title"),
    }
    return status, entry


def _matrix_key(entry: dict[str, Any]) -> int:
    try:
        return int(entry.get("matrix") or 0)
    except (TypeError, ValueError):
        return 0


def bucket(items: list[dict[str, Any]]) -> tuple[dict, dict]:
    """Bucket raw items into ``columns`` + ``summary`` counts (matrix-sorted)."""
    columns: dict[str, list] = {col: [] for col in COLUMNS}
    for item in items:
        status, entry = _entry(item)
        if not status or status not in columns:
            continue
        columns[status].append(entry)
    for col in COLUMNS:
        columns[col].sort(key=_matrix_key, reverse=True)
    summary = {col: len(columns[col]) for col in COLUMNS}
    return columns, summary
