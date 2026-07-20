"""Transform a Graphify node-link graph into a layered LOD layout.

Graphify emits a networkx node-link JSON (``{nodes, links}``) where each node
carries a Leiden ``community``. This script precomputes a stable two-level
layout — a coarse community layout plus a per-community member layout — so the
browser never has to run a 10k-node force simulation. Output is an index-based
layered JSON consumed by the ``ReactGraphExplorer`` island.

Usage:
    uv run --with networkx python graphify_layout.py \
        <graph.json> <out.json> [--scale 4000]
"""

from __future__ import annotations

import argparse
import json
import math
from collections import defaultdict

import networkx as nx


def _load(path: str) -> dict:
    with open(path) as f:
        return json.load(f)


def _build_graph(data: dict) -> nx.Graph:
    g = nx.Graph()
    for n in data["nodes"]:
        g.add_node(n["id"], community=n.get("community", 0),
                   label=n.get("label", n["id"]),
                   file=n.get("source_file", ""))
    for e in data["links"]:
        s, t = e.get("source"), e.get("target")
        if s in g and t in g and s != t:
            w = float(e.get("weight", 1.0))
            if g.has_edge(s, t):
                g[s][t]["weight"] += w
            else:
                g.add_edge(s, t, weight=w)
    return g


def _community_graph(g: nx.Graph) -> tuple[nx.Graph, dict]:
    members: dict[int, list] = defaultdict(list)
    for node, cid in g.nodes(data="community"):
        members[cid].append(node)

    cg = nx.Graph()
    for cid, nodes in members.items():
        cg.add_node(cid, count=len(nodes))
    for u, v, w in g.edges(data="weight"):
        cu, cv = g.nodes[u]["community"], g.nodes[v]["community"]
        if cu == cv:
            continue
        if cg.has_edge(cu, cv):
            cg[cu][cv]["weight"] += w
        else:
            cg.add_edge(cu, cv, weight=w)
    return cg, members


def _layout(data: dict, scale: float, seed: int) -> dict:
    g = _build_graph(data)
    cg, members = _community_graph(g)

    # Coarse layout: place each community super-node.
    centers = nx.spring_layout(cg, seed=seed, k=1.5, iterations=200,
                               weight="weight") if cg.number_of_nodes() > 1 \
        else {cid: (0.0, 0.0) for cid in cg.nodes}

    node_pos: dict = {}
    community_meta: list[dict] = []
    for cid, nodes in members.items():
        cx, cy = centers.get(cid, (0.0, 0.0))
        cx, cy = cx * scale, cy * scale
        # Radius grows with community size (sqrt so area ~ count).
        radius = 40.0 + math.sqrt(len(nodes)) * 22.0
        sub = g.subgraph(nodes)
        if len(nodes) == 1:
            local = {nodes[0]: (0.0, 0.0)}
        else:
            local = nx.spring_layout(sub, seed=seed, k=0.9,
                                     iterations=120, weight="weight")
        for node, (lx, ly) in local.items():
            node_pos[node] = (cx + lx * radius, cy + ly * radius)
        community_meta.append({
            "id": int(cid),
            "x": round(cx, 2),
            "y": round(cy, 2),
            "r": round(radius, 2),
            "count": len(nodes),
        })

    # Index-based node/edge arrays keep the payload compact at scale.
    ids = list(g.nodes)
    idx = {nid: i for i, nid in enumerate(ids)}
    nodes_out = []
    for nid in ids:
        x, y = node_pos[nid]
        nodes_out.append({
            "i": idx[nid],
            "c": int(g.nodes[nid]["community"]),
            "x": round(x, 2),
            "y": round(y, 2),
            "d": g.degree(nid),
            "l": g.nodes[nid]["label"],
            "f": g.nodes[nid]["file"],
        })
    edges_out = [[idx[u], idx[v], round(w, 2)]
                 for u, v, w in g.edges(data="weight")]

    cidx = {c["id"]: i for i, c in enumerate(community_meta)}
    cedges_out = [[cidx[u], cidx[v], round(w, 2)]
                  for u, v, w in cg.edges(data="weight")
                  if u in cidx and v in cidx]

    return {
        "meta": {
            "nodes": len(ids),
            "edges": len(edges_out),
            "communities": len(community_meta),
            "built_at_commit": data.get("built_at_commit", ""),
        },
        "communities": community_meta,
        "nodes": nodes_out,
        "edges": edges_out,
        "communityEdges": cedges_out,
    }


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("graph")
    ap.add_argument("out")
    ap.add_argument("--scale", type=float, default=4000.0)
    ap.add_argument("--seed", type=int, default=1337)
    args = ap.parse_args()

    data = _load(args.graph)
    layered = _layout(data, args.scale, args.seed)
    with open(args.out, "w") as f:
        json.dump(layered, f, separators=(",", ":"))
    m = layered["meta"]
    print(f"wrote {args.out}: {m['nodes']} nodes, {m['edges']} edges, "
          f"{m['communities']} communities")


if __name__ == "__main__":
    main()
