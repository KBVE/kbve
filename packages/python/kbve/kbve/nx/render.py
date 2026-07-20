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


# ── Kanban ───────────────────────────────────────────────────────────

KANBAN_COLUMNS = [
    "Theory", "AI", "Todo", "Backlog", "Error",
    "Support", "Staging", "Review", "Done",
]

_PLANNING_COLS = ("Theory", "AI", "Backlog")
_ACTIVE_COLS = ("Todo", "Staging", "Review")
_BLOCKED_COLS = ("Error", "Support")

KANBAN_COL_SVG = {
    "Theory": "M12 2 15 9l7 .5-5.3 4.6L18.5 21 12 17l-6.5 4 1.8-6.9L2 9.5 9 9z",
    "AI": ("M9 2v2m6-2v2M9 20v2m6-2v2M2 9h2m-2 6h2m16-6h2m-2 6h2"
           "M6 6h12v12H6zM9 9h6v6H9z"),
    "Todo": "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01",
    "Backlog": "M12 2 2 7l10 5 10-5zM2 17l10 5 10-5M2 12l10 5 10-5",
    "Error": ("M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0"
              " 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"),
    "Support": ("M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 6a4 4 0 1 0 0 8"
                " 4 4 0 0 0 0-8zM4.9 4.9l3.5 3.5m7.2 7.2 3.5 3.5m0-14.2"
                "-3.5 3.5m-7.2 7.2-3.5 3.5"),
    "Staging": ("M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM19.4 15a1.65 1.65 0 0 0"
                " .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0"
                " 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09"
                "A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2"
                " 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65"
                " 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9"
                "a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06"
                ".06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0"
                " 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82"
                "-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33"
                " 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65"
                " 1.65 0 0 0-1.51 1z"),
    "Review": ("M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7zM12 15a3 3 0"
               " 1 0 0-6 3 3 0 0 0 0 6z"),
    "Done": "M22 11.1V12a10 10 0 1 1-5.9-9.1M22 4 12 14.01l-3-3",
}


def build_kanban_payload(project: dict, columns: dict, summary: dict,
                         timestamp: str) -> dict:
    """Assemble the frozen ``nx-kanban.json`` contract (JS key order)."""
    from .kanban_board import VIEWS

    return {
        "generated_at": timestamp,
        "project": {
            "title": project.get("title", ""),
            "url": project.get("url", ""),
            "total_items": project.get("total_items", 0),
        },
        "summary": summary,
        "columns": columns,
        "views": VIEWS,
    }


def render_kanban_json(payload: dict) -> str:
    """Serialize the kanban payload (tab-indent, trailing newline)."""
    return json.dumps(payload, indent="\t", ensure_ascii=False) + "\n"


def _titlecase_type(t: str) -> str:
    return t.replace("_", " ").title()


