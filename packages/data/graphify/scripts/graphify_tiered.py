"""Transform a Graphify node-link graph into a tiered, filesystem-hierarchy LOD.

Graphify emits a symbol-level node-link JSON (``{nodes, links}``): ~100k nodes
(files, functions, vars) each carrying a ``source_file`` and a Leiden
``community``. Rendering all of that at once does not scale, so this script
precomputes a three-tier layout keyed on the filesystem hierarchy:

    tier 0  directory   (first two path segments, e.g. ``apps/kbve``)
    tier 1  file        (``source_file``)
    tier 2  symbol      (the raw graph node)

The browser loads a small ``overview.json`` (one bubble per directory) on mount
and lazily fetches a per-directory chunk (``dir/<slug>.json``) — carrying that
directory's files + symbols + intra edges — only when the viewer zooms in. The
Leiden community is preserved on every node so the island can recolor by
community without new data.

Only ``file_type == "code"`` nodes with a real ``source_file`` are kept;
sourceless type-reference nodes (``Result``, ``Option``, …) are dropped as noise.

Usage:
    uv run --with networkx --with numpy python graphify_tiered.py \
        <graph.json> <out_dir> [--scale 6000]
"""

from __future__ import annotations

import argparse
import json
import math
import os
from collections import Counter, defaultdict

import networkx as nx


def _load(path: str) -> dict:
    with open(path) as f:
        return json.load(f)


def _dir_of(source_file: str) -> str:
    parts = source_file.split("/")
    return "/".join(parts[:2]) if len(parts) > 1 else parts[0]


def _slug(dir_key: str) -> str:
    return dir_key.replace("/", "__").replace(".", "_") or "_root"


def _basename(path: str) -> str:
    return path.rsplit("/", 1)[-1]


def _keep(node: dict) -> bool:
    return node.get("file_type") == "code" and bool(node.get("source_file"))


def _layout(graph: nx.Graph, seed: int, prefer_spring: bool = False) -> dict:
    """Force-directed positions in a roughly unit-scaled box. Sparse/small
    tiers (the ~70 directory super-nodes) spread more evenly under Fruchterman-
    Reingold (``spring``); large dense tiers (thousands of files) use Barnes-Hut
    ForceAtlas2, which stays fast at scale."""
    n = graph.number_of_nodes()
    if n == 0:
        return {}
    if n == 1:
        return {next(iter(graph.nodes)): (0.0, 0.0)}
    if n <= 3 or graph.number_of_edges() == 0:
        # Ring — force layouts explode disconnected nodes.
        pos = {}
        for i, node in enumerate(sorted(graph.nodes)):
            a = 2 * math.pi * i / n
            pos[node] = (math.cos(a), math.sin(a))
        return pos
    try:
        if prefer_spring:
            pos = nx.spring_layout(graph, seed=seed, iterations=200,
                                   k=2.5 / math.sqrt(n), weight="weight")
        else:
            pos = nx.forceatlas2_layout(
                graph, seed=seed, max_iter=120, weight="weight",
                strong_gravity=True, scaling_ratio=8.0,
            )
    except Exception:
        pos = nx.spring_layout(graph, seed=seed, iterations=80,
                               weight="weight")
    return {k: (float(v[0]), float(v[1])) for k, v in pos.items()}


def _normalize(pos: dict, scale: float) -> dict:
    """Map arbitrary force-layout coordinates into a centred box of side
    ``scale`` so downstream radii (a fraction of ``scale``) read consistently."""
    if not pos:
        return {}
    xs = [p[0] for p in pos.values()]
    ys = [p[1] for p in pos.values()]
    minx, maxx = min(xs), max(xs)
    miny, maxy = min(ys), max(ys)
    span = max(maxx - minx, maxy - miny, 1e-9)
    cx, cy = (minx + maxx) / 2, (miny + maxy) / 2
    f = scale / span
    return {k: ((p[0] - cx) * f, (p[1] - cy) * f) for k, p in pos.items()}


def _relax_overlaps(pos: dict, radii: dict, pad: float,
                    iterations: int = 400) -> dict:
    """Circle-packing relaxation: nudge overlapping bubbles apart, keeping the
    force layout's coupling hint. O(n^2) — fine for the ~70 directory tier."""
    keys = list(pos.keys())
    p = {k: [pos[k][0], pos[k][1]] for k in keys}
    for _ in range(iterations):
        moved = False
        for i in range(len(keys)):
            a = keys[i]
            for j in range(i + 1, len(keys)):
                b = keys[j]
                dx = p[b][0] - p[a][0]
                dy = p[b][1] - p[a][1]
                dist = math.hypot(dx, dy) or 1e-6
                want = radii[a] + radii[b] + pad
                if dist < want:
                    push = (want - dist) / 2
                    ux, uy = dx / dist, dy / dist
                    p[a][0] -= ux * push
                    p[a][1] -= uy * push
                    p[b][0] += ux * push
                    p[b][1] += uy * push
                    moved = True
        if not moved:
            break
    return {k: (p[k][0], p[k][1]) for k in keys}


