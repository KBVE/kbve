"""Render npm and cargo dependency freshness into the deps page."""

from __future__ import annotations

import json

from ...mdx.escape import escape_mdx
from ...svg import Slice, donut_svg
from ._shared import _about, _hero_close, _hero_open, _linkcard, _stat_tile


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
        out,
        "Dependency freshness",
        "M12 2 2 7l10 5 10-5zM2 17l10 5 10-5M2 12l10 5 10-5",
        "Dependency drift",
        "npm and cargo, daily.",
        lede,
        timestamp,
        "#ecosystems",
        "View drift",
        [("Trends", "#trends"), ("Dashboard home", "/dashboard/")],
    )
    _stat_tile(out, "M12 2 2 7l10 5 10-5zM2 17l10 5 10-5M2 12l10 5 10-5", total, "Outdated")
    _stat_tile(
        out,
        "M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z",
        majors,
        "Major",
    )
    _stat_tile(out, "M12 2 15 9l7 .5-5.3 4.6L18.5 21 12 17l-6.5 4 1.8-6.9L2 9.5 9 9z", node["count"], "npm")
    _stat_tile(out, "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z", rust["count"], "cargo")
    _hero_close(out, [("Ecosystems", "#ecosystems"), ("Trends", "#trends")])

    out.write(
        '<BentoShell id="ecosystems" eyebrow="Coverage"'
        ' heading="Ecosystem drift">\n'
        '\t<div class="bento-board bento-board--cols-3">\n'
    )
    _linkcard(
        out,
        "M12 2 15 9l7 .5-5.3 4.6L18.5 21 12 17l-6.5 4 1.8-6.9L2 9.5 9 9z",
        "npm",
        f"{node['count']} outdated · {node['major']} major",
        href="#npm",
    )
    _linkcard(
        out,
        "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z",
        "cargo",
        f"{rust['count']} outdated · {rust['major']} major",
        href="#cargo",
    )
    out.write("\t</div>\n</BentoShell>\n\n")

    out.write('<BentoProse id="trends" heading="Drift detail">\n\n')
    outdated = donut_svg(
        "Outdated by Ecosystem",
        [Slice("npm", node["count"]), Slice("cargo", rust["count"])],
    )
    if outdated:
        out.write(f'<div class="kbve-figure">{outdated}</div>\n\n')

    out.write('<span id="npm"></span>\n\n### npm\n\n')
    if node["items"]:
        out.write("| Package | Current | Wanted | Latest | Major |\n|---------|---------|--------|--------|:-----:|\n")
        for d in node["items"]:
            flag = "⚠️" if d.get("major") else ""
            out.write(f"| {escape_mdx(d['name'])} | {d['current']} | {d['wanted']} | {d['latest']} | {flag} |\n")
        out.write("\n")
    else:
        out.write(":::tip[Fresh]\nNo npm packages outdated.\n:::\n\n")

    out.write('<span id="cargo"></span>\n\n### cargo\n\n')
    if rust["items"]:
        out.write("| Crate | Current | Latest | Major |\n|-------|---------|--------|:-----:|\n")
        for d in rust["items"]:
            flag = "⚠️" if d.get("major") else ""
            out.write(f"| {escape_mdx(d['name'])} | {d['current']} | {d['latest']} | {flag} |\n")
        out.write("\n")
    else:
        out.write(":::tip[Fresh]\nNo crates outdated in range.\n:::\n\n")
    out.write("</BentoProse>\n\n")

    _about(out)
    out.write("</div>\n\n")
    out.write("<style is:global>{`.deps-report{--bento-accent:#f59e0b;--bento-accent-2:#22c55e}`}</style>\n")
    return out.getvalue()
