"""Shared colour literals for generated SVG charts.

Every value is picked to hold contrast against both the light and the dark
Bento backgrounds, since generated MDX cannot carry a ``<style>`` block (MDX
parses ``{``/``}`` as JSX) and therefore cannot switch on colour scheme.
"""

from __future__ import annotations

SERIES = (
    "#3b82f6",
    "#10b981",
    "#f59e0b",
    "#a78bfa",
    "#38bdf8",
    "#f472b6",
    "#facc15",
    "#2dd4bf",
)

TYPE_FILL = {
    "app": "#3b82f6",
    "lib": "#10b981",
    "e2e": "#f59e0b",
}

TYPE_STROKE = {
    "app": "#1d4ed8",
    "lib": "#059669",
    "e2e": "#d97706",
}

FALLBACK_FILL = "#64748b"
FALLBACK_STROKE = "#475569"

EDGE = "#94a3b8"
NODE_TEXT = "#ffffff"

# Chart text inherits the page's colour so it tracks the light/dark theme
# without a <style> block, which generated MDX cannot carry.
LABEL = "currentColor"


def series_color(index: int) -> str:
    """Return a stable series colour for *index*."""
    return SERIES[index % len(SERIES)]


def type_colors(project_type: str) -> tuple[str, str]:
    """Return ``(fill, stroke)`` for an Nx project type."""
    return (
        TYPE_FILL.get(project_type, FALLBACK_FILL),
        TYPE_STROKE.get(project_type, FALLBACK_STROKE),
    )
