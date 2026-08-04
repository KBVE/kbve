"""Donut chart rendering — the static replacement for Mermaid ``pie``."""

from __future__ import annotations

import math
from dataclasses import dataclass

from .escape import escape_svg
from .palette import LABEL, series_color

_CX = 150.0
_CY = 170.0
_R_OUTER = 110.0
_R_INNER = 66.0
_LEGEND_X = 310
_LEGEND_TOP = 92
_LEGEND_STEP = 30
_LEGEND_TEXT_X = _LEGEND_X + 24
_MIN_WIDTH = 620
# Advance width of the 14px legend face. Only ever used to reserve room, so
# erring wide costs a little whitespace while erring narrow clips the text.
_LEGEND_CHAR_WIDTH = 7.9
_LEGEND_RIGHT_PAD = 16


@dataclass(frozen=True)
class Slice:
    """One donut segment."""

    label: str
    value: float
    color: str | None = None


def donut_svg(
    title: str,
    slices: list[Slice],
    *,
    show_data: bool = True,
) -> str:
    """Render *slices* as a donut chart with a legend, as inline SVG.

    Zero-valued slices are dropped. Returns an empty string when nothing is
    left to draw, so callers can skip the surrounding section.
    """
    drawn = [s for s in slices if s.value > 0]
    if not drawn:
        return ""

    total = sum(s.value for s in drawn)
    height = max(300, _LEGEND_TOP + _LEGEND_STEP * len(drawn) + 40)
    safe_title = escape_svg(title)
    width = _legend_width(drawn, total, show_data)

    parts: list[str] = [
        f'<svg class="kbve-chart" role="img" viewBox="0 0 {width} {height}"'
        f' width="{width}" height="{height}"'
        f' aria-label="{safe_title}"'
        ' preserveAspectRatio="xMidYMid meet"'
        f' style="width: 100%; height: auto; max-width: {width}px">',
        f"<title>{safe_title}</title>",
        f'<text x="{_CX}" y="34" text-anchor="middle" font-size="16"'
        f' font-weight="600" fill="{LABEL}">{safe_title}</text>',
    ]

    angle = -90.0
    for index, item in enumerate(drawn):
        sweep = 360.0 * item.value / total
        color = item.color or series_color(index)
        parts.append(_segment(angle, angle + sweep, color))
        angle += sweep

    parts.append(
        f'<text x="{_CX}" y="{_CY + 6:.1f}" text-anchor="middle"'
        f' font-size="20" font-weight="700" fill="{LABEL}">'
        f"{_number(total)}</text>"
    )

    for index, item in enumerate(drawn):
        y = _LEGEND_TOP + _LEGEND_STEP * index
        color = item.color or series_color(index)
        text = escape_svg(_legend_text(item, total, show_data))
        parts.append(
            f'<rect x="{_LEGEND_X}" y="{y}" width="14" height="14" rx="3"'
            f' fill="{color}" />'
            f'<text x="{_LEGEND_TEXT_X}" y="{y + 12}" font-size="14"'
            f' fill="{LABEL}">{text}</text>'
        )

    parts.append("</svg>")
    return "".join(parts)


def _legend_text(item: Slice, total: float, show_data: bool) -> str:
    """Return one legend row's raw (unescaped) text."""
    if not show_data:
        return item.label
    pct = 100.0 * item.value / total
    return f"{item.label} — {_number(item.value)} ({pct:.1f}%)"


def _legend_width(
    drawn: list[Slice], total: float, show_data: bool,
) -> int:
    """Widen the canvas until the longest legend row fits.

    The legend sits to the right of the donut at a fixed x, so a long label
    runs off a fixed-width canvas and is silently clipped by the viewBox.
    """
    longest = max(
        (len(_legend_text(item, total, show_data)) for item in drawn),
        default=0,
    )
    needed = (
        _LEGEND_TEXT_X
        + int(longest * _LEGEND_CHAR_WIDTH)
        + _LEGEND_RIGHT_PAD
    )
    return max(_MIN_WIDTH, needed)


def _segment(start_deg: float, end_deg: float, color: str) -> str:
    """Render one donut segment between two angles."""
    if end_deg - start_deg >= 359.999:
        thickness = _R_OUTER - _R_INNER
        radius = (_R_OUTER + _R_INNER) / 2
        return (
            f'<circle cx="{_CX}" cy="{_CY}" r="{radius:.2f}" fill="none"'
            f' stroke="{color}" stroke-width="{thickness:.2f}" />'
        )

    ox0, oy0 = _point(_R_OUTER, start_deg)
    ox1, oy1 = _point(_R_OUTER, end_deg)
    ix1, iy1 = _point(_R_INNER, end_deg)
    ix0, iy0 = _point(_R_INNER, start_deg)
    large = 1 if end_deg - start_deg > 180 else 0
    return (
        f'<path d="M {ox0:.2f} {oy0:.2f}'
        f" A {_R_OUTER:.2f} {_R_OUTER:.2f} 0 {large} 1 {ox1:.2f} {oy1:.2f}"
        f" L {ix1:.2f} {iy1:.2f}"
        f" A {_R_INNER:.2f} {_R_INNER:.2f} 0 {large} 0 {ix0:.2f} {iy0:.2f}"
        f' Z" fill="{color}" />'
    )


def _point(radius: float, degrees: float) -> tuple[float, float]:
    """Return the cartesian point at *degrees* on a circle of *radius*."""
    rad = math.radians(degrees)
    return (_CX + radius * math.cos(rad), _CY + radius * math.sin(rad))


def _number(value: float) -> str:
    """Format a slice value without a trailing ``.0``."""
    return str(int(value)) if float(value).is_integer() else f"{value:g}"