def render_kanban_mdx(payload: dict, timestamp: str) -> str:
    """Render the Bento-native MDX kanban board snapshot."""
    from io import StringIO

    project = payload["project"]
    summary = payload["summary"]
    columns = payload["columns"]
    tracked = sum(summary.values())
    active = sum(summary.get(c, 0) for c in _ACTIVE_COLS)
    blocked = sum(summary.get(c, 0) for c in _BLOCKED_COLS)
    planning = sum(summary.get(c, 0) for c in _PLANNING_COLS)
    done = summary.get("Done", 0)
    project_url = project.get("url", "") or "https://github.com/orgs/KBVE/projects/5"
    out = StringIO()

    out.write(
        "---\n"
        "title: Kanban Board Snapshot\n"
        "description: |\n"
        "    Daily auto-generated snapshot of the KBVE project board.\n"
        "template: splash\n"
        "tableOfContents: false\n"
        "editUrl: false\n"
        "lastUpdated: false\n"
        "next: false\n"
        "prev: false\n"
        "sidebar:\n"
        "    label: Kanban Data\n"
        "    order: 111\n"
        "---\n\n"
    )
    out.write(
        "import BentoShell from '@/components/hero/BentoShell.astro';\n"
        "import BentoProse from '@/components/hero/BentoProse.astro';\n\n"
    )

    if tracked == 0:
        lede = "No board items are currently tracked across any column."
    elif blocked > 0:
        lede = (
            f"<strong>{tracked}</strong> item{'s' if tracked != 1 else ''}"
            f" on the board — <strong>{active}</strong> active, "
            f"<strong>{blocked}</strong> blocked."
        )
    else:
        lede = (
            f"<strong>{tracked}</strong> item{'s' if tracked != 1 else ''}"
            f" on the board — <strong>{active}</strong> active, "
            f"<strong>{done}</strong> done."
        )

    out.write('<div class="kanban-report" data-dash-report>\n\n')

    out.write(
        '<section class="bento-hero bento-section not-content"'
        ' aria-label="Project board">\n'
        '\t<div class="bento-hero__bg" aria-hidden="true"></div>\n'
        '\t<div class="bento-hero__frame bento-frame">\n'
        '\t\t<div class="bento-board bento-board--hero">\n'
        '\t\t\t<div class="bento-cell bento-hero-copy bento-card'
        ' bento-card--glass">\n'
        '\t\t\t\t<span class="bento-badge bento-chip">\n'
        '\t\t\t\t\t<svg viewBox="0 0 24 24" width="14" height="14"'
        ' fill="none" stroke="currentColor" stroke-width="1.75"'
        ' stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
        '<path d="M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z" /></svg>\n'
        '\t\t\t\t\t<span>auto-generated · daily</span>\n'
        '\t\t\t\t</span>\n'
        '\t\t\t\t<h1 class="bento-title">\n'
        '\t\t\t\t\tProject board\n'
        '\t\t\t\t\t<span class="bento-title__accent">across every'
        ' column.</span>\n'
        '\t\t\t\t</h1>\n'
        f'\t\t\t\t<p class="bento-lede">{lede}</p>\n'
        f'\t\t\t\t<p class="bento-lede">Last generated'
        f' <strong>{timestamp}</strong>.</p>\n'
        '\t\t\t\t<div class="bento-cta">\n'
        '\t\t\t\t\t<a class="bento-btn bento-btn--primary" href="#columns">\n'
        '\t\t\t\t\t\tView columns\n'
        '\t\t\t\t\t\t<svg viewBox="0 0 24 24" fill="none"'
        ' stroke="currentColor" aria-hidden="true"><path'
        ' stroke-linecap="round" stroke-linejoin="round" stroke-width="2"'
        ' d="M5 12h14M13 6l6 6-6 6" /></svg>\n'
        '\t\t\t\t\t</a>\n'
        f'\t\t\t\t\t<a class="bento-btn bento-btn--ghost"'
        f' href="{project_url}">Open board</a>\n'
        '\t\t\t\t\t<a class="bento-btn bento-btn--ghost"'
        ' href="/dashboard/">Dashboard home</a>\n'
        '\t\t\t\t</div>\n'
        '\t\t\t</div>\n\n'
    )

    _stat_tile(out, KANBAN_COL_SVG["Backlog"], tracked, "Tracked")
    _stat_tile(out, "M13 2 3 14h7l-1 8 10-12h-7z", active, "Active")
    _stat_tile(out, KANBAN_COL_SVG["Error"], blocked, "Blocked")
    _stat_tile(out, KANBAN_COL_SVG["Theory"], planning, "Planning")
    _stat_tile(out, KANBAN_COL_SVG["Done"], done, "Done")

    out.write(
        '\t\t</div>\n'
        '\t\t<nav class="bento-jump" aria-label="On this page">\n'
        '\t\t\t<a class="bento-chip" href="#columns">Columns</a>\n'
        '\t\t\t<a class="bento-chip" href="#flow">Pipeline</a>\n'
        '\t\t\t<a class="bento-chip" href="#board">Board</a>\n'
        '\t\t</nav>\n'
        '\t</div>\n'
        '</section>\n\n'
    )

    out.write(
        '<BentoShell id="columns" eyebrow="Board"'
        ' heading="Column breakdown">\n'
        '\t<div class="bento-board bento-board--cols-3">\n'
    )
    for col in KANBAN_COLUMNS:
        count = summary.get(col, 0)
        copy = f"{count} item{'s' if count != 1 else ''}"
        _linkcard(
            out, KANBAN_COL_SVG[col], col, copy,
            href=f"#col-{col.lower()}",
        )
    out.write("\t</div>\n</BentoShell>\n\n")

    out.write('<BentoProse id="flow" heading="Pipeline flow">\n\n')
    _write_kanban_charts(out, summary, columns, active, blocked, done, planning)
    out.write("</BentoProse>\n\n")

    out.write('<BentoProse id="board" heading="Board detail">\n\n')
    _write_kanban_labels(out, columns)
    _write_kanban_tables(out, columns, summary)
    out.write("</BentoProse>\n\n")

    out.write('<BentoProse id="about">\n\n')
    out.write("---\n\n")
    out.write(
        f"Source: [KBVE Project Board]({project_url})\n\n"
    )
    out.write(
        "*Auto-generated by "
        "[ci-daily-content.yml]"
        "(https://github.com/KBVE/kbve/actions/"
        "workflows/ci-daily-content.yml)*\n\n"
    )
    out.write("</BentoProse>\n\n")

    out.write("</div>\n\n")
    out.write(
        "<style is:global>{`.kanban-report{--bento-accent:#8b5cf6;"
        "--bento-accent-2:#3b82f6}`}</style>\n"
    )

    return out.getvalue()


