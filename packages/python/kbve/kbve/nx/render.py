"""Render parsed Nx security and graph data into Starlight MDX and JSON.

The parse layer (:mod:`kbve.nx.security`, :mod:`kbve.nx.graph`) produces
plain data; these renderers turn that data into the exact MDX/JSON emitted
by the ``ci-daily-content`` workflow (router → builder routes).

The MDX pages use the site's Bento design system (``template: splash`` +
``BentoShell``/``BentoProse`` + ``bento.css`` classes) to match the rest of
the dashboard. Card markup is emitted statically per item (no ``export
const`` + ``{arr.map()}`` JSX) so generated content stays deterministic and
JSX-runtime-free.
"""

from __future__ import annotations

import json
import re
from typing import TextIO

from ..mdx.escape import escape_mdx
from .graph import GraphData, mermaid_id, top_hubs
from .security import SEVERITY_ORDER

SEVERITY_LABELS = {
    "critical": "Critical",
    "high": "High",
    "medium": "Medium",
    "low": "Low",
    "info": "Info",
}

SEVERITY_SVG = {
    "critical": (
        "M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71"
        " 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01"
    ),
    "high": "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM12 8v4M12 16h.01",
    "medium": "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM12 16v-4M12 8h.01",
    "low": "M22 11.08V12a10 10 0 1 1-5.93-9.14M22 4 12 14.01l-3-3",
    "info": (
        "M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1zM4 22v-7"
    ),
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
    "codeql": (
        "M21 21l-6-6M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z"
    ),
    "dependabot": (
        "M6 3v12M18 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM6 21a3 3 0 1 0 0-6 3 3 0 0"
        " 0 0 6zM15 6a9 9 0 0 1-9 9"
    ),
}

ECOSYSTEM_ORDER = ["npm", "cargo", "python", "codeql", "dependabot"]

TYPE_STYLES = {
    "app": (":::app", "fill:#3b82f6,stroke:#1d4ed8,color:#fff"),
    "lib": (":::lib", "fill:#10b981,stroke:#059669,color:#fff"),
    "e2e": (":::e2e", "fill:#f59e0b,stroke:#d97706,color:#fff"),
}

TYPE_LABELS = {"app": "Apps", "lib": "Libs", "e2e": "E2E"}

TYPE_SVG = {
    "app": (
        "M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18"
        " 2.18 0 0 0-2.91-.09zM12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1"
        " 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"
    ),
    "lib": "M4 4h7v7H4zM13 13h7v7h-7zM13 4h7v7h-7zM4 13h7v7H4z",
    "e2e": "M22 11.08V12a10 10 0 1 1-5.93-9.14M22 4 12 14.01l-3-3",
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
        '\t\t\t\t\t</span>\n'
        f'\t\t\t\t\t<span class="bento-stat__value">{value}</span>\n'
        f'\t\t\t\t\t<span class="bento-stat__label">{label}</span>\n'
        '\t\t\t\t</div>\n'
    )


def _linkcard(out: TextIO, path: str, title: str, copy: str,
              href: str | None = None) -> None:
    tag = "a" if href else "div"
    attrs = f' href="{href}"' if href else ""
    out.write(
        f'\t\t<{tag} class="bento-cell bento-linkcard bento-card'
        ' bento-card--glass bento-card--interactive"'
        f'{attrs}>\n'
        '\t\t\t<span class="bento-icon-tile">\n'
        '\t\t\t\t<svg viewBox="0 0 24 24" width="18" height="18" fill="none"'
        ' stroke="currentColor" stroke-width="1.75" stroke-linecap="round"'
        ' stroke-linejoin="round" aria-hidden="true">'
        f'<path d="{path}" /></svg>\n'
        '\t\t\t</span>\n'
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
            '\t\t\t</span>\n'
        )
    out.write(f'\t\t</{tag}>\n')


# ── Security ─────────────────────────────────────────────────────────

def render_security_json(data: dict) -> str:
    """Serialize the structured security payload to JSON."""
    return json.dumps(data, indent=2)


