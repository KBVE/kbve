"""Rendering primitives shared by every dashboard page.

The Bento hero, the stat tile and link card, the severity/ecosystem/layer
lookup tables and the donut-slice folding — everything a page reuses rather
than everything one page happens to need.
"""

from __future__ import annotations

from typing import TextIO

from ...svg import Slice
from ..security import SEVERITY_ORDER

# and the cap is purely about readability — the full set stays in the Project
# index table and the companion JSON.
_MAX_DIAGRAM_NODES = 40

SEVERITY_LABELS = {
    "critical": "Critical",
    "high": "High",
    "medium": "Medium",
    "low": "Low",
    "info": "Info",
}

SEVERITY_SVG = {
    "critical": (
        "M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01"
    ),
    "high": "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM12 8v4M12 16h.01",
    "medium": "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM12 16v-4M12 8h.01",
    "low": "M22 11.08V12a10 10 0 1 1-5.93-9.14M22 4 12 14.01l-3-3",
    "info": ("M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1zM4 22v-7"),
}

ECOSYSTEM_LABELS = {
    "npm": "npm",
    "cargo": "Cargo",
    "python": "Python",
    "codeql": "CodeQL",
    "dependabot": "Dependabot",
}

ECOSYSTEM_SVG = {
    "npm": (
        "M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2"
        " 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16zM3.27 6.96"
        " 12 12.01l8.73-5.05M12 22.08V12"
    ),
    "cargo": "M12 2 2 7l10 5 10-5zM2 17l10 5 10-5M2 12l10 5 10-5",
    "python": "M16 18l6-6-6-6M8 6l-6 6 6 6",
    "codeql": ("M21 21l-6-6M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z"),
    "dependabot": ("M6 3v12M18 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM15 6a9 9 0 0 1-9 9"),
}

ECOSYSTEM_ORDER = ["npm", "cargo", "python", "codeql", "dependabot"]

# Keyed on moon's project layer, which is what a graph node now reports.
TYPE_STYLES = {
    "application": (":::application", "fill:#3b82f6,stroke:#1d4ed8,color:#fff"),
    "library": (":::library", "fill:#10b981,stroke:#059669,color:#fff"),
    "automation": (":::automation", "fill:#f59e0b,stroke:#d97706,color:#fff"),
    "tool": (":::tool", "fill:#a855f7,stroke:#7e22ce,color:#fff"),
    "unknown": (":::unknown", "fill:#64748b,stroke:#475569,color:#fff"),
}

TYPE_LABELS = {
    "application": "Applications",
    "library": "Libraries",
    "automation": "Automation",
    "tool": "Tools",
    "unknown": "Unclassified",
}

TYPE_SVG = {
    "application": (
        "M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18"
        " 2.18 0 0 0-2.91-.09zM12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1"
        " 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"
    ),
    "library": "M4 4h7v7H4zM13 13h7v7h-7zM13 4h7v7h-7zM4 13h7v7H4z",
    "automation": "M22 11.08V12a10 10 0 1 1-5.93-9.14M22 4 12 14.01l-3-3",
    "tool": ("M14.7 6.3a4 4 0 0 1-5.4 5.4L4 17v3h3l5.3-5.3a4 4 0 0 1 5.4-5.4l-2.5 2.5-1.5-1.5 2.5-2.5z"),
    "unknown": "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM9.5 9a2.5 2.5 0 1 1 3 2.4V14m0 3h.01",
    "deps": (
        "M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5"
        " 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"
    ),
}


def _empty_severities() -> dict[str, int]:
    return {s: 0 for s in SEVERITY_ORDER}


def _stat_tile(out: TextIO, path: str, value, label: str) -> None:
    out.write(
        '\t\t\t\t<div class="bento-cell bento-stat bento-card'
        ' bento-card--glass bento-card--interactive">\n'
        '\t\t\t\t\t<span class="bento-icon-tile">\n'
        '\t\t\t\t\t\t<svg viewBox="0 0 24 24" width="16" height="16"'
        ' fill="none" stroke="currentColor" stroke-width="1.75"'
        ' stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
        f'<path d="{path}" /></svg>\n'
        "\t\t\t\t\t</span>\n"
        f'\t\t\t\t\t<span class="bento-stat__value">{value}</span>\n'
        f'\t\t\t\t\t<span class="bento-stat__label">{label}</span>\n'
        "\t\t\t\t</div>\n"
    )


