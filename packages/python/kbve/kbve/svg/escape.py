"""Text escaping for SVG that will be embedded directly in MDX."""

from __future__ import annotations

_REPLACEMENTS = (
    ("&", "&amp;"),
    ("<", "&lt;"),
    (">", "&gt;"),
    ('"', "&quot;"),
    ("{", "&#123;"),
    ("}", "&#125;"),
)


def escape_svg(text: str) -> str:
    """Escape *text* for use as SVG character data or an attribute value.

    Braces are escaped too: generated SVG is inlined into MDX, where ``{``
    opens a JSX expression.
    """
    out = str(text)
    for needle, replacement in _REPLACEMENTS:
        out = out.replace(needle, replacement)
    return out