def render_security_mdx(data: dict, timestamp: str) -> str:
    """Render the Bento-native MDX security report."""
    from io import StringIO

    summary = data["summary"]
    ecosystems = data["ecosystems"]
    total = sum(summary.values())
    crit_high = summary["critical"] + summary["high"]
    out = StringIO()

    out.write(
        "---\n"
        "title: Security Audit Report\n"
        "description: |\n"
        "    Daily auto-generated security audit"
        " for the KBVE monorepo.\n"
        "template: splash\n"
        "tableOfContents: false\n"
        "editUrl: false\n"
        "lastUpdated: false\n"
        "next: false\n"
        "prev: false\n"
        "sidebar:\n"
        "    label: Security\n"
        "    order: 102\n"
        "---\n\n"
    )
    out.write(
        "import BentoShell from '@/components/hero/BentoShell.astro';\n"
        "import BentoProse from '@/components/hero/BentoProse.astro';\n\n"
    )

    if crit_high > 0:
        lede = (
            f"<strong>{crit_high}</strong> critical/high severity"
            f" finding{'s' if crit_high != 1 else ''}"
            " across the monorepo — triage before merge."
        )
    elif total > 0:
        lede = (
            f"<strong>{total}</strong> finding{'s' if total != 1 else ''}"
            " tracked — none critical or high."
        )
    else:
        lede = "No security findings detected across any ecosystem."

    out.write(
        '<div class="sec-report" data-dash-report>\n\n'
    )

    out.write(
        '<section class="bento-hero bento-section not-content"'
        ' aria-label="Security audit">\n'
        '\t<div class="bento-hero__bg" aria-hidden="true"></div>\n'
        '\t<div class="bento-hero__frame bento-frame">\n'
        '\t\t<div class="bento-board bento-board--hero">\n'
        '\t\t\t<div class="bento-cell bento-hero-copy bento-card'
        ' bento-card--glass">\n'
        '\t\t\t\t<span class="bento-badge bento-chip">\n'
        '\t\t\t\t\t<svg viewBox="0 0 24 24" width="14" height="14"'
        ' fill="none" stroke="currentColor" stroke-width="1.75"'
        ' stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
        '<path d="M12 2 4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5z" /></svg>\n'
        '\t\t\t\t\t<span>auto-generated · daily</span>\n'
        '\t\t\t\t</span>\n'
        '\t\t\t\t<h1 class="bento-title">\n'
        '\t\t\t\t\tSecurity posture\n'
        '\t\t\t\t\t<span class="bento-title__accent">across every'
        ' ecosystem.</span>\n'
        '\t\t\t\t</h1>\n'
        f'\t\t\t\t<p class="bento-lede">{lede}</p>\n'
        f'\t\t\t\t<p class="bento-lede">Last generated'
        f' <strong>{timestamp}</strong>.</p>\n'
        '\t\t\t\t<div class="bento-cta">\n'
        '\t\t\t\t\t<a class="bento-btn bento-btn--primary" href="#findings">\n'
        '\t\t\t\t\t\tView findings\n'
        '\t\t\t\t\t\t<svg viewBox="0 0 24 24" fill="none"'
        ' stroke="currentColor" aria-hidden="true"><path'
        ' stroke-linecap="round" stroke-linejoin="round" stroke-width="2"'
        ' d="M5 12h14M13 6l6 6-6 6" /></svg>\n'
        '\t\t\t\t\t</a>\n'
        '\t\t\t\t\t<a class="bento-btn bento-btn--ghost"'
        ' href="#ecosystems">Ecosystems</a>\n'
        '\t\t\t\t\t<a class="bento-btn bento-btn--ghost"'
        ' href="/dashboard/">Dashboard home</a>\n'
        '\t\t\t\t</div>\n'
        '\t\t\t</div>\n\n'
    )

    for sev in SEVERITY_ORDER:
        _stat_tile(
            out, SEVERITY_SVG[sev], summary[sev], SEVERITY_LABELS[sev]
        )

    out.write(
        '\t\t</div>\n'
        '\t\t<nav class="bento-jump" aria-label="On this page">\n'
        '\t\t\t<a class="bento-chip" href="#ecosystems">Ecosystems</a>\n'
        '\t\t\t<a class="bento-chip" href="#findings">Findings</a>\n'
        '\t\t</nav>\n'
        '\t</div>\n'
        '</section>\n\n'
    )

    out.write(
        '<BentoShell id="ecosystems" eyebrow="Coverage"'
        ' heading="Ecosystem breakdown">\n'
        '\t<div class="bento-board bento-board--cols-3">\n'
    )
    for eco_name in ECOSYSTEM_ORDER:
        eco = ecosystems.get(eco_name, {})
        count = eco.get("total", 0)
        label = ECOSYSTEM_LABELS[eco_name]
        item_word = "alerts" if eco_name in (
            "codeql", "dependabot") else "advisories"
        copy = f"{count} {item_word}"
        _linkcard(
            out, ECOSYSTEM_SVG[eco_name], label, copy,
            href=f"#eco-{eco_name}",
        )
    out.write("\t</div>\n</BentoShell>\n\n")

    out.write('<BentoProse id="findings" heading="Advisories">\n\n')

    has_findings = any(summary[s] > 0 for s in SEVERITY_ORDER[:4])
    if has_findings:
        out.write("### Severity distribution\n\n")
        out.write("```mermaid\n")
        out.write("pie showData\n")
        out.write("    title Findings by Severity\n")
        for sev in SEVERITY_ORDER[:4]:
            if summary[sev] > 0:
                out.write(f'    "{SEVERITY_LABELS[sev]}" : {summary[sev]}\n')
        out.write("```\n\n")

    eco_totals = {
        ECOSYSTEM_LABELS[e]: ecosystems.get(e, {}).get("total", 0)
        for e in ECOSYSTEM_ORDER
    }
    if any(v > 0 for v in eco_totals.values()):
        out.write("### Findings by ecosystem\n\n")
        out.write("```mermaid\n")
        out.write("pie showData\n")
        out.write("    title Findings by Ecosystem\n")
        for label, count in eco_totals.items():
            if count > 0:
                out.write(f'    "{label}" : {count}\n')
        out.write("```\n\n")

    out.write("### Summary\n\n")
    out.write(
        "| Ecosystem | Critical | High | Medium | Low | Total |\n"
        "|-----------|:--------:|:----:|:------:|:---:|:-----:|\n"
    )
    for eco_name in ECOSYSTEM_ORDER:
        eco = ecosystems.get(eco_name, {})
        sevs = eco.get("severities", _empty_severities())
        eco_total = eco.get("total", 0)
        label = ECOSYSTEM_LABELS[eco_name]
        out.write(
            f"| **{label}** "
            f"| {sevs.get('critical', 0)} "
            f"| {sevs.get('high', 0)} "
            f"| {sevs.get('medium', 0)} "
            f"| {sevs.get('low', 0)} "
            f"| {eco_total} |\n"
        )
    out.write(
        f"| **Total** "
        f"| {summary['critical']} "
        f"| {summary['high']} "
        f"| {summary['medium']} "
        f"| {summary['low']} "
        f"| {total} |\n\n"
    )

    _write_advisory_section(out, "npm", "npm", ecosystems.get("npm", {}))
    _write_advisory_section(out, "cargo", "Cargo", ecosystems.get("cargo", {}))
    _write_advisory_section(
        out, "python", "Python", ecosystems.get("python", {}))
    _write_codeql_section(out, ecosystems.get("codeql", {}))
    _write_dependabot_section(out, ecosystems.get("dependabot", {}))

    out.write("</BentoProse>\n\n")

    out.write('<BentoProse id="about">\n\n')
    out.write("---\n\n")
    out.write(
        "*Auto-generated by "
        "[ci-daily-content.yml]"
        "(https://github.com/KBVE/kbve/actions/"
        "workflows/ci-daily-content.yml)*\n\n"
    )
    out.write("</BentoProse>\n\n")

    out.write("</div>\n\n")
    out.write(
        "<style is:global>{`.sec-report{--bento-accent:#f59e0b;"
        "--bento-accent-2:#f43f5e}`}</style>\n"
    )

    return out.getvalue()