def _phyllotaxis(count: int, radius: float) -> list[tuple[float, float]]:
    """Deterministic sunflower packing — cheap symbol placement around a
    file point, no per-file force sim."""
    if count == 1:
        return [(0.0, 0.0)]
    golden = math.pi * (3 - math.sqrt(5))
    out = []
    for i in range(count):
        r = radius * math.sqrt((i + 0.5) / count)
        a = i * golden
        out.append((r * math.cos(a), r * math.sin(a)))
    return out


def _dominant_community(nodes: list[dict]) -> int:
    c = Counter(int(n.get("community", 0)) for n in nodes)
    return c.most_common(1)[0][0] if c else 0


def build(data: dict, out_dir: str, scale: float, seed: int) -> dict:
    raw_nodes = [n for n in data["nodes"] if _keep(n)]
    kept_ids = {n["id"] for n in raw_nodes}
    by_id = {n["id"]: n for n in raw_nodes}

    # Group symbols by directory and file.
    dir_nodes: dict[str, list[dict]] = defaultdict(list)
    dir_files: dict[str, set] = defaultdict(set)
    node_dir: dict[str, str] = {}
    for n in raw_nodes:
        d = _dir_of(n["source_file"])
        dir_nodes[d].append(n)
        dir_files[d].add(n["source_file"])
        node_dir[n["id"]] = d

    # Aggregate symbol edges into cross-dir (tier 0), intra-dir file edges
    # (tier 1) and intra-dir symbol edges (tier 2).
    dir_edge_w: dict[tuple[str, str], float] = defaultdict(float)
    file_edge_w: dict[str, dict[tuple[str, str], float]] = defaultdict(
        lambda: defaultdict(float))
    sym_edges: dict[str, list[tuple[str, str, float]]] = defaultdict(list)
    for e in data["links"]:
        s, t = e.get("source"), e.get("target")
        if s not in kept_ids or t not in kept_ids or s == t:
            continue
        w = float(e.get("weight", 1.0))
        ds, dt = node_dir[s], node_dir[t]
        if ds != dt:
            key = (ds, dt) if ds < dt else (dt, ds)
            dir_edge_w[key] += w
            continue
        # Same directory: record file-level and symbol-level edges.
        fs, ft = by_id[s]["source_file"], by_id[t]["source_file"]
        if fs != ft:
            fk = (fs, ft) if fs < ft else (ft, fs)
            file_edge_w[ds][fk] += w
        sym_edges[ds].append((s, t, w))

    # Tier 0: directory super-graph + layout.
    dg = nx.Graph()
    for d, nodes in dir_nodes.items():
        dg.add_node(d, count=len(nodes))
    for (a, b), w in dir_edge_w.items():
        dg.add_edge(a, b, weight=w)
    dir_pos = _normalize(_layout(dg, seed, prefer_spring=True), scale)

    # Radius as a fraction of the layout box so bubbles read at the overview
    # zoom regardless of the force layout's arbitrary coordinate magnitude.
    max_count = max((len(n) for n in dir_nodes.values()), default=1)
    r_min, r_max = scale * 0.012, scale * 0.055
    dir_radii = {
        d: r_min + (r_max - r_min) * math.sqrt(len(nodes) / max_count)
        for d, nodes in dir_nodes.items()
    }
    # Force layout only hints coupling; the dir graph is sparse (many isolates),
    # so relax overlaps to guarantee a readable, non-colliding overview.
    dir_pos = _relax_overlaps(dir_pos, dir_radii, pad=scale * 0.02)

    dir_meta: dict[str, dict] = {}
    dirs_out: list[dict] = []
    dir_index: dict[str, int] = {}
    for i, (d, nodes) in enumerate(sorted(dir_nodes.items())):
        dx, dy = dir_pos.get(d, (0.0, 0.0))
        radius = dir_radii[d]
        dir_index[d] = i
        dir_meta[d] = {"x": dx, "y": dy, "r": radius}
        dirs_out.append({
            "id": _slug(d),
            "label": d,
            "x": round(dx, 2),
            "y": round(dy, 2),
            "r": round(radius, 2),
            "n": len(nodes),
            "files": len(dir_files[d]),
            "c": _dominant_community(nodes),
        })

    dir_edges_out = [
        [dir_index[a], dir_index[b], round(w, 2)]
        for (a, b), w in dir_edge_w.items()
        if a in dir_index and b in dir_index
    ]

    os.makedirs(out_dir, exist_ok=True)
    chunk_dir = os.path.join(out_dir, "dir")
    os.makedirs(chunk_dir, exist_ok=True)

    # Tier 1 + 2: one lazy chunk per directory.
    for d, nodes in dir_nodes.items():
        meta = dir_meta[d]
        cx, cy, dr = meta["x"], meta["y"], meta["r"]
        files = sorted(dir_files[d])

        # Layout files within the directory (force sim on the file subgraph).
        fg = nx.Graph()
        fg.add_nodes_from(files)
        for (a, b), w in file_edge_w[d].items():
            fg.add_edge(a, b, weight=w)
        fpos = _normalize(_layout(fg, seed), 1.8)
        file_index = {f: i for i, f in enumerate(files)}
        file_center: dict[str, tuple[float, float]] = {}
        files_out = []
        syms_by_file: dict[str, list[dict]] = defaultdict(list)
        for n in nodes:
            syms_by_file[n["source_file"]].append(n)
        # Files spread wider than the collapsed dir bubble so they read as a
        # field once the viewer has zoomed in past it.
        fspread = dr * 2.6
        for f in files:
            fx, fy = fpos.get(f, (0.0, 0.0))
            fx, fy = cx + fx * fspread, cy + fy * fspread
            file_center[f] = (fx, fy)
            files_out.append({
                "i": file_index[f],
                "label": _basename(f),
                "path": f,
                "x": round(fx, 2),
                "y": round(fy, 2),
                "n": len(syms_by_file[f]),
            })

        # Tier 2: symbols packed around their file point.
        sym_index: dict[str, int] = {}
        syms_out = []
        for f in files:
            members = syms_by_file[f]
            fx, fy = file_center[f]
            spread = 8.0 + math.sqrt(len(members)) * 4.0
            for (lx, ly), n in zip(_phyllotaxis(len(members), spread),
                                   members):
                sym_index[n["id"]] = len(syms_out)
                syms_out.append({
                    "i": len(syms_out),
                    "f": file_index[f],
                    "label": n.get("label", n["id"]),
                    "x": round(fx + lx, 2),
                    "y": round(fy + ly, 2),
                    "c": int(n.get("community", 0)),
                    "loc": n.get("source_location", ""),
                })

        file_edges_out = [
            [file_index[a], file_index[b], round(w, 2)]
            for (a, b), w in file_edge_w[d].items()
        ]
        sym_edges_out = [
            [sym_index[s], sym_index[t], round(w, 2)]
            for s, t, w in sym_edges[d]
            if s in sym_index and t in sym_index
        ]

        chunk = {
            "dir": d,
            "center": [round(cx, 2), round(cy, 2)],
            "r": round(dr, 2),
            "files": files_out,
            "symbols": syms_out,
            "fileEdges": file_edges_out,
            "symbolEdges": sym_edges_out,
        }
        with open(os.path.join(chunk_dir, f"{_slug(d)}.json"), "w") as fh:
            json.dump(chunk, fh, separators=(",", ":"))

    overview = {
        "meta": {
            "dirs": len(dirs_out),
            "files": len(kept_ids and set(
                n["source_file"] for n in raw_nodes)),
            "symbols": len(raw_nodes),
            "dirEdges": len(dir_edges_out),
            "built_at_commit": data.get("built_at_commit", ""),
            "scale": scale,
        },
        "dirs": dirs_out,
        "dirEdges": dir_edges_out,
    }
    with open(os.path.join(out_dir, "overview.json"), "w") as fh:
        json.dump(overview, fh, separators=(",", ":"))
    return overview["meta"]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("graph")
    ap.add_argument("out_dir")
    ap.add_argument("--scale", type=float, default=6000.0)
    ap.add_argument("--seed", type=int, default=1337)
    args = ap.parse_args()

    data = _load(args.graph)
    meta = build(data, args.out_dir, args.scale, args.seed)
    print(f"wrote {args.out_dir}: {meta['dirs']} dirs, {meta['files']} files, "
          f"{meta['symbols']} symbols, {meta['dirEdges']} dir-edges")


if __name__ == "__main__":
    main()
