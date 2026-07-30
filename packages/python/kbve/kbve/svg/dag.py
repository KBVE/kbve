"""Layered directed-graph rendering — the static replacement for Mermaid
``graph LR``.

Layout is a compact Sugiyama variant: longest-path layering after back-edge
removal, then barycenter ordering inside each layer. Everything runs at
generation time and the result is a plain SVG, so the browser pays nothing.
"""

from __future__ import annotations

from dataclasses import dataclass

from .escape import escape_svg
from .palette import EDGE, LABEL, NODE_TEXT, type_colors

_NODE_HEIGHT = 34
_NODE_PAD = 20
_CHAR_WIDTH = 7.1
_MIN_NODE_WIDTH = 88
_MAX_NODE_WIDTH = 220
_ROW_GAP = 16
_LAYER_GAP = 92
_MARGIN = 24
_MAX_LABEL = 26
_ORDER_SWEEPS = 4


@dataclass(frozen=True)
class DagNode:
    """A graph vertex."""

    name: str
    node_type: str = ""
    label: str | None = None


@dataclass(frozen=True)
class DagEdge:
    """A directed dependency edge."""

    source: str
    target: str


@dataclass
class _Placed:
    node: DagNode
    text: str
    layer: int
    x: float
    y: float
    width: float


def dag_svg(
    nodes: list[DagNode],
    edges: list[DagEdge],
    *,
    title: str = "Dependency graph",
) -> str:
    """Render *nodes* and *edges* as a left-to-right layered SVG diagram.

    Nodes with no surviving edge are dropped — an isolated box carries no
    information in a dependency diagram. Returns an empty string when there
    is nothing to draw. Cycles are tolerated: the edges that close them are
    laid out as dashed back edges.
    """
    known = {n.name: n for n in nodes}
    clean = _clean_edges(known, edges)
    if not known or not clean:
        return ""

    connected = {e.source for e in clean} | {e.target for e in clean}
    known = {name: node for name, node in known.items() if name in connected}

    layers = _assign_layers(known, clean)
    order = _order_layers(known, clean, layers)
    placed, width, height = _place(known, order)
    return _emit(placed, clean, layers, width, height, title)


def _clean_edges(
    known: dict[str, DagNode],
    edges: list[DagEdge],
) -> list[DagEdge]:
    """Drop self-loops, duplicates, and edges touching unknown nodes."""
    seen: set[tuple[str, str]] = set()
    out: list[DagEdge] = []
    for edge in edges:
        pair = (edge.source, edge.target)
        if edge.source == edge.target:
            continue
        if edge.source not in known or edge.target not in known:
            continue
        if pair in seen:
            continue
        seen.add(pair)
        out.append(edge)
    return sorted(out, key=lambda e: (e.source, e.target))


def _back_edges(
    known: dict[str, DagNode],
    edges: list[DagEdge],
) -> set[tuple[str, str]]:
    """Find edges that close a cycle, walking nodes in name order."""
    succ: dict[str, list[str]] = {name: [] for name in known}
    for edge in edges:
        succ[edge.source].append(edge.target)
    for targets in succ.values():
        targets.sort()

    state: dict[str, int] = dict.fromkeys(known, 0)
    back: set[tuple[str, str]] = set()

    for root in sorted(known):
        if state[root] != 0:
            continue
        stack: list[tuple[str, int]] = [(root, 0)]
        state[root] = 1
        while stack:
            node, index = stack[-1]
            if index < len(succ[node]):
                stack[-1] = (node, index + 1)
                child = succ[node][index]
                if state[child] == 1:
                    back.add((node, child))
                elif state[child] == 0:
                    state[child] = 1
                    stack.append((child, 0))
            else:
                state[node] = 2
                stack.pop()
    return back