def _write_advisory_section(out: TextIO, eco_name: str, label: str,
                            eco: dict, key: str = "advisories") -> None:
    out.write(f'<span id="eco-{eco_name}"></span>\n\n')
    out.write(f"### {label}\n\n")
    items = eco.get(key, [])
    if not items:
        out.write(
            ":::tip[All Clear]\n"
            f"No {label.lower()} advisories found.\n"
            ":::\n\n"
        )
        return
    out.write(
        "| Severity | Package | Advisory | Link |\n"
        "|----------|---------|----------|------|\n"
    )
    for item in sorted(items, key=lambda x: SEVERITY_ORDER.index(
            x.get("severity", "medium"))):
        sev = item.get("severity", "medium").capitalize()
        pkg = item.get("package", "")
        title = item.get("title", item.get("id", ""))
        if len(title) > 60:
            title = title[:57] + "..."
        title = escape_mdx(title)
        url = item.get("url", "")
        link = f"[Details]({url})" if url else ""
        out.write(f"| {sev} | `{pkg}` | {title} | {link} |\n")
    out.write("\n")


def _write_codeql_section(out: TextIO, eco: dict) -> None:
    out.write('<span id="eco-codeql"></span>\n\n')
    out.write("### CodeQL\n\n")
    alerts = eco.get("alerts", [])
    if not alerts:
        out.write(
            ":::tip[All Clear]\n"
            "No open CodeQL alerts.\n"
            ":::\n\n"
        )
        return
    out.write(
        "| Severity | Rule | Path | Link |\n"
        "|----------|------|------|------|\n"
    )
    for alert in sorted(alerts, key=lambda x: SEVERITY_ORDER.index(
            x.get("severity", "medium"))):
        sev = alert.get("severity", "medium").capitalize()
        rule = alert.get("rule_id", "")
        path = alert.get("path", "")
        if len(path) > 50:
            path = "..." + path[-47:]
        url = alert.get("url", "")
        link = f"[Details]({url})" if url else ""
        out.write(f"| {sev} | `{rule}` | `{path}` | {link} |\n")
    out.write("\n")


