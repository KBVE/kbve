"""Render aggregated multi-ecosystem audit data into the security page."""

from __future__ import annotations

import json
from typing import TextIO

from ...mdx.escape import escape_mdx
from ...svg import Slice, donut_svg
from ._shared import (
    ECOSYSTEM_LABELS,
    ECOSYSTEM_ORDER,
    ECOSYSTEM_SVG,
    SEVERITY_LABELS,
    SEVERITY_SVG,
    _empty_severities,
    _linkcard,
    _stat_tile,
)
from ..security import SEVERITY_ORDER


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
        lede = f"<strong>{total}</strong> finding{'s' if total != 1 else ''} tracked — none critical or high."
    else:
        lede = "No security findings detected across any ecosystem."

    out.write('<div class="sec-report" data-dash-report>\n\n')

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
        "\t\t\t\t\t<span>auto-generated · daily</span>\n"
        "\t\t\t\t</span>\n"
        '\t\t\t\t<h1 class="bento-title">\n'
        "\t\t\t\t\tSecurity posture\n"
        '\t\t\t\t\t<span class="bento-title__accent">across every'
        " ecosystem.</span>\n"
        "\t\t\t\t</h1>\n"
        f'\t\t\t\t<p class="bento-lede">{lede}</p>\n'
        f'\t\t\t\t<p class="bento-lede">Last generated'
        f" <strong>{timestamp}</strong>.</p>\n"
        '\t\t\t\t<div class="bento-cta">\n'
        '\t\t\t\t\t<a class="bento-btn bento-btn--primary" href="#findings">\n'
        "\t\t\t\t\t\tView findings\n"
        '\t\t\t\t\t\t<svg viewBox="0 0 24 24" fill="none"'
        ' stroke="currentColor" aria-hidden="true"><path'
        ' stroke-linecap="round" stroke-linejoin="round" stroke-width="2"'
        ' d="M5 12h14M13 6l6 6-6 6" /></svg>\n'
        "\t\t\t\t\t</a>\n"
        '\t\t\t\t\t<a class="bento-btn bento-btn--ghost"'
        ' href="#ecosystems">Ecosystems</a>\n'
        '\t\t\t\t\t<a class="bento-btn bento-btn--ghost"'
        ' href="/dashboard/">Dashboard home</a>\n'
        "\t\t\t\t</div>\n"
        "\t\t\t</div>\n\n"
    )

    for sev in SEVERITY_ORDER:
        _stat_tile(out, SEVERITY_SVG[sev], summary[sev], SEVERITY_LABELS[sev])

    out.write(
        "\t\t</div>\n"
        '\t\t<nav class="bento-jump" aria-label="On this page">\n'
        '\t\t\t<a class="bento-chip" href="#ecosystems">Ecosystems</a>\n'
        '\t\t\t<a class="bento-chip" href="#findings">Findings</a>\n'
        "\t\t</nav>\n"
        "\t</div>\n"
        "</section>\n\n"
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
        item_word = "alerts" if eco_name in ("codeql", "dependabot") else "advisories"
        copy = f"{count} {item_word}"
        _linkcard(
            out,
            ECOSYSTEM_SVG[eco_name],
            label,
            copy,
            href=f"#eco-{eco_name}",
        )
    out.write("\t</div>\n</BentoShell>\n\n")

    out.write('<BentoProse id="findings" heading="Advisories">\n\n')

    severity = donut_svg(
        "Findings by Severity",
        [Slice(SEVERITY_LABELS[sev], summary[sev]) for sev in SEVERITY_ORDER[:4]],
    )
    if severity:
        out.write("### Severity distribution\n\n")
        out.write(f'<div class="kbve-figure">{severity}</div>\n\n')

    eco_totals = {ECOSYSTEM_LABELS[e]: ecosystems.get(e, {}).get("total", 0) for e in ECOSYSTEM_ORDER}
    by_eco = donut_svg(
        "Findings by Ecosystem",
        [Slice(label, count) for label, count in eco_totals.items()],
    )
    if by_eco:
        out.write("### Findings by ecosystem\n\n")
        out.write(f'<div class="kbve-figure">{by_eco}</div>\n\n')

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
    _write_advisory_section(out, "python", "Python", ecosystems.get("python", {}))
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
    out.write("<style is:global>{`.sec-report{--bento-accent:#f59e0b;--bento-accent-2:#f43f5e}`}</style>\n")

    return out.getvalue()


def _write_advisory_section(out: TextIO, eco_name: str, label: str, eco: dict, key: str = "advisories") -> None:
    out.write(f'<span id="eco-{eco_name}"></span>\n\n')
    out.write(f"### {label}\n\n")
    items = eco.get(key, [])
    if not items:
        out.write(f":::tip[All Clear]\nNo {label.lower()} advisories found.\n:::\n\n")
        return
    out.write("| Severity | Package | Advisory | Link |\n|----------|---------|----------|------|\n")
    for item in sorted(items, key=lambda x: SEVERITY_ORDER.index(x.get("severity", "medium"))):
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
        out.write(":::tip[All Clear]\nNo open CodeQL alerts.\n:::\n\n")
        return
    out.write("| Severity | Rule | Path | Link |\n|----------|------|------|------|\n")
    for alert in sorted(alerts, key=lambda x: SEVERITY_ORDER.index(x.get("severity", "medium"))):
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
        out.write(":::tip[All Clear]\nNo open Dependabot alerts.\n:::\n\n")
        return
    out.write(
        "| Severity | Package | Ecosystem | Summary | Link |\n|----------|---------|-----------|---------|------|\n"
    )
    for alert in sorted(alerts, key=lambda x: SEVERITY_ORDER.index(x.get("severity", "medium"))):
        sev = alert.get("severity", "medium").capitalize()
        pkg = alert.get("package", "")
        eco_name = alert.get("ecosystem", "")
        summary = alert.get("summary", "")
        if len(summary) > 50:
            summary = summary[:47] + "..."
        url = alert.get("url", "")
        link = f"[Details]({url})" if url else ""
        out.write(f"| {sev} | `{pkg}` | {eco_name} | {summary} | {link} |\n")
    out.write("\n")