def _assign_layers(
    known: dict[str, DagNode],
    edges: list[DagEdge],
) -> dict[str, int]:
    """Assign each node the longest-path depth from any source."""
    back = _back_edges(known, edges)
    forward = [e for e in edges if (e.source, e.target) not in back]

    preds: dict[str, list[str]] = {name: [] for name in known}
    indegree: dict[str, int] = dict.fromkeys(known, 0)
    for edge in forward:
        preds[edge.target].append(edge.source)
        indegree[edge.target] += 1

    layer: dict[str, int] = dict.fromkeys(known, 0)
    ready = sorted(n for n, d in indegree.items() if d == 0)
    succ: dict[str, list[str]] = {name: [] for name in known}
    for edge in forward:
        succ[edge.source].append(edge.target)

    while ready:
        node = ready.pop(0)
        for child in sorted(succ[node]):
            layer[child] = max(layer[child], layer[node] + 1)
            indegree[child] -= 1
            if indegree[child] == 0:
                ready.append(child)
        ready.sort()
    return layer


def _order_layers(
    known: dict[str, DagNode],
    edges: list[DagEdge],
    layers: dict[str, int],
) -> list[list[str]]:
    """Order nodes inside each layer to shorten edge crossings."""
    depth = max(layers.values()) + 1
    buckets: list[list[str]] = [[] for _ in range(depth)]
    for name in sorted(known):
        buckets[layers[name]].append(name)

    preds: dict[str, list[str]] = {name: [] for name in known}
    succs: dict[str, list[str]] = {name: [] for name in known}
    for edge in edges:
        preds[edge.target].append(edge.source)
        succs[edge.source].append(edge.target)

    for sweep in range(_ORDER_SWEEPS):
        forward = sweep % 2 == 0
        indices = range(1, depth) if forward else range(depth - 2, -1, -1)
        position = {
            name: i
            for bucket in buckets
            for i, name in enumerate(bucket)
        }
        for index in indices:
            neighbours = preds if forward else succs
            buckets[index].sort(
                key=lambda n: (
                    _barycenter(neighbours[n], position, position.get(n, 0)),
                    n,
                )
            )
    return buckets


def _barycenter(
    neighbours: list[str],
    position: dict[str, int],
    default: float,
) -> float:
    """Mean neighbour position, or *default* when a node has no neighbours."""
    seen = [position[n] for n in neighbours if n in position]
    return sum(seen) / len(seen) if seen else float(default)


def _place(
    known: dict[str, DagNode],
    order: list[list[str]],
) -> tuple[list[_Placed], float, float]:
    """Turn layer ordering into absolute coordinates."""
    texts = {name: _label(known[name]) for name in known}
    widths = {name: _width(texts[name]) for name in known}

    column_widths = [
        max((widths[n] for n in bucket), default=_MIN_NODE_WIDTH)
        for bucket in order
    ]
    column_x: list[float] = []
    cursor = float(_MARGIN)
    for width in column_widths:
        column_x.append(cursor)
        cursor += width + _LAYER_GAP
    total_width = cursor - _LAYER_GAP + _MARGIN

    column_heights = [
        len(bucket) * _NODE_HEIGHT + max(0, len(bucket) - 1) * _ROW_GAP
        for bucket in order
    ]
    tallest = max(column_heights, default=0)
    total_height = tallest + 2 * _MARGIN

    placed: list[_Placed] = []
    for index, bucket in enumerate(order):
        top = _MARGIN + (tallest - column_heights[index]) / 2
        for row, name in enumerate(bucket):
            placed.append(_Placed(
                node=known[name],
                text=texts[name],
                layer=index,
                x=column_x[index],
                y=top + row * (_NODE_HEIGHT + _ROW_GAP),
                width=column_widths[index],
            ))
    return placed, total_width, total_height


def _label(node: DagNode) -> str:
    """Return the visible node label, truncated to a readable length."""
    text = node.label or node.name
    if len(text) <= _MAX_LABEL:
        return text
    return text[: _MAX_LABEL - 1] + "…"