def _write_dependabot_section(out: TextIO, eco: dict) -> None:
    out.write('<span id="eco-dependabot"></span>\n\n')
    out.write("### Dependabot\n\n")
    alerts = eco.get("alerts", [])
    if not alerts:
        out.write(
            ":::tip[All Clear]\n"
            "No open Dependabot alerts.\n"
            ":::\n\n"
        )
        return
    out.write(
        "| Severity | Package | Ecosystem | Summary | Link |\n"
        "|----------|---------|-----------|---------|------|\n"
    )
    for alert in sorted(alerts, key=lambda x: SEVERITY_ORDER.index(
            x.get("severity", "medium"))):
        sev = alert.get("severity", "medium").capitalize()
        pkg = alert.get("package", "")
        eco_name = alert.get("ecosystem", "")
        summary = alert.get("summary", "")
        if len(summary) > 50:
            summary = summary[:47] + "..."
        url = alert.get("url", "")
        link = f"[Details]({url})" if url else ""
        out.write(
            f"| {sev} | `{pkg}` | {eco_name}"
            f" | {summary} | {link} |\n"
        )
    out.write("\n")


# ── Graph ────────────────────────────────────────────────────────────

def render_graph_mdx(graph: GraphData, timestamp: str) -> str:
    """Render the Bento-native MDX Nx dependency-graph page."""
    from io import StringIO

    nodes = graph.nodes
    deps = graph.deps
    by_type = graph.by_type
    rows = graph.rows
    seen_edges = graph.edges
    edges_by_source = graph.edges_by_source
    top_depended = top_hubs(rows, 5)
    out = StringIO()

    out.write(
        "---\n"
        "title: NX Dependency Graph\n"
        "description: |\n"
        "    Daily auto-generated NX project dependency graph"
        " for the KBVE monorepo.\n"
        "template: splash\n"
        "tableOfContents: false\n"
        "editUrl: false\n"
        "lastUpdated: false\n"
        "next: false\n"
        "prev: false\n"
        "sidebar:\n"
        "    label: Graph\n"
        "    order: 101\n"
        "---\n\n"
    )
    out.write(
        "import BentoShell from '@/components/hero/BentoShell.astro';\n"
        "import BentoProse from '@/components/hero/BentoProse.astro';\n\n"
    )

    lede = (
        f"<strong>{len(nodes)}</strong> projects wired by"
        f" <strong>{len(seen_edges)}</strong> dependency"
        f" edge{'s' if len(seen_edges) != 1 else ''}."
    )

    out.write('<div class="graph-report" data-dash-report>\n\n')

    out.write(
        '<section class="bento-hero bento-section not-content"'
        ' aria-label="NX dependency graph">\n'
        '\t<div class="bento-hero__bg" aria-hidden="true"></div>\n'
        '\t<div class="bento-hero__frame bento-frame">\n'
        '\t\t<div class="bento-board bento-board--hero">\n'
        '\t\t\t<div class="bento-cell bento-hero-copy bento-card'
        ' bento-card--glass">\n'
        '\t\t\t\t<span class="bento-badge bento-chip">\n'
        '\t\t\t\t\t<svg viewBox="0 0 24 24" width="14" height="14"'
        ' fill="none" stroke="currentColor" stroke-width="1.75"'
        ' stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
        '<path d="M6 3v12M18 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM6 21a3 3 0 1 0'
        ' 0-6 3 3 0 0 0 0 6zM15 6a9 9 0 0 1-9 9" /></svg>\n'
        '\t\t\t\t\t<span>auto-generated · daily</span>\n'
        '\t\t\t\t</span>\n'
        '\t\t\t\t<h1 class="bento-title">\n'
        '\t\t\t\t\tDependency graph\n'
        '\t\t\t\t\t<span class="bento-title__accent">across the'
        ' monorepo.</span>\n'
        '\t\t\t\t</h1>\n'
        f'\t\t\t\t<p class="bento-lede">{lede}</p>\n'
        f'\t\t\t\t<p class="bento-lede">Last generated'
        f' <strong>{timestamp}</strong>.</p>\n'
        '\t\t\t\t<div class="bento-cta">\n'
        '\t\t\t\t\t<a class="bento-btn bento-btn--primary" href="#diagram">\n'
        '\t\t\t\t\t\tView diagram\n'
        '\t\t\t\t\t\t<svg viewBox="0 0 24 24" fill="none"'
        ' stroke="currentColor" aria-hidden="true"><path'
        ' stroke-linecap="round" stroke-linejoin="round" stroke-width="2"'
        ' d="M5 12h14M13 6l6 6-6 6" /></svg>\n'
        '\t\t\t\t\t</a>\n'
        '\t\t\t\t\t<a class="bento-btn bento-btn--ghost"'
        ' href="#hubs">Top hubs</a>\n'
        '\t\t\t\t\t<a class="bento-btn bento-btn--ghost"'
        ' href="#project-index">Projects</a>\n'
        '\t\t\t\t</div>\n'
        '\t\t\t</div>\n\n'
    )

    _stat_tile(out, TYPE_SVG["app"], len(by_type.get("app", set())), "Apps")
    _stat_tile(out, TYPE_SVG["lib"], len(by_type.get("lib", set())), "Libs")
    _stat_tile(out, TYPE_SVG["e2e"], len(by_type.get("e2e", set())), "E2E")
    _stat_tile(out, TYPE_SVG["deps"], len(seen_edges), "Dependencies")

    out.write(
        '\t\t</div>\n'
        '\t\t<nav class="bento-jump" aria-label="On this page">\n'
        '\t\t\t<a class="bento-chip" href="#hubs">Hubs</a>\n'
        '\t\t\t<a class="bento-chip" href="#diagram">Diagram</a>\n'
        '\t\t\t<a class="bento-chip" href="#project-index">Projects</a>\n'
        '\t\t</nav>\n'
        '\t</div>\n'
        '</section>\n\n'
    )

    out.write(
        '<BentoShell id="hubs" eyebrow="Connectivity"'
        ' heading="Most depended-on">\n'
        '\t<div class="bento-board bento-board--cols-3">\n'
    )
    any_hub = False
    for row in top_depended:
        if row.dependent_count == 0:
            continue
        any_hub = True
        path = TYPE_SVG.get(row.project_type, TYPE_SVG["deps"])
        copy = (
            f"{row.dependent_count} project"
            f"{'s' if row.dependent_count != 1 else ''} depend on this"
            f" {row.project_type} · {row.root}"
        )
        _linkcard(out, path, row.name, copy)
    if not any_hub:
        _linkcard(
            out, TYPE_SVG["deps"], "No hubs",
            "No project is depended on by another yet.",
        )
    out.write("\t</div>\n</BentoShell>\n\n")

    out.write('<BentoProse id="diagram" heading="Dependency diagram">\n\n')

    out.write("### Project distribution\n\n")
    out.write("```mermaid\n")
    out.write("pie showData\n")
    out.write("    title Projects by Type\n")
    for ptype in sorted(by_type):
        label = ptype.capitalize() + "s"
        out.write(f'    "{label}" : {len(by_type[ptype])}\n')
    out.write("```\n\n")

    if top_depended and top_depended[0].dependent_count > 0:
        out.write("### Hub connectivity\n\n")
        out.write("```mermaid\n")
        out.write("pie showData\n")
        out.write("    title Dependents per Hub\n")
        for row in top_depended:
            if row.dependent_count > 0:
                out.write(f'    "{row.name}" : {row.dependent_count}\n')
        out.write("```\n\n")

    out.write("### Graph\n\n")
    if len(seen_edges) <= 200:
        mermaid_lines = ["graph LR"]
        for ptype, (_, style) in TYPE_STYLES.items():
            mermaid_lines.append(f"    classDef {ptype} {style}")
        for src, targets in sorted(edges_by_source.items()):
            src_id = mermaid_id(src)
            for tgt in sorted(targets):
                tgt_id = mermaid_id(tgt)
                mermaid_lines.append(
                    f'    {src_id}["{src}"]'
                    f' --> {tgt_id}["{tgt}"]'
                )
        for ptype, node_names in by_type.items():
            if ptype in TYPE_STYLES:
                ids = ",".join(mermaid_id(n) for n in node_names)
                mermaid_lines.append("    class {} {}".format(ids, ptype))

        out.write("```mermaid\n")
        out.write("\n".join(mermaid_lines))
        out.write("\n```\n\n")
        out.write(
            ":::tip[Legend]\n"
            "**Blue** = Application &nbsp; "
            "**Green** = Library &nbsp; "
            "**Amber** = E2E Test\n"
            ":::\n\n"
        )
    else:
        out.write(
            ":::caution\n"
            "Dependency diagram omitted — "
            "too many edges for inline rendering.\n"
            ":::\n\n"
        )

    out.write("</BentoProse>\n\n")

    out.write('<BentoProse id="project-index" heading="Project index">\n\n')
    out.write(
        "| Project | Type | Root | Deps | Dependents |\n"
        "|---------|------|------|:----:|:----------:|\n"
    )
    for row in rows:
        out.write(
            f"| **{row.name}** | {row.project_type} | `{row.root}` "
            f"| {row.dep_count} | {row.dependent_count} |\n"
        )
    out.write("\n")

    for ptype in sorted(by_type):
        type_projects = [
            n for n in sorted(by_type[ptype]) if deps.get(n)
        ]
        if not type_projects:
            continue
        out.write(f"#### {ptype.capitalize()} Projects\n\n")
        for name in type_projects:
            dep_list = deps[name]
            out.write("<details>\n")
            out.write(
                f"<summary><strong>{name}</strong>"
                f" ({len(dep_list)} dep"
                f"{'s' if len(dep_list) != 1 else ''})"
                "</summary>\n\n"
            )
            out.write("| Target | Type |\n|--------|------|\n")
            for d in sorted(dep_list, key=lambda x: x["target"]):
                out.write(f"| {d['target']} | {d['type']} |\n")
            out.write("\n</details>\n\n")

    out.write("</BentoProse>\n\n")

    out.write('<BentoProse id="about">\n\n')
    out.write("---\n\n")
    out.write(
        "*Auto-generated by "
        "[ci-daily-content.yml]"
        "(https://github.com/KBVE/kbve/actions/"
        "workflows/ci-daily-content.yml)*\n\n"
    )
    out.write("</BentoProse>\n\n")

    out.write("</div>\n\n")
    out.write(
        "<style is:global>{`.graph-report{--bento-accent:#a78bfa;"
        "--bento-accent-2:#38bdf8}`}</style>\n"
    )

    return out.getvalue()


