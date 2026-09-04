"""Render GitHub Actions run health into the CI health page."""

from __future__ import annotations

import json

from ...mdx.escape import escape_mdx
from ...svg import Slice, donut_svg
from ._shared import (
    _folded_slices,
    _linkcard,
    _stat_tile,
)


CI_HEALTH_SVG = {
    "runs": "M22 12h-4l-3 9L9 3l-3 9H2",
    "rate": "M22 11.1V12a10 10 0 1 1-5.9-9.1M22 4 12 14.01l-3-3",
    "duration": "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM12 6v6l4 2",
    "failures": "M7.9 2h8.2L22 7.9v8.2L16.1 22H7.9L2 16.1V7.9zM15 9l-6 6M9 9l6 6",
    "flaky": "M13 2 3 14h7l-1 8 10-12h-7z",
    "workflow": ("M6 3v12M18 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM15 6a9 9 0 0 1-9 9"),
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
        lede = f"<strong>{rate}%</strong> success across <strong>{totals['runs']}</strong> runs ({days}d) — all green."

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
        "\t\t\t\t\t<span>auto-generated · daily</span>\n"
        "\t\t\t\t</span>\n"
        '\t\t\t\t<h1 class="bento-title">\n'
        "\t\t\t\t\tPipeline health\n"
        '\t\t\t\t\t<span class="bento-title__accent">every workflow,'
        " every day.</span>\n"
        "\t\t\t\t</h1>\n"
        f'\t\t\t\t<p class="bento-lede">{lede}</p>\n'
        f'\t\t\t\t<p class="bento-lede">Last generated'
        f" <strong>{timestamp}</strong>.</p>\n"
        '\t\t\t\t<div class="bento-cta">\n'
        '\t\t\t\t\t<a class="bento-btn bento-btn--primary"'
        ' href="#workflows">\n'
        "\t\t\t\t\t\tView workflows\n"
        '\t\t\t\t\t\t<svg viewBox="0 0 24 24" fill="none"'
        ' stroke="currentColor" aria-hidden="true"><path'
        ' stroke-linecap="round" stroke-linejoin="round" stroke-width="2"'
        ' d="M5 12h14M13 6l6 6-6 6" /></svg>\n'
        "\t\t\t\t\t</a>\n"
        '\t\t\t\t\t<a class="bento-btn bento-btn--ghost"'
        ' href="#failures">Failures</a>\n'
        '\t\t\t\t\t<a class="bento-btn bento-btn--ghost"'
        ' href="/dashboard/">Dashboard home</a>\n'
        "\t\t\t\t</div>\n"
        "\t\t\t</div>\n\n"
    )

    _stat_tile(out, CI_HEALTH_SVG["runs"], totals["runs"], f"Runs ({days}d)")
    _stat_tile(out, CI_HEALTH_SVG["rate"], f"{rate}%", "Success rate")
    _stat_tile(out, CI_HEALTH_SVG["duration"], _fmt_duration(totals["avg_duration_s"]), "Avg duration")
    _stat_tile(out, CI_HEALTH_SVG["failures"], fails, "Failures")
    _stat_tile(out, CI_HEALTH_SVG["flaky"], flaky, "Flaky")

    out.write(
        "\t\t</div>\n"
        '\t\t<nav class="bento-jump" aria-label="On this page">\n'
        '\t\t\t<a class="bento-chip" href="#workflows">Workflows</a>\n'
        '\t\t\t<a class="bento-chip" href="#trends">Trends</a>\n'
        '\t\t\t<a class="bento-chip" href="#failures">Failures</a>\n'
        "\t\t</nav>\n"
        "\t</div>\n"
        "</section>\n\n"
    )

    out.write(
        '<BentoShell id="workflows" eyebrow="Volume"'
        ' heading="Busiest workflows">\n'
        '\t<div class="bento-board bento-board--cols-3">\n'
    )
    for wf in workflows[:9]:
        copy = f"{wf['runs']} runs · {wf['success_rate']}% ok"
        _linkcard(out, CI_HEALTH_SVG["workflow"], escape_mdx(wf["name"]), copy, href="#health-table")
    out.write("\t</div>\n</BentoShell>\n\n")

    out.write('<BentoProse id="trends" heading="Trends">\n\n')

    concl = {
        "Success": totals["success"],
        "Failure": totals["failure"],
        "Cancelled": totals["cancelled"],
        "Skipped": totals["skipped"],
        "Other": totals["other"],
    }
    outcomes = donut_svg(
        "Runs by Outcome",
        [Slice(label, val) for label, val in concl.items()],
    )
    if outcomes:
        out.write("### Outcome distribution\n\n")
        out.write(f'<div class="kbve-figure">{outcomes}</div>\n\n')

    by_workflow = donut_svg(
        "Runs by Workflow",
        _folded_slices([(w["name"], w["runs"]) for w in workflows]),
    )
    if by_workflow:
        out.write("### Volume by workflow\n\n")
        out.write(f'<div class="kbve-figure">{by_workflow}</div>\n\n')

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
        out.write("| Workflow | Branch | Event | Finished | Link |\n|----------|--------|-------|----------|------|\n")
        for f in failures:
            name = escape_mdx(f.get("name") or "")
            branch = escape_mdx(f.get("branch") or "—")
            event = f.get("event") or "—"
            fin = (f.get("finished_at") or "—")[:16].replace("T", " ")
            url = f.get("url")
            link = f"[run]({url})" if url else "—"
            out.write(f"| {name} | {branch} | {event} | {fin} | {link} |\n")
        out.write("\n")
    else:
        out.write(":::tip[All Clear]\nNo failed runs in the window.\n:::\n\n")
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
    out.write("<style is:global>{`.ci-health-report{--bento-accent:#06b6d4;--bento-accent-2:#f43f5e}`}</style>\n")

    return out.getvalue()
