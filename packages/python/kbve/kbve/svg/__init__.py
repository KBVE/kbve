"""Deterministic inline-SVG chart rendering for generated MDX pages.

Mermaid renders diagrams in the browser; a 75-edge flowchart costs roughly
4 seconds of blocked main thread (~60ms per edge). These renderers emit the
finished SVG at generation time instead, so the page ships zero diagram JS.

Output is MDX-safe: no ``{``/``}`` characters and no ``<style>`` blocks, and
every colour is a literal that reads on both light and dark backgrounds.
"""

from __future__ import annotations

from .chart import Slice, donut_svg
from .dag import DagEdge, DagNode, dag_svg

__all__ = [
    "DagEdge",
    "DagNode",
    "Slice",
    "dag_svg",
    "donut_svg",
]
