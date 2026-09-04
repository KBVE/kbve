"""Render the workspace report — toolchain, LOC and coverage."""

from __future__ import annotations

import json
import re

from ._shared import _stat_tile


REPORT_ENV_SVG = {
    "node": (
        "M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2"
        " 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16zM3.27 6.96"
        " 12 12.01l8.73-5.05M12 22.08V12"
    ),
    "moon": "M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z",
    "pnpm": "M12 2 2 7l10 5 10-5zM2 17l10 5 10-5M2 12l10 5 10-5",
    "os": "M2 3h20v14H2zM8 21h8M12 17v4",
}


def render_report_json(data: dict) -> str:
    """Serialize the frozen workspace report payload to JSON."""
    return json.dumps(data, indent=2)


def render_report_mdx(data: dict, timestamp: str) -> str:
    """Render the Bento-native MDX workspace report."""
    from io import StringIO

    versions = {e["name"]: e["version"] for e in data.get("toolchain", [])}
    node = versions.get("node", "")
    moon = versions.get("moon", "")
    pnpm = versions.get("pnpm", "")
    os_info = versions.get("os", "")
    workspace = data.get("workspace", {})
    out = StringIO()

    out.write(
        "---\n"
        "title: Workspace Report\n"
        "description: |\n"
        "    Daily auto-generated workspace report"
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
        "import AstroWorkspaceReport from"
        " '@/components/dashboard/AstroWorkspaceReport.astro';\n\n"
    )

    lede = (
        f"{workspace.get('projects', 0)} projects and"
        f" {workspace.get('tasks', 0)} tasks · Node <strong>{node}</strong>"
        f" · moon <strong>{moon}</strong> · pnpm <strong>{pnpm}</strong>."
    )

    out.write('<div class="nx-report" data-dash-report>\n\n')

    out.write(
        '<section class="bento-hero bento-section not-content"'
        ' aria-label="Workspace report">\n'
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
        " /></svg>\n"
        "\t\t\t\t\t<span>auto-generated · daily</span>\n"
        "\t\t\t\t</span>\n"
        '\t\t\t\t<h1 class="bento-title">\n'
        "\t\t\t\t\tWorkspace\n"
        '\t\t\t\t\t<span class="bento-title__accent">report.</span>\n'
        "\t\t\t\t</h1>\n"
        f'\t\t\t\t<p class="bento-lede">{lede}</p>\n'
        f'\t\t\t\t<p class="bento-lede">Last generated'
        f" <strong>{timestamp}</strong>.</p>\n"
        '\t\t\t\t<div class="bento-cta">\n'
        '\t\t\t\t\t<a class="bento-btn bento-btn--primary" href="#insights">\n'
        "\t\t\t\t\t\tView insights\n"
        '\t\t\t\t\t\t<svg viewBox="0 0 24 24" fill="none"'
        ' stroke="currentColor" aria-hidden="true"><path'
        ' stroke-linecap="round" stroke-linejoin="round" stroke-width="2"'
        ' d="M5 12h14M13 6l6 6-6 6" /></svg>\n'
        "\t\t\t\t\t</a>\n"
        '\t\t\t\t\t<a class="bento-btn bento-btn--ghost"'
        ' href="#raw">Raw output</a>\n'
        '\t\t\t\t\t<a class="bento-btn bento-btn--ghost"'
        ' href="/dashboard/">Dashboard home</a>\n'
        "\t\t\t\t</div>\n"
        "\t\t\t</div>\n\n"
    )

    _stat_tile(out, REPORT_ENV_SVG["node"], node, "Node")
    _stat_tile(out, REPORT_ENV_SVG["moon"], moon, "moon")
    _stat_tile(out, REPORT_ENV_SVG["pnpm"], pnpm, "pnpm")
    _stat_tile(out, REPORT_ENV_SVG["os"], os_info, "OS")

    out.write(
        "\t\t</div>\n"
        '\t\t<nav class="bento-jump" aria-label="On this page">\n'
        '\t\t\t<a class="bento-chip" href="#insights">Insights</a>\n'
        '\t\t\t<a class="bento-chip" href="#raw">Raw output</a>\n'
        "\t\t</nav>\n"
        "\t</div>\n"
        "</section>\n\n"
    )

    out.write(
        '<BentoShell id="insights" eyebrow="Workspace"'
        ' heading="Report insights">\n'
        "\t<AstroWorkspaceReport />\n"
        "</BentoShell>\n\n"
    )

    out.write('<BentoProse id="raw" heading="Raw output">\n\n')

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
    out.write("<style is:global>{`.nx-report{--bento-accent:#10b981;--bento-accent-2:#38bdf8}`}</style>\n")

    return out.getvalue()