def _write_kanban_charts(out: TextIO, summary: dict, columns: dict,
                         active: int, blocked: int, done: int,
                         planning: int) -> None:
    active_cols = [c for c in KANBAN_COLUMNS if summary.get(c, 0) > 0]
    if active_cols:
        out.write("### Items by status\n\n")
        out.write("```mermaid\npie showData\n    title Items by Status\n")
        for col in active_cols:
            out.write(f'    "{col}" : {summary[col]}\n')
        out.write("```\n\n")

    out.write("### Work state\n\n")
    out.write("```mermaid\npie showData\n    title Work State\n")
    if active > 0:
        out.write(f'    "Active (Todo+Staging+Review)" : {active}\n')
    if blocked > 0:
        out.write(f'    "Blocked (Error+Support)" : {blocked}\n')
    if done > 0:
        out.write(f'    "Done" : {done}\n')
    if planning > 0:
        out.write(f'    "Planning (Theory+AI+Backlog)" : {planning}\n')
    out.write("```\n\n")

    out.write("### Pipeline\n\n")
    out.write("```mermaid\nflowchart LR\n")
    out.write("    classDef planning fill:#8b5cf6,stroke:#6d28d9,color:#fff\n")
    out.write("    classDef active fill:#3b82f6,stroke:#1d4ed8,color:#fff\n")
    out.write("    classDef blocked fill:#ef4444,stroke:#b91c1c,color:#fff\n")
    out.write("    classDef done fill:#10b981,stroke:#059669,color:#fff\n")
    for i, col in enumerate(KANBAN_COLUMNS):
        count = summary.get(col, 0)
        cid = col.replace(" ", "_")
        out.write(f'    {cid}["{col}<br/><strong>{count}</strong>"]\n')
        if i < len(KANBAN_COLUMNS) - 1:
            nxt = KANBAN_COLUMNS[i + 1].replace(" ", "_")
            out.write(f"    {cid} --> {nxt}\n")
    out.write("    class Theory,AI,Backlog planning\n")
    out.write("    class Todo,Staging,Review active\n")
    out.write("    class Error,Support blocked\n")
    out.write("    class Done done\n")
    out.write("```\n\n")

    type_counts: dict[str, int] = {}
    for col in KANBAN_COLUMNS:
        for item in columns.get(col, []):
            t = item.get("type") or "DRAFT_ISSUE"
            type_counts[t] = type_counts.get(t, 0) + 1
    if type_counts:
        out.write("### Items by type\n\n")
        out.write("```mermaid\npie showData\n    title Items by Type\n")
        for t, c in sorted(type_counts.items(), key=lambda kv: kv[1],
                           reverse=True):
            out.write(f'    "{_titlecase_type(t)}" : {c}\n')
        out.write("```\n\n")


def _write_kanban_labels(out: TextIO, columns: dict) -> None:
    label_counts: dict[str, int] = {}
    for col in KANBAN_COLUMNS:
        for item in columns.get(col, []):
            for lbl in item.get("labels", []):
                label_counts[lbl] = label_counts.get(lbl, 0) + 1
    top = sorted(label_counts.items(), key=lambda kv: kv[1],
                 reverse=True)[:10]
    if not top:
        return
    out.write("### Top labels\n\n")
    out.write("| Label | Count |\n|-------|:-----:|\n")
    for lbl, cnt in top:
        out.write(f"| {escape_mdx(lbl)} | {cnt} |\n")
    out.write("\n")


def _write_kanban_tables(out: TextIO, columns: dict, summary: dict) -> None:
    for col in KANBAN_COLUMNS:
        items = columns.get(col, [])
        out.write(f'<span id="col-{col.lower()}"></span>\n\n')
        out.write(f"### {col} ({summary.get(col, 0)})\n\n")
        if not items:
            out.write(
                ":::tip[Empty]\n"
                f"No items in **{col}**.\n"
                ":::\n\n"
            )
            continue
        out.write(
            "| # | Title | Priority | Assignees | Labels |\n"
            "|---|-------|----------|-----------|--------|\n"
        )
        for it in items:
            num = it.get("number")
            url = it.get("url")
            ref = f"[#{num}]({url})" if url and num else (
                str(num) if num else "—")
            title = escape_mdx(it.get("title", ""))[:80]
            priority = it.get("matrix") or "—"
            assignees = ", ".join(it.get("assignees", [])) or "—"
            labels = ", ".join(it.get("labels", [])[:3]) or "—"
            out.write(
                f"| {ref} | {title} | {priority} | {assignees} | {labels} |\n"
            )
        out.write("\n")


# ── CI Health ────────────────────────────────────────────────────────

CI_HEALTH_SVG = {
    "runs": "M22 12h-4l-3 9L9 3l-3 9H2",
    "rate": "M22 11.1V12a10 10 0 1 1-5.9-9.1M22 4 12 14.01l-3-3",
    "duration": "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM12 6v6l4 2",
    "failures": "M7.9 2h8.2L22 7.9v8.2L16.1 22H7.9L2 16.1V7.9zM15 9l-6 6M9 9l6 6",
    "flaky": "M13 2 3 14h7l-1 8 10-12h-7z",
    "workflow": ("M6 3v12M18 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 21a3 3 0 1 0"
                 " 0-6 3 3 0 0 0 0 6zM15 6a9 9 0 0 1-9 9"),
}


def build_ci_health_payload(agg: dict, timestamp: str) -> dict:
    """Prepend ``generated_at`` to the aggregated CI-health rollup."""
    return {"generated_at": timestamp, **agg}


def render_ci_health_json(payload: dict) -> str:
    """Serialize the CI-health payload to JSON."""
    return json.dumps(payload, indent=2)


def _fmt_duration(seconds: int | float) -> str:
    s = int(round(seconds or 0))
    if s <= 0:
        return "—"
    h, rem = divmod(s, 3600)
    m, sec = divmod(rem, 60)
    if h:
        return f"{h}h {m}m"
    if m:
        return f"{m}m {sec}s"
    return f"{sec}s"


