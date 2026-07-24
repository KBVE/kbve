#!/usr/bin/env python3
"""Digest the three monorepo graphs into one at the graphify-wrapper level.

Runs as the final step of ``build-tiered-graph.sh``: takes the tiered Graphify
``overview.json`` (directory→file→symbol code analysis) and folds in the other
two feeds at the directory tier so the dashboard explorer renders a single
unified graph:

  * NX      — project identity on directory nodes (``nx.projects``) plus
              project→project dependency edges collapsed to dir→dir edges under
              a new ``depends`` relation.
  * Docs    — a reference URL per node (``ref``): the doc that documents that
              code area (e.g. ``packages/rust`` → ``/application/rust``). Docs
              are references hanging off code nodes, not nodes themselves.

Pure functions do the fusion so they unit-test without the graphify binary or a
live build; ``main`` only handles IO. Idempotent: re-running on an already
enriched overview reproduces the same result.
"""

from __future__ import annotations

import argparse
import json
import os
from typing import Iterable, Optional

DEPENDS_REL = "depends"


def _leaf(label: str) -> str:
    return label.rsplit("/", 1)[-1]


def longest_prefix_dir(root: str, labels: list[str]) -> Optional[int]:
    """Index of the directory whose label is the longest path-prefix of ``root``.

    NX project roots (``apps/kbve/axum-kbve``) are finer-grained than Graphify's
    directory bubbles (``apps/kbve``); a project attaches to the deepest bubble
    that contains it.
    """
    best_i: Optional[int] = None
    best_len = -1
    for i, label in enumerate(labels):
        if root == label or root.startswith(label + "/"):
            if len(label) > best_len:
                best_len, best_i = len(label), i
    return best_i


def _slug_index(slugs: Iterable[str]) -> dict[str, str]:
    """Map a lowercased last-segment → full slug, preferring ``application/*``."""
    index: dict[str, str] = {}
    for slug in slugs:
        leaf = slug.rsplit("/", 1)[-1].lower()
        if not leaf:
            continue
        prefer = slug.startswith("application/")
        if leaf not in index or (prefer and not index[leaf].startswith("application/")):
            index[leaf] = slug
    return index


def doc_ref_for(candidates: Iterable[str], slug_index: dict[str, str]) -> Optional[str]:
    for cand in candidates:
        slug = slug_index.get(cand.lower())
        if slug:
            return f"/{slug}/"
    return None


def enrich(overview: dict, nx_graph: dict, doc_slugs: Iterable[str]) -> dict:
    """Return ``overview`` enriched with NX identity/edges and doc refs.

    Mutates and returns the passed overview for convenience; callers that need
    the original untouched should deep-copy first.
    """
    dirs = overview.get("dirs", [])
    labels = [d["label"] for d in dirs]
    slug_index = _slug_index(doc_slugs)

    graph = nx_graph.get("graph", {})
    nodes = graph.get("nodes", {})
    deps = graph.get("dependencies", {})

    # NX project identity → the directory bubble that contains it.
    project_dir: dict[str, int] = {}
    for name, node in nodes.items():
        root = (node.get("data") or {}).get("root")
        if not root:
            continue
        idx = longest_prefix_dir(root, labels)
        if idx is None:
            continue
        project_dir[name] = idx
        bucket = dirs[idx].setdefault("nx", {"projects": []})
        bucket["projects"].append({"name": name, "type": node.get("type")})

    # Project→project deps collapsed to dir→dir "depends" edges (deduped).
    depends: dict[tuple[int, int], int] = {}
    for src, edges in deps.items():
        si = project_dir.get(src)
        if si is None:
            continue
        for e in edges or []:
            ti = project_dir.get(e.get("target"))
            if ti is None or ti == si:
                continue
            key = (si, ti)
            depends[key] = depends.get(key, 0) + 1

    relations = overview.setdefault("meta", {}).setdefault(
        "relations", ["imports", "calls", "references",
                      "contains", "extends", "other"]
    )
    if DEPENDS_REL not in relations:
        relations.append(DEPENDS_REL)
    depends_rel = relations.index(DEPENDS_REL)

    dir_edges = overview.setdefault("dirEdges", [])
    # Drop any prior depends edges so re-runs stay idempotent.
    dir_edges[:] = [e for e in dir_edges if e[3] != depends_rel]
    for (si, ti), weight in sorted(depends.items()):
        dir_edges.append([si, ti, weight, depends_rel])

    # Doc references: dir leaf + any NX project names on the node.
    for d in dirs:
        candidates = [_leaf(d["label"])]
        for p in (d.get("nx") or {}).get("projects", []):
            candidates.append(p["name"])
        ref = doc_ref_for(candidates, slug_index)
        if ref:
            d["ref"] = ref
        elif "ref" in d:
            del d["ref"]

    overview["meta"]["nxEdges"] = len(depends)
    overview["meta"]["nxProjects"] = len(project_dir)
    overview["meta"]["docRefs"] = sum(1 for d in dirs if "ref" in d)
    return overview


def _walk_slugs(docs_root: str) -> list[str]:
    slugs: list[str] = []
    for base, _dirs, files in os.walk(docs_root):
        for f in files:
            if not (f.endswith(".md") or f.endswith(".mdx")):
                continue
            rel = os.path.relpath(os.path.join(base, f), docs_root)
            slug = rel[: rel.rfind(".")].replace(os.sep, "/")
            if slug.endswith("/index"):
                slug = slug[: -len("/index")]
            slugs.append(slug)
    return slugs


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("overview", help="tiered overview.json to enrich in place")
    ap.add_argument("--nx-graph", required=True, help="nx-graph.json path")
    ap.add_argument("--docs-root", required=True, help="content/docs root")
    ap.add_argument("--out", help="output path (default: overwrite overview)")
    args = ap.parse_args()

    with open(args.overview) as fh:
        overview = json.load(fh)
    with open(args.nx_graph) as fh:
        nx_graph = json.load(fh)
    doc_slugs = _walk_slugs(args.docs_root)

    enrich(overview, nx_graph, doc_slugs)

    out = args.out or args.overview
    with open(out, "w") as fh:
        json.dump(overview, fh, separators=(",", ":"))
    meta = overview["meta"]
    print(
        f"enriched {out}: {meta['nxProjects']} nx projects, "
        f"{meta['nxEdges']} depends-edges, {meta['docRefs']} doc refs"
    )


if __name__ == "__main__":
    main()
