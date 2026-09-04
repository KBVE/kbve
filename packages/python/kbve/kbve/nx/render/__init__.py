"""Starlight MDX and JSON renderers, one module per dashboard page.

The parse layer (:mod:`kbve.nx.security`, :mod:`kbve.nx.graph`, …) produces
plain data; these renderers turn it into the exact MDX/JSON the
``ci-daily-content`` workflow commits.

The MDX pages use the site's Bento design system (``template: splash`` +
``BentoShell``/``BentoProse`` + ``bento.css`` classes). Card markup is emitted
statically per item (no ``export const`` + ``{arr.map()}`` JSX) so generated
content stays deterministic and JSX-runtime-free.
"""

from __future__ import annotations

from ._shared import (
    _MAX_DIAGRAM_NODES,
    ECOSYSTEM_LABELS,
    ECOSYSTEM_ORDER,
    ECOSYSTEM_SVG,
    SEVERITY_LABELS,
    SEVERITY_SVG,
    TYPE_LABELS,
    TYPE_STYLES,
    TYPE_SVG,
)
from .activity import build_activity_payload, render_activity_json, render_activity_mdx
from .ci_health import build_ci_health_payload, render_ci_health_json, render_ci_health_mdx
from .deps import build_deps_payload, render_deps_json, render_deps_mdx
from .graph import render_graph_mdx
from .kanban import KANBAN_COLUMNS, build_kanban_payload, render_kanban_json, render_kanban_mdx
from .releases import build_release_payload, render_release_json, render_release_mdx
from .report import render_report_json, render_report_mdx
from .security import render_security_json, render_security_mdx

__all__ = [
    "_MAX_DIAGRAM_NODES",
    "ECOSYSTEM_LABELS",
    "ECOSYSTEM_ORDER",
    "ECOSYSTEM_SVG",
    "KANBAN_COLUMNS",
    "SEVERITY_LABELS",
    "SEVERITY_SVG",
    "TYPE_LABELS",
    "TYPE_STYLES",
    "TYPE_SVG",
    "build_activity_payload",
    "build_ci_health_payload",
    "build_deps_payload",
    "build_kanban_payload",
    "build_release_payload",
    "render_activity_json",
    "render_activity_mdx",
    "render_ci_health_json",
    "render_ci_health_mdx",
    "render_deps_json",
    "render_deps_mdx",
    "render_graph_mdx",
    "render_kanban_json",
    "render_kanban_mdx",
    "render_release_json",
    "render_release_mdx",
    "render_report_json",
    "render_report_mdx",
    "render_security_json",
    "render_security_mdx",
]