def render_ci_health_mdx(payload: dict, timestamp: str) -> str:
    """Render the Bento-native MDX CI-health report."""
    from io import StringIO

    totals = payload["totals"]
    t24 = payload["totals_24h"]
    workflows = payload["workflows"]
    failures = payload["recent_failures"]
    days = payload["window"]["days"]
    rate = totals["success_rate"]
    fails = totals["failure"]
    flaky = totals["flaky"]
    out = StringIO()

    out.write(
        "---\n"
        "title: CI Health Report\n"
        "description: |\n"
        "    Daily auto-generated GitHub Actions health for the KBVE monorepo.\n"
        "template: splash\n"
        "tableOfContents: false\n"
        "editUrl: false\n"
        "lastUpdated: false\n"
        "next: false\n"
        "prev: false\n"
        "sidebar:\n"
        "    label: CI Health\n"
        "    order: 103\n"
        "---\n\n"
    )
    out.write(
        "import BentoShell from '@/components/hero/BentoShell.astro';\n"
        "import BentoProse from '@/components/hero/BentoProse.astro';\n\n"
    )

    if totals["runs"] == 0:
        lede = f"No workflow runs recorded in the last {days} days."
    elif fails > 0:
        lede = (
            f"<strong>{rate}%</strong> success across"
            f" <strong>{totals['runs']}</strong> runs"
            f" ({days}d) — <strong>{fails}</strong> failure"
            f"{'s' if fails != 1 else ''}, <strong>{flaky}</strong> flaky."
        )
    else:
        lede = (
            f"<strong>{rate}%</strong> success across"
            f" <strong>{totals['runs']}</strong> runs"
            f" ({days}d) — all green."
        )

    out.write('<div class="ci-health-report" data-dash-report>\n\n')

    out.write(
        '<section class="bento-hero bento-section not-content"'
        ' aria-label="CI health">\n'
        '\t<div class="bento-hero__bg" aria-hidden="true"></div>\n'
        '\t<div class="bento-hero__frame bento-frame">\n'
        '\t\t<div class="bento-board bento-board--hero">\n'
        '\t\t\t<div class="bento-cell bento-hero-copy bento-card'
        ' bento-card--glass">\n'
        '\t\t\t\t<span class="bento-badge bento-chip">\n'
        '\t\t\t\t\t<svg viewBox="0 0 24 24" width="14" height="14"'
        ' fill="none" stroke="currentColor" stroke-width="1.75"'
        ' stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
        '<path d="M22 12h-4l-3 9L9 3l-3 9H2" /></svg>\n'
        '\t\t\t\t\t<span>auto-generated · daily</span>\n'
        '\t\t\t\t</span>\n'
        '\t\t\t\t<h1 class="bento-title">\n'
        '\t\t\t\t\tPipeline health\n'
        '\t\t\t\t\t<span class="bento-title__accent">every workflow,'
        ' every day.</span>\n'
        '\t\t\t\t</h1>\n'
        f'\t\t\t\t<p class="bento-lede">{lede}</p>\n'
        f'\t\t\t\t<p class="bento-lede">Last generated'
        f' <strong>{timestamp}</strong>.</p>\n'
        '\t\t\t\t<div class="bento-cta">\n'
        '\t\t\t\t\t<a class="bento-btn bento-btn--primary"'
        ' href="#workflows">\n'
        '\t\t\t\t\t\tView workflows\n'
        '\t\t\t\t\t\t<svg viewBox="0 0 24 24" fill="none"'
        ' stroke="currentColor" aria-hidden="true"><path'
        ' stroke-linecap="round" stroke-linejoin="round" stroke-width="2"'
        ' d="M5 12h14M13 6l6 6-6 6" /></svg>\n'
        '\t\t\t\t\t</a>\n'
        '\t\t\t\t\t<a class="bento-btn bento-btn--ghost"'
        ' href="#failures">Failures</a>\n'
        '\t\t\t\t\t<a class="bento-btn bento-btn--ghost"'
        ' href="/dashboard/">Dashboard home</a>\n'
        '\t\t\t\t</div>\n'
        '\t\t\t</div>\n\n'
    )

    _stat_tile(out, CI_HEALTH_SVG["runs"], totals["runs"], f"Runs ({days}d)")
    _stat_tile(out, CI_HEALTH_SVG["rate"], f"{rate}%", "Success rate")
    _stat_tile(out, CI_HEALTH_SVG["duration"],
               _fmt_duration(totals["avg_duration_s"]), "Avg duration")
    _stat_tile(out, CI_HEALTH_SVG["failures"], fails, "Failures")
    _stat_tile(out, CI_HEALTH_SVG["flaky"], flaky, "Flaky")

    out.write(
        '\t\t</div>\n'
        '\t\t<nav class="bento-jump" aria-label="On this page">\n'
        '\t\t\t<a class="bento-chip" href="#workflows">Workflows</a>\n'
        '\t\t\t<a class="bento-chip" href="#trends">Trends</a>\n'
        '\t\t\t<a class="bento-chip" href="#failures">Failures</a>\n'
        '\t\t</nav>\n'
        '\t</div>\n'
        '</section>\n\n'
    )

    out.write(
        '<BentoShell id="workflows" eyebrow="Volume"'
        ' heading="Busiest workflows">\n'
        '\t<div class="bento-board bento-board--cols-3">\n'
    )
    for wf in workflows[:9]:
        copy = f"{wf['runs']} runs · {wf['success_rate']}% ok"
        _linkcard(out, CI_HEALTH_SVG["workflow"], escape_mdx(wf["name"]),
                  copy, href="#health-table")
    out.write("\t</div>\n</BentoShell>\n\n")

    out.write('<BentoProse id="trends" heading="Trends">\n\n')

    concl = {
        "Success": totals["success"], "Failure": totals["failure"],
        "Cancelled": totals["cancelled"], "Skipped": totals["skipped"],
        "Other": totals["other"],
    }
    if any(v > 0 for v in concl.values()):
        out.write("### Outcome distribution\n\n")
        out.write("```mermaid\npie showData\n    title Runs by Outcome\n")
        for label, val in concl.items():
            if val > 0:
                out.write(f'    "{label}" : {val}\n')
        out.write("```\n\n")

    top = [w for w in workflows[:8] if w["runs"] > 0]
    if top:
        out.write("### Volume by workflow\n\n")
        out.write("```mermaid\npie showData\n    title Runs by Workflow"
                  " (top 8)\n")
        for wf in top:
            out.write(f'    "{_mermaid_label(wf["name"])}" : {wf["runs"]}\n')
        out.write("```\n\n")

    out.write("### Last 24 hours\n\n")
    out.write(
        f"**{t24['runs']}** runs · **{t24['success']}** ok ·"
        f" **{t24['failure']}** failed · **{t24['success_rate']}%** success"
        f" rate.\n\n"
    )

    out.write('<span id="health-table"></span>\n\n')
    out.write("### Per-workflow health\n\n")
    if workflows:
        out.write(
            "| Workflow | Runs | OK | Fail | Success | Avg | Flaky |\n"
            "|----------|:----:|:--:|:----:|:-------:|:---:|:-----:|\n"
        )
        for wf in workflows:
            out.write(
                f"| {escape_mdx(wf['name'])} | {wf['runs']} |"
                f" {wf['success']} | {wf['failure']} |"
                f" {wf['success_rate']}% |"
                f" {_fmt_duration(wf['avg_duration_s'])} |"
                f" {wf['flaky']} |\n"
            )
        out.write("\n")
    else:
        out.write(":::tip[Idle]\nNo workflow runs in the window.\n:::\n\n")

    out.write("</BentoProse>\n\n")

    out.write('<BentoProse id="failures" heading="Recent failures">\n\n')
    if failures:
        out.write(
            "| Workflow | Branch | Event | Finished | Link |\n"
            "|----------|--------|-------|----------|------|\n"
        )
        for f in failures:
            name = escape_mdx(f.get("name") or "")
            branch = escape_mdx(f.get("branch") or "—")
            event = f.get("event") or "—"
            fin = (f.get("finished_at") or "—")[:16].replace("T", " ")
            url = f.get("url")
            link = f"[run]({url})" if url else "—"
            out.write(
                f"| {name} | {branch} | {event} | {fin} | {link} |\n")
        out.write("\n")
    else:
        out.write(
            ":::tip[All Clear]\nNo failed runs in the window.\n:::\n\n")
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
        "<style is:global>{`.ci-health-report{--bento-accent:#06b6d4;"
        "--bento-accent-2:#f43f5e}`}</style>\n"
    )

    return out.getvalue()


