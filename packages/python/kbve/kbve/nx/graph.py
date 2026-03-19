"""Nx project graph parsing and analysis.

Parses Nx graph JSON into structured data for downstream rendering
(MDX, JSON reports, API responses, etc.).
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any


@dataclass
class ProjectRow:
    """A single project extracted from the Nx graph."""

    name: str
    project_type: str
    root: str
    dep_count: int
    dependent_count: int


@dataclass
class GraphData:
    """Parsed and analysed Nx project graph."""

    nodes: dict[str, Any]
    deps: dict[str, list[dict[str, str]]]
    rows: list[ProjectRow]
    by_type: dict[str, list[str]]
    edges: set[tuple[str, str]]
    edges_by_source: dict[str, list[str]]


def mermaid_id(name: str) -> str:
    """Sanitize a project name into a valid Mermaid node ID."""
    return re.sub(r"[^a-zA-Z0-9_]", "_", name)


def parse_graph(source: str | Path | dict) -> GraphData:
    """Parse an Nx graph from a file path, JSON string, or dict.

    Returns a fully analysed ``GraphData`` with rows, groupings, and edges
    ready for rendering.
    """
    if isinstance(source, dict):
        data = source
    elif isinstance(source, Path) or (
        isinstance(source, str) and not source.lstrip().startswith("{")
    ):
        with open(source) as f:
            data = json.load(f)
    else:
        data = json.loads(source)

    nodes: dict[str, Any] = data["graph"]["nodes"]
    deps: dict[str, list[dict[str, str]]] = data["graph"]["dependencies"]

    by_type = group_projects_by_type(nodes)
    rows = _build_rows(nodes, deps)
    edges, edges_by_source = collect_edges(deps)

    return GraphData(
        nodes=nodes,
        deps=deps,
        rows=rows,
        by_type=by_type,
        edges=edges,
        edges_by_source=edges_by_source,
    )


def group_projects_by_type(
    nodes: dict[str, Any],
) -> dict[str, list[str]]:
    """Group project names by their Nx project type."""
    by_type: dict[str, list[str]] = {}
    for name, node in sorted(nodes.items()):
        ptype = node.get("type", "unknown")
        by_type.setdefault(ptype, []).append(name)
    return by_type


def collect_edges(
    deps: dict[str, list[dict[str, str]]],
) -> tuple[set[tuple[str, str]], dict[str, list[str]]]:
    """Collect unique directed edges from Nx dependency data.

    Returns ``(edge_set, edges_by_source)``.
    """
    seen: set[tuple[str, str]] = set()
    by_source: dict[str, list[str]] = {}
    for dep_list in deps.values():
        for d in dep_list:
            edge = (d["source"], d["target"])
            if edge not in seen:
                seen.add(edge)
                by_source.setdefault(d["source"], []).append(d["target"])
    return seen, by_source


def top_hubs(rows: list[ProjectRow], n: int = 5) -> list[ProjectRow]:
    """Return the *n* most-depended-on projects."""
    return sorted(rows, key=lambda r: r.dependent_count, reverse=True)[:n]


def _build_rows(
    nodes: dict[str, Any],
    deps: dict[str, list[dict[str, str]]],
) -> list[ProjectRow]:
    """Build a sorted list of ``ProjectRow`` from raw graph data."""
    rows: list[ProjectRow] = []
    for name in sorted(nodes):
        node = nodes[name]
        dep_count = len(deps.get(name, []))
        dependents = sum(
            1 for d_list in deps.values() for d in d_list
            if d["target"] == name
        )
        rows.append(ProjectRow(
            name=name,
            project_type=node.get("type", "unknown"),
            root=node.get("data", {}).get("root", ""),
            dep_count=dep_count,
            dependent_count=dependents,
        ))
    return rows
