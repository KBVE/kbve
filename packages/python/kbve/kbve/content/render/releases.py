"""Render manifest-versus-tag release status into the release radar."""

from __future__ import annotations

import json

from ...mdx.escape import escape_mdx
from ...svg import Slice, donut_svg
from ._shared import _about, _hero_close, _hero_open, _linkcard, _stat_tile
from ..releases import STATE_LABEL as _RELEASE_STATE_LABEL
from ..releases import STATES as _RELEASE_STATES


def build_release_payload(agg: dict, timestamp: str) -> dict:
    return {"generated_at": timestamp, **agg}


def render_release_json(payload: dict) -> str:
    return json.dumps(payload, indent=2)


def render_release_mdx(payload: dict, timestamp: str) -> str:
    from io import StringIO

    summary = payload["summary"]
    lanes = payload.get("lanes") or {}
    rows = payload["rows"]
    total = payload["total"]
    waiting = payload.get("waiting", 0)
    pending = summary.get("tag-pending", 0)
    unreleased = summary.get("changes-unreleased", 0)
    out = StringIO()

    out.write(
        "---\n"
        "title: Release Radar\n"
        "description: |\n"
        "    Daily auto-generated release status (version manifest vs git tag)"
        " for the KBVE monorepo.\n"
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
        lede = "No releasable projects — nothing in the graph carries a release lane tag."
    elif waiting > 0:
        lede = (
            f"<strong>{waiting}</strong> project{'s' if waiting != 1 else ''} waiting on a release —"
            f" {pending} ready to tag, {unreleased} needing a bump first."
        )
    else:
        lede = f"<strong>{total}</strong> releasable project{'s' if total != 1 else ''} — nothing waiting."

    out.write('<div class="release-report" data-dash-report>\n\n')
    _hero_open(
        out,
        "Release radar",
        "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM12 6v6l4 2",
        "Release radar",
        "version manifest versus git tag.",
        lede,
        timestamp,
        "#lanes",
        "View lanes",
        [("Projects", "#projects"), ("Dashboard home", "/dashboard/")],
    )
    _stat_tile(out, "M12 2 2 7l10 5 10-5zM2 17l10 5 10-5M2 12l10 5 10-5", total, "Releasable")
    _stat_tile(out, "M12 19V5M5 12l7-7 7 7", pending, "Tag pending")
    _stat_tile(out, "M12 8v4l3 3M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z", unreleased, "Changes unreleased")
    _stat_tile(
        out,
        "M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z",
        summary.get("never-released", 0),
        "Never released",
    )
    _stat_tile(out, "M22 11.1V12a10 10 0 1 1-5.9-9.1M22 4 12 14.01l-3-3", summary.get("current", 0), "Current")
    _hero_close(out, [("Lanes", "#lanes"), ("Projects", "#projects")])

    out.write('<BentoShell id="lanes" eyebrow="Publish lanes" heading="Lane status">\n')
    if lanes:
        out.write('\t<div class="bento-board bento-board--cols-3">\n')
        for lane, counts in lanes.items():
            _linkcard(
                out,
                "M12 2 2 7l10 5 10-5zM2 17l10 5 10-5M2 12l10 5 10-5",
                escape_mdx(lane),
                f"{counts['total']} project(s) · {counts['waiting']} waiting",
                href="#projects",
            )
        out.write("\t</div>\n")
    else:
        out.write("\n:::tip[Empty]\nNo lane-tagged projects.\n:::\n\n")
    out.write("</BentoShell>\n\n")

    out.write('<BentoProse id="projects" heading="Project status">\n\n')
    dist = {_RELEASE_STATE_LABEL[s]: summary.get(s, 0) for s in _RELEASE_STATES}
    by_state = donut_svg(
        "Projects by Release State",
        [Slice(label, val) for label, val in dist.items()],
    )
    if by_state:
        out.write(f'<div class="kbve-figure">{by_state}</div>\n\n')

    if rows:
        out.write(
            "| Project | Lanes | Manifest | Released | Commits since | State |\n"
            "|---------|-------|----------|----------|---------------|-------|\n"
        )
        for r in rows:
            since = r.get("commits_since")
            out.write(
                f"| {escape_mdx(r['project'])} | {escape_mdx(', '.join(r['lanes']))} |"
                f" {r.get('manifest') or '—'} | {r.get('released') or '—'} |"
                f" {since if since else '—'} |"
                f" {_RELEASE_STATE_LABEL.get(r['state'], r['state'])} |\n"
            )
        out.write("\n")
    else:
        out.write(":::tip[Empty]\nNo releasable projects.\n:::\n\n")
    out.write("</BentoProse>\n\n")

    _about(out)
    out.write("</div>\n\n")
    out.write("<style is:global>{`.release-report{--bento-accent:#10b981;--bento-accent-2:#0ea5e9}`}</style>\n")
    return out.getvalue()