def _mermaid_label(name: str) -> str:
    return name.replace('"', "'").replace("\n", " ")[:40]


# ── Shared Bento hero ────────────────────────────────────────────────

def _hero_open(out: TextIO, aria: str, badge_path: str, title_main: str,
               title_accent: str, lede: str, timestamp: str,
               primary_href: str, primary_label: str,
               ghost_links: list) -> None:
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
        '\t\t\t\t\t<span>auto-generated · daily</span>\n'
        '\t\t\t\t</span>\n'
        '\t\t\t\t<h1 class="bento-title">\n'
        f'\t\t\t\t\t{title_main}\n'
        f'\t\t\t\t\t<span class="bento-title__accent">{title_accent}</span>\n'
        '\t\t\t\t</h1>\n'
        f'\t\t\t\t<p class="bento-lede">{lede}</p>\n'
        f'\t\t\t\t<p class="bento-lede">Last generated'
        f' <strong>{timestamp}</strong>.</p>\n'
        '\t\t\t\t<div class="bento-cta">\n'
        f'\t\t\t\t\t<a class="bento-btn bento-btn--primary"'
        f' href="{primary_href}">\n'
        f'\t\t\t\t\t\t{primary_label}\n'
        '\t\t\t\t\t\t<svg viewBox="0 0 24 24" fill="none"'
        ' stroke="currentColor" aria-hidden="true"><path'
        ' stroke-linecap="round" stroke-linejoin="round" stroke-width="2"'
        ' d="M5 12h14M13 6l6 6-6 6" /></svg>\n'
        '\t\t\t\t\t</a>\n'
    )
    for label, href in ghost_links:
        out.write(
            f'\t\t\t\t\t<a class="bento-btn bento-btn--ghost"'
            f' href="{href}">{label}</a>\n'
        )
    out.write('\t\t\t\t</div>\n\t\t\t</div>\n\n')


def _hero_close(out: TextIO, chips: list) -> None:
    out.write(
        '\t\t</div>\n'
        '\t\t<nav class="bento-jump" aria-label="On this page">\n'
    )
    for label, href in chips:
        out.write(f'\t\t\t<a class="bento-chip" href="{href}">{label}</a>\n')
    out.write('\t\t</nav>\n\t</div>\n</section>\n\n')