def _linkcard(out: TextIO, path: str, title: str, copy: str, href: str | None = None) -> None:
    tag = "a" if href else "div"
    attrs = f' href="{href}"' if href else ""
    out.write(
        f'\t\t<{tag} class="bento-cell bento-linkcard bento-card'
        ' bento-card--glass bento-card--interactive"'
        f"{attrs}>\n"
        '\t\t\t<span class="bento-icon-tile">\n'
        '\t\t\t\t<svg viewBox="0 0 24 24" width="18" height="18" fill="none"'
        ' stroke="currentColor" stroke-width="1.75" stroke-linecap="round"'
        ' stroke-linejoin="round" aria-hidden="true">'
        f'<path d="{path}" /></svg>\n'
        "\t\t\t</span>\n"
        f'\t\t\t<span class="bento-linkcard__title">{title}</span>\n'
        f'\t\t\t<span class="bento-linkcard__copy">{copy}</span>\n'
    )
    if href:
        out.write(
            '\t\t\t<span class="bento-linkcard__go" aria-hidden="true">\n'
            '\t\t\t\t<svg viewBox="0 0 24 24" width="16" height="16"'
            ' fill="none" stroke="currentColor" stroke-width="2"'
            ' stroke-linecap="round" stroke-linejoin="round">'
            '<path d="M5 12h14M13 6l6 6-6 6" /></svg>\n'
            "\t\t\t</span>\n"
        )
    out.write(f"\t\t</{tag}>\n")


def _slice_label(name: str) -> str:
    return name.replace('"', "'").replace("\n", " ")[:40]


# Past roughly six segments adjacent wedges blur together and the legend stops
# being scannable, so the tail folds into a single "Other" slice. The full
# breakdown always remains in the table alongside each chart.
_MAX_SLICES = 6


def _folded_slices(
    pairs: list[tuple[str, float]],
    limit: int = _MAX_SLICES,
) -> list[Slice]:
    """Drop empty entries and fold everything past *limit* into "Other"."""
    kept = [(label, value) for label, value in pairs if value > 0]
    if len(kept) <= limit:
        return [Slice(_slice_label(label), value) for label, value in kept]

    ranked = sorted(kept, key=lambda kv: kv[1], reverse=True)
    head = {label for label, _ in ranked[: limit - 1]}
    tail = sum(value for label, value in kept if label not in head)
    return [Slice(_slice_label(label), value) for label, value in kept if label in head] + [Slice("Other", tail)]


# ── Shared Bento hero ────────────────────────────────────────────────


def _hero_open(
    out: TextIO,
    aria: str,
    badge_path: str,
    title_main: str,
    title_accent: str,
    lede: str,
    timestamp: str,
    primary_href: str,
    primary_label: str,
    ghost_links: list,
) -> None:
    out.write(
        f'<section class="bento-hero bento-section not-content"'
        f' aria-label="{aria}">\n'
        '\t<div class="bento-hero__bg" aria-hidden="true"></div>\n'
        '\t<div class="bento-hero__frame bento-frame">\n'
        '\t\t<div class="bento-board bento-board--hero">\n'
        '\t\t\t<div class="bento-cell bento-hero-copy bento-card'
        ' bento-card--glass">\n'
        '\t\t\t\t<span class="bento-badge bento-chip">\n'
        '\t\t\t\t\t<svg viewBox="0 0 24 24" width="14" height="14"'
        ' fill="none" stroke="currentColor" stroke-width="1.75"'
        ' stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
        f'<path d="{badge_path}" /></svg>\n'
        "\t\t\t\t\t<span>auto-generated · daily</span>\n"
        "\t\t\t\t</span>\n"
        '\t\t\t\t<h1 class="bento-title">\n'
        f"\t\t\t\t\t{title_main}\n"
        f'\t\t\t\t\t<span class="bento-title__accent">{title_accent}</span>\n'
        "\t\t\t\t</h1>\n"
        f'\t\t\t\t<p class="bento-lede">{lede}</p>\n'
        f'\t\t\t\t<p class="bento-lede">Last generated'
        f" <strong>{timestamp}</strong>.</p>\n"
        '\t\t\t\t<div class="bento-cta">\n'
        f'\t\t\t\t\t<a class="bento-btn bento-btn--primary"'
        f' href="{primary_href}">\n'
        f"\t\t\t\t\t\t{primary_label}\n"
        '\t\t\t\t\t\t<svg viewBox="0 0 24 24" fill="none"'
        ' stroke="currentColor" aria-hidden="true"><path'
        ' stroke-linecap="round" stroke-linejoin="round" stroke-width="2"'
        ' d="M5 12h14M13 6l6 6-6 6" /></svg>\n'
        "\t\t\t\t\t</a>\n"
    )
    for label, href in ghost_links:
        out.write(f'\t\t\t\t\t<a class="bento-btn bento-btn--ghost" href="{href}">{label}</a>\n')
    out.write("\t\t\t\t</div>\n\t\t\t</div>\n\n")


def _hero_close(out: TextIO, chips: list) -> None:
    out.write('\t\t</div>\n\t\t<nav class="bento-jump" aria-label="On this page">\n')
    for label, href in chips:
        out.write(f'\t\t\t<a class="bento-chip" href="{href}">{label}</a>\n')
    out.write("\t\t</nav>\n\t</div>\n</section>\n\n")


def _about(out: TextIO) -> None:
    out.write('<BentoProse id="about">\n\n---\n\n')
    out.write(
        "*Auto-generated by "
        "[ci-daily-content.yml]"
        "(https://github.com/KBVE/kbve/actions/"
        "workflows/ci-daily-content.yml)*\n\n"
    )
    out.write("</BentoProse>\n\n")