# ── Report ───────────────────────────────────────────────────────────

REPORT_ENV_SVG = {
    "node": (
        "M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2"
        " 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16zM3.27 6.96"
        " 12 12.01l8.73-5.05M12 22.08V12"
    ),
    "nx": "M4 4h7v7H4zM13 13h7v7h-7zM13 4h7v7h-7zM4 13h7v7H4z",
    "pnpm": "M12 2 2 7l10 5 10-5zM2 17l10 5 10-5M2 12l10 5 10-5",
    "os": "M2 3h20v14H2zM8 21h8M12 17v4",
}


def parse_report(raw: str) -> dict:
    """Extract ``{node, nx, pnpm, os}`` from raw ``pnpm nx report`` text.

    Mirrors the ``ci-dashboard`` bash: node/os/pnpm are the value after the
    first ``:`` on their labelled line; nx is the last whitespace token on the
    ``nx `` line. Missing fields degrade to the empty string.
    """
    env = {"node": "", "nx": "", "pnpm": "", "os": ""}
    for line in raw.splitlines():
        if line.startswith("Node") and not env["node"]:
            env["node"] = line.split(":", 1)[1].strip() if ":" in line else ""
        elif line.startswith("OS") and not env["os"]:
            env["os"] = line.split(":", 1)[1].strip() if ":" in line else ""
        elif line.startswith("pnpm") and not env["pnpm"]:
            env["pnpm"] = line.split(":", 1)[1].strip() if ":" in line else ""
        elif line.startswith("nx ") and not env["nx"]:
            env["nx"] = line.split()[-1].strip()
    return env