def _about(out: TextIO) -> None:
    out.write('<BentoProse id="about">\n\n---\n\n')
    out.write(
        "*Auto-generated by "
        "[ci-daily-content.yml]"
        "(https://github.com/KBVE/kbve/actions/"
        "workflows/ci-daily-content.yml)*\n\n"
    )
    out.write("</BentoProse>\n\n")


# ── Dependency Freshness ─────────────────────────────────────────────

def build_deps_payload(agg: dict, timestamp: str) -> dict:
    return {"generated_at": timestamp, **agg}


def render_deps_json(payload: dict) -> str:
    return json.dumps(payload, indent=2)


def render_deps_mdx(payload: dict, timestamp: str) -> str:
    from io import StringIO

    node = payload["node"]
    rust = payload["rust"]
    total = payload["total"]
    majors = payload["major_total"]
    out = StringIO()

    out.write(
        "---\n"
        "title: Dependency Freshness\n"
        "description: |\n"
        "    Daily auto-generated dependency drift (npm + cargo) for the"
        " KBVE monorepo.\n"
        "template: splash\n"
        "tableOfContents: false\n"
        "editUrl: false\n"
        "lastUpdated: false\n"
        "next: false\n"
        "prev: false\n"
        "sidebar:\n"
        "    label: Dependencies\n"
        "    order: 104\n"
        "---\n\n"
    )
    out.write(
        "import BentoShell from '@/components/hero/BentoShell.astro';\n"
        "import BentoProse from '@/components/hero/BentoProse.astro';\n\n"
    )

    if total == 0:
        lede = "Every tracked dependency is up to date."
    else:
        lede = (
            f"<strong>{total}</strong> outdated"
            f" dependenc{'ies' if total != 1 else 'y'} —"
            f" <strong>{majors}</strong> major-version behind."
        )

    out.write('<div class="deps-report" data-dash-report>\n\n')
    _hero_open(
        out, "Dependency freshness",
        "M12 2 2 7l10 5 10-5zM2 17l10 5 10-5M2 12l10 5 10-5",
        "Dependency drift", "npm and cargo, daily.", lede, timestamp,
        "#ecosystems", "View drift",
        [("Trends", "#trends"), ("Dashboard home", "/dashboard/")],
    )
    _stat_tile(out, "M12 2 2 7l10 5 10-5zM2 17l10 5 10-5M2 12l10 5 10-5",
               total, "Outdated")
    _stat_tile(out, "M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2"
               " 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z", majors, "Major")
    _stat_tile(out, "M12 2 15 9l7 .5-5.3 4.6L18.5 21 12 17l-6.5 4 1.8-6.9L2"
               " 9.5 9 9z", node["count"], "npm")
    _stat_tile(out, "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z", rust["count"],
               "cargo")
    _hero_close(out, [("Ecosystems", "#ecosystems"),
                      ("Trends", "#trends")])

    out.write(
        '<BentoShell id="ecosystems" eyebrow="Coverage"'
        ' heading="Ecosystem drift">\n'
        '\t<div class="bento-board bento-board--cols-3">\n'
    )
    _linkcard(out, "M12 2 15 9l7 .5-5.3 4.6L18.5 21 12 17l-6.5 4 1.8-6.9L2"
              " 9.5 9 9z", "npm",
              f"{node['count']} outdated · {node['major']} major",
              href="#npm")
    _linkcard(out, "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z", "cargo",
              f"{rust['count']} outdated · {rust['major']} major",
              href="#cargo")
    out.write("\t</div>\n</BentoShell>\n\n")

    out.write('<BentoProse id="trends" heading="Drift detail">\n\n')
    if total > 0:
        out.write("```mermaid\npie showData\n    title Outdated by Ecosystem\n")
        if node["count"]:
            out.write(f'    "npm" : {node["count"]}\n')
        if rust["count"]:
            out.write(f'    "cargo" : {rust["count"]}\n')
        out.write("```\n\n")

    out.write('<span id="npm"></span>\n\n### npm\n\n')
    if node["items"]:
        out.write(
            "| Package | Current | Wanted | Latest | Major |\n"
            "|---------|---------|--------|--------|:-----:|\n"
        )
        for d in node["items"]:
            flag = "⚠️" if d.get("major") else ""
            out.write(
                f"| {escape_mdx(d['name'])} | {d['current']} |"
                f" {d['wanted']} | {d['latest']} | {flag} |\n"
            )
        out.write("\n")
    else:
        out.write(":::tip[Fresh]\nNo npm packages outdated.\n:::\n\n")

    out.write('<span id="cargo"></span>\n\n### cargo\n\n')
    if rust["items"]:
        out.write(
            "| Crate | Current | Latest | Major |\n"
            "|-------|---------|--------|:-----:|\n"
        )
        for d in rust["items"]:
            flag = "⚠️" if d.get("major") else ""
            out.write(
                f"| {escape_mdx(d['name'])} | {d['current']} |"
                f" {d['latest']} | {flag} |\n"
            )
        out.write("\n")
    else:
        out.write(":::tip[Fresh]\nNo crates outdated in range.\n:::\n\n")
    out.write("</BentoProse>\n\n")

    _about(out)
    out.write("</div>\n\n")
    out.write(
        "<style is:global>{`.deps-report{--bento-accent:#f59e0b;"
        "--bento-accent-2:#22c55e}`}</style>\n"
    )
    return out.getvalue()