def _width(text: str) -> float:
    """Estimate the box width needed for *text*."""
    return min(
        _MAX_NODE_WIDTH,
        max(_MIN_NODE_WIDTH, len(text) * _CHAR_WIDTH + _NODE_PAD * 2),
    )


def _emit(
    placed: list[_Placed],
    edges: list[DagEdge],
    layers: dict[str, int],
    width: float,
    height: float,
    title: str,
) -> str:
    """Serialize the laid-out graph to SVG."""
    box = {p.node.name: p for p in placed}
    safe_title = escape_svg(title)

    parts: list[str] = [
        f'<svg class="kbve-dag" role="img" viewBox="0 0 {width:.0f}'
        f' {height:.0f}" width="{width:.0f}" height="{height:.0f}"'
        f' aria-label="{safe_title}"'
        ' preserveAspectRatio="xMidYMid meet"'
        f' style="width: 100%; height: auto; max-width: {width:.0f}px">',
        f"<title>{safe_title}</title>",
        '<defs><marker id="kbve-dag-arrow" viewBox="0 0 10 10" refX="9"'
        ' refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">'
        f'<path d="M 0 0 L 10 5 L 0 10 z" fill="{EDGE}" /></marker></defs>',
        '<g fill="none" stroke-linecap="round">',
    ]

    for edge in edges:
        source = box[edge.source]
        target = box[edge.target]
        back = layers[edge.source] >= layers[edge.target]
        parts.append(_edge_path(source, target, back))
    parts.append("</g>")

    for item in sorted(placed, key=lambda p: (p.layer, p.y)):
        fill, stroke = type_colors(item.node.node_type)
        label = escape_svg(item.text)
        full = escape_svg(item.node.name)
        parts.append(
            f'<g><title>{full}</title>'
            f'<rect x="{item.x:.1f}" y="{item.y:.1f}"'
            f' width="{item.width:.1f}" height="{_NODE_HEIGHT}" rx="7"'
            f' fill="{fill}" stroke="{stroke}" stroke-width="1.5" />'
            f'<text x="{item.x + item.width / 2:.1f}"'
            f' y="{item.y + _NODE_HEIGHT / 2 + 5:.1f}" text-anchor="middle"'
            f' font-size="13" font-weight="600" fill="{NODE_TEXT}">'
            f"{label}</text></g>"
        )

    projects = f"{len(placed)} project{'s' if len(placed) != 1 else ''}"
    links = f"{len(edges)} edge{'s' if len(edges) != 1 else ''}"
    parts.append(
        f'<text x="{width - _MARGIN:.0f}" y="{height - 6:.0f}"'
        f' text-anchor="end" font-size="11" fill="{LABEL}">'
        f"{projects} · {links}</text>"
    )
    parts.append("</svg>")
    return "".join(parts)


def _edge_path(source: _Placed, target: _Placed, back: bool) -> str:
    """Render one edge as a cubic bezier between two node boxes."""
    x0 = source.x + source.width
    y0 = source.y + _NODE_HEIGHT / 2
    x1 = target.x
    y1 = target.y + _NODE_HEIGHT / 2

    if back:
        x1 = target.x + target.width
        bow = max(40.0, abs(y1 - y0) * 0.4)
        path = (
            f"M {x0:.1f} {y0:.1f}"
            f" C {x0 + bow:.1f} {y0:.1f} {x1 + bow:.1f} {y1:.1f}"
            f" {x1:.1f} {y1:.1f}"
        )
        dash = ' stroke-dasharray="5 4"'
    else:
        grip = max(28.0, (x1 - x0) * 0.5)
        path = (
            f"M {x0:.1f} {y0:.1f}"
            f" C {x0 + grip:.1f} {y0:.1f} {x1 - grip:.1f} {y1:.1f}"
            f" {x1:.1f} {y1:.1f}"
        )
        dash = ""

    return (
        f'<path d="{path}" stroke="{EDGE}" stroke-width="1.3"'
        f' stroke-opacity="0.75"{dash}'
        ' marker-end="url(#kbve-dag-arrow)" />'
    )