def render_report_json(data: dict) -> str:
    """Serialize the frozen NX report payload to JSON."""
    return json.dumps(data, indent=2)


def render_report_mdx(data: dict, timestamp: str) -> str:
    """Render the Bento-native MDX NX workspace report."""
    from io import StringIO

    env = data.get("environment", {})
    node = env.get("node", "")
    nx = env.get("nx", "")
    pnpm = env.get("pnpm", "")
    os_info = env.get("os", "")
    out = StringIO()

    out.write(
        "---\n"
        "title: NX Workspace Report\n"
        "description: |\n"
        "    Daily auto-generated NX workspace report"
        " for the KBVE monorepo.\n"
        "template: splash\n"
        "tableOfContents: false\n"
        "editUrl: false\n"
        "lastUpdated: false\n"
        "next: false\n"
        "prev: false\n"
        "sidebar:\n"
        "    label: Report\n"
        "    order: 100\n"
        "---\n\n"
    )
    out.write(
        "import BentoShell from '@/components/hero/BentoShell.astro';\n"
        "import BentoProse from '@/components/hero/BentoProse.astro';\n"
        "import AstroNxReport from"
        " '@/components/dashboard/AstroNxReport.astro';\n\n"
    )

    lede = (
        f"Node <strong>{node}</strong> · Nx <strong>{nx}</strong>"
        f" · pnpm <strong>{pnpm}</strong> on <strong>{os_info}</strong>."
    )

    out.write('<div class="nx-report" data-dash-report>\n\n')

    out.write(
        '<section class="bento-hero bento-section not-content"'
        ' aria-label="NX workspace report">\n'
        '\t<div class="bento-hero__bg" aria-hidden="true"></div>\n'
        '\t<div class="bento-hero__frame bento-frame">\n'
        '\t\t<div class="bento-board bento-board--hero">\n'
        '\t\t\t<div class="bento-cell bento-hero-copy bento-card'
        ' bento-card--glass">\n'
        '\t\t\t\t<span class="bento-badge bento-chip">\n'
        '\t\t\t\t\t<svg viewBox="0 0 24 24" width="14" height="14"'
        ' fill="none" stroke="currentColor" stroke-width="1.75"'
        ' stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
        '<path d="M12 2 2 7l10 5 10-5zM2 17l10 5 10-5M2 12l10 5 10-5"'
        ' /></svg>\n'
        '\t\t\t\t\t<span>auto-generated · daily</span>\n'
        '\t\t\t\t</span>\n'
        '\t\t\t\t<h1 class="bento-title">\n'
        '\t\t\t\t\tNX workspace\n'
        '\t\t\t\t\t<span class="bento-title__accent">report.</span>\n'
        '\t\t\t\t</h1>\n'
        f'\t\t\t\t<p class="bento-lede">{lede}</p>\n'
        f'\t\t\t\t<p class="bento-lede">Last generated'
        f' <strong>{timestamp}</strong>.</p>\n'
        '\t\t\t\t<div class="bento-cta">\n'
        '\t\t\t\t\t<a class="bento-btn bento-btn--primary" href="#insights">\n'
        '\t\t\t\t\t\tView insights\n'
        '\t\t\t\t\t\t<svg viewBox="0 0 24 24" fill="none"'
        ' stroke="currentColor" aria-hidden="true"><path'
        ' stroke-linecap="round" stroke-linejoin="round" stroke-width="2"'
        ' d="M5 12h14M13 6l6 6-6 6" /></svg>\n'
        '\t\t\t\t\t</a>\n'
        '\t\t\t\t\t<a class="bento-btn bento-btn--ghost"'
        ' href="#raw">Raw output</a>\n'
        '\t\t\t\t\t<a class="bento-btn bento-btn--ghost"'
        ' href="/dashboard/">Dashboard home</a>\n'
        '\t\t\t\t</div>\n'
        '\t\t\t</div>\n\n'
    )

    _stat_tile(out, REPORT_ENV_SVG["node"], node, "Node")
    _stat_tile(out, REPORT_ENV_SVG["nx"], nx, "Nx")
    _stat_tile(out, REPORT_ENV_SVG["pnpm"], pnpm, "pnpm")
    _stat_tile(out, REPORT_ENV_SVG["os"], os_info, "OS")

    out.write(
        '\t\t</div>\n'
        '\t\t<nav class="bento-jump" aria-label="On this page">\n'
        '\t\t\t<a class="bento-chip" href="#insights">Insights</a>\n'
        '\t\t\t<a class="bento-chip" href="#raw">Raw output</a>\n'
        '\t\t</nav>\n'
        '\t</div>\n'
        '</section>\n\n'
    )

    out.write(
        '<BentoShell id="insights" eyebrow="Workspace"'
        ' heading="Report insights">\n'
        '\t<AstroNxReport />\n'
        '</BentoShell>\n\n'
    )

    out.write('<BentoProse id="raw" heading="Raw output">\n\n')

    out.write("### NX Report\n\n")
    out.write("```\n")
    out.write(data.get("nx_report", ""))
    out.write("\n```\n\n")

    out.write("### LOC Statistics\n\n")
    out.write("```\n")
    out.write(data.get("loc_stats", ""))
    out.write("\n```\n\n")

    coverage = data.get("coverage")
    if coverage:
        out.write("### Coverage\n\n")
        out.write("```\n")
        out.write(re.sub(r"<([/a-zA-Z])", r"&lt;\1", coverage))
        out.write("\n```\n\n")

    out.write("</BentoProse>\n\n")

    out.write('<BentoProse id="about">\n\n')
    out.write("---\n\n")
    out.write(
        "*Auto-generated by "
        "[ci-daily-content.yml]"
        "(https://github.com/KBVE/kbve/actions/"
        "workflows/ci-daily-content.yml)*\n\n"
    )
    out.write("</BentoProse>\n\n")

    out.write("</div>\n\n")
    out.write(
        "<style is:global>{`.nx-report{--bento-accent:#10b981;"
        "--bento-accent-2:#38bdf8}`}</style>\n"
    )

    return out.getvalue()