# ── Activity Pulse ───────────────────────────────────────────────────

def build_activity_payload(agg: dict, timestamp: str) -> dict:
    return {"generated_at": timestamp, **agg}


def render_activity_json(payload: dict) -> str:
    return json.dumps(payload, indent=2)


def render_activity_mdx(payload: dict, timestamp: str) -> str:
    from io import StringIO

    commits = payload["commits"]
    prs = payload["pull_requests"]
    issues = payload["issues"]
    days = payload["window"]["days"]
    out = StringIO()

    out.write(
        "---\n"
        "title: Activity Pulse\n"
        "description: |\n"
        "    Daily auto-generated repository activity for the KBVE monorepo.\n"
        "template: splash\n"
        "tableOfContents: false\n"
        "editUrl: false\n"
        "lastUpdated: false\n"
        "next: false\n"
        "prev: false\n"
        "sidebar:\n"
        "    label: Activity\n"
        "    order: 105\n"
        "---\n\n"
    )
    out.write(
        "import BentoShell from '@/components/hero/BentoShell.astro';\n"
        "import BentoProse from '@/components/hero/BentoProse.astro';\n\n"
    )

    if commits["total"] == 0 and prs["merged"] == 0:
        lede = f"No recorded activity in the last {days} days."
    else:
        lede = (
            f"<strong>{commits['total']}</strong> commit"
            f"{'s' if commits['total'] != 1 else ''} from"
            f" <strong>{commits['authors']}</strong> contributor"
            f"{'s' if commits['authors'] != 1 else ''} —"
            f" <strong>{prs['merged']}</strong> PR"
            f"{'s' if prs['merged'] != 1 else ''} merged ({days}d)."
        )

    out.write('<div class="activity-report" data-dash-report>\n\n')
    _hero_open(
        out, "Activity pulse",
        "M22 12h-4l-3 9L9 3l-3 9H2", "Repository pulse",
        "commits, PRs, and issues.", lede, timestamp,
        "#leaderboard", "View leaderboard",
        [("Commits", "#commits"), ("Dashboard home", "/dashboard/")],
    )
    _stat_tile(out, "M6 3v12M18 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 21a3 3 0 1 0"
               " 0-6 3 3 0 0 0 0 6zM15 6a9 9 0 0 1-9 9",
               commits["total"], f"Commits ({days}d)")
    _stat_tile(out, "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0"
               " 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.9",
               commits["authors"], "Contributors")
    _stat_tile(out, "M18 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 21a3 3 0 1 0 0-6 3 3"
               " 0 0 0 0 6zM6 15V9M18 6a9 9 0 0 1-9 9", prs["merged"],
               "PRs merged")
    _stat_tile(out, "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM12 8v4m0 4h.01",
               issues["opened"], "Issues opened")
    _stat_tile(out, "M22 11.1V12a10 10 0 1 1-5.9-9.1M22 4 12 14.01l-3-3",
               issues["closed"], "Issues closed")
    _hero_close(out, [("Leaderboard", "#leaderboard"),
                      ("Commits", "#commits")])

    out.write(
        '<BentoShell id="leaderboard" eyebrow="Contributors"'
        ' heading="Top contributors">\n'
        '\t<div class="bento-board bento-board--cols-3">\n'
    )
    for c in commits["leaderboard"][:6]:
        _linkcard(out, "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1"
                  " 0 0-8 4 4 0 0 0 0 8z", escape_mdx(c["author"]),
                  f"{c['commits']} commit{'s' if c['commits'] != 1 else ''}",
                  href="#commits")
    out.write("\t</div>\n</BentoShell>\n\n")

    out.write('<BentoProse id="commits" heading="Activity detail">\n\n')
    if commits["leaderboard"]:
        out.write("```mermaid\npie showData\n    title Commits by Author\n")
        for c in commits["leaderboard"]:
            out.write(f'    "{_mermaid_label(c["author"])}" : {c["commits"]}\n')
        out.write("```\n\n")

    out.write("### Recent commits\n\n")
    if commits["recent"]:
        out.write("| SHA | Author | Message |\n|-----|--------|---------|\n")
        for c in commits["recent"]:
            sha = f"[`{c['sha']}`]({c['url']})" if c.get("url") else \
                f"`{c['sha']}`"
            msg = escape_mdx(c.get("message") or "")[:72]
            out.write(f"| {sha} | {escape_mdx(c['author'])} | {msg} |\n")
        out.write("\n")
    else:
        out.write(":::tip[Quiet]\nNo commits in the window.\n:::\n\n")

    out.write("### Recently merged PRs\n\n")
    if prs["recent"]:
        out.write("| # | Title | Author |\n|---|-------|--------|\n")
        for p in prs["recent"]:
            ref = f"[#{p['number']}]({p['url']})" if p.get("url") else \
                str(p.get("number") or "—")
            out.write(
                f"| {ref} | {escape_mdx(p.get('title') or '')[:72]} |"
                f" {escape_mdx(p.get('user') or '—')} |\n"
            )
        out.write("\n")
    else:
        out.write(":::tip[Quiet]\nNo PRs merged in the window.\n:::\n\n")
    out.write("</BentoProse>\n\n")

    _about(out)
    out.write("</div>\n\n")
    out.write(
        "<style is:global>{`.activity-report{--bento-accent:#8b5cf6;"
        "--bento-accent-2:#06b6d4}`}</style>\n"
    )
    return out.getvalue()


# ── Release Radar ────────────────────────────────────────────────────

_RELEASE_STATUS_LABEL = {
    "pending": "Pending", "behind": "Behind", "unpublished": "Unpublished",
    "published": "Published", "skipped": "Skipped",
}
_RELEASE_ECO_LABEL = {"crates": "Crates.io", "npm": "npm", "python": "PyPI"}


def build_release_payload(agg: dict, timestamp: str) -> dict:
    return {"generated_at": timestamp, **agg}


def render_release_json(payload: dict) -> str:
    return json.dumps(payload, indent=2)


def render_release_mdx(payload: dict, timestamp: str) -> str:
    from io import StringIO

    summary = payload["summary"]
    ecosystems = payload["ecosystems"]
    rows = payload["rows"]
    total = payload["total"]
    pending = summary.get("pending", 0)
    behind = summary.get("behind", 0)
    out = StringIO()

    out.write(
        "---\n"
        "title: Release Radar\n"
        "description: |\n"
        "    Daily auto-generated release drift (manifest vs registry) for"
        " the KBVE monorepo.\n"
        "template: splash\n"
        "tableOfContents: false\n"
        "editUrl: false\n"
        "lastUpdated: false\n"
        "next: false\n"
        "prev: false\n"
        "sidebar:\n"
        "    label: Releases\n"
        "    order: 106\n"
        "---\n\n"
    )
    out.write(
        "import BentoShell from '@/components/hero/BentoShell.astro';\n"
        "import BentoProse from '@/components/hero/BentoProse.astro';\n\n"
    )

    if total == 0:
        lede = "No publishable packages tracked in the dispatch manifest."
    elif pending > 0:
        lede = (
            f"<strong>{pending}</strong> package"
            f"{'s' if pending != 1 else ''} ahead of the registry —"
            f" pending publish."
        )
    else:
        lede = (
            f"<strong>{total}</strong> tracked package"
            f"{'s' if total != 1 else ''} — all in sync with the registry."
        )

    out.write('<div class="release-report" data-dash-report>\n\n')
    _hero_open(
        out, "Release radar",
        "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM12 6v6l4 2",
        "Release radar", "manifest versus registry.", lede, timestamp,
        "#ecosystems", "View drift",
        [("Packages", "#packages"), ("Dashboard home", "/dashboard/")],
    )
    _stat_tile(out, "M12 2 2 7l10 5 10-5zM2 17l10 5 10-5M2 12l10 5 10-5",
               total, "Tracked")
    _stat_tile(out, "M12 19V5M5 12l7-7 7 7", pending, "Pending")
    _stat_tile(out, "M12 5v14M5 12l7 7 7-7", behind, "Behind")
    _stat_tile(out, "M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0"
               " 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z",
               summary.get("unpublished", 0), "Unpublished")
    _stat_tile(out, "M22 11.1V12a10 10 0 1 1-5.9-9.1M22 4 12 14.01l-3-3",
               summary.get("published", 0), "Published")
    _hero_close(out, [("Ecosystems", "#ecosystems"),
                      ("Packages", "#packages")])

    out.write(
        '<BentoShell id="ecosystems" eyebrow="Registries"'
        ' heading="Ecosystem status">\n'
        '\t<div class="bento-board bento-board--cols-3">\n'
    )
    for eco in ("crates", "npm", "python"):
        e = ecosystems.get(eco, {"total": 0, "pending": 0})
        _linkcard(out, "M12 2 2 7l10 5 10-5zM2 17l10 5 10-5M2 12l10 5 10-5",
                  _RELEASE_ECO_LABEL[eco],
                  f"{e['total']} tracked · {e['pending']} pending",
                  href="#packages")
    out.write("\t</div>\n</BentoShell>\n\n")

    out.write('<BentoProse id="packages" heading="Package status">\n\n')
    dist = {_RELEASE_STATUS_LABEL[s]: summary.get(s, 0)
            for s in ("pending", "behind", "unpublished", "published")}
    if any(v > 0 for v in dist.values()):
        out.write("```mermaid\npie showData\n    title Packages by Status\n")
        for label, val in dist.items():
            if val > 0:
                out.write(f'    "{label}" : {val}\n')
        out.write("```\n\n")

    if rows:
        out.write(
            "| Ecosystem | Package | Local | Published | Status |\n"
            "|-----------|---------|-------|-----------|--------|\n"
        )
        for r in rows:
            pub = r.get("published") or "—"
            out.write(
                f"| {_RELEASE_ECO_LABEL.get(r['ecosystem'], r['ecosystem'])} |"
                f" {escape_mdx(r['name'])} | {r['local']} | {pub} |"
                f" {_RELEASE_STATUS_LABEL.get(r['status'], r['status'])} |\n"
            )
        out.write("\n")
    else:
        out.write(":::tip[Empty]\nNo tracked packages.\n:::\n\n")
    out.write("</BentoProse>\n\n")

    _about(out)
    out.write("</div>\n\n")
    out.write(
        "<style is:global>{`.release-report{--bento-accent:#10b981;"
        "--bento-accent-2:#0ea5e9}`}</style>\n"
    )
    return out.getvalue()
