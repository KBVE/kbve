"""Render the project board into the kanban dashboard page."""

from __future__ import annotations

import json
from typing import TextIO

from ...mdx.escape import escape_mdx
from ...svg import DagEdge, DagNode, Slice, dag_svg, donut_svg
from ._shared import (
    _folded_slices,
    _linkcard,
    _stat_tile,
)


KANBAN_COLUMNS = [
    "Theory",
    "AI",
    "Todo",
    "Backlog",
    "Error",
    "Support",
    "Staging",
    "Review",
    "Done",
]

# Pipeline node tones. `dag_svg` colours by node type, so the board's work
# states reuse the project-layer slots rather than inventing a palette.
_KANBAN_TONE = {
    "Theory": "library",
    "AI": "library",
    "Backlog": "library",
    "Todo": "application",
    "Staging": "application",
    "Review": "application",
    "Error": "automation",
    "Support": "automation",
    "Done": "library",
}

_PLANNING_COLS = ("Theory", "AI", "Backlog")
_ACTIVE_COLS = ("Todo", "Staging", "Review")
_BLOCKED_COLS = ("Error", "Support")

KANBAN_COL_SVG = {
    "Theory": "M12 2 15 9l7 .5-5.3 4.6L18.5 21 12 17l-6.5 4 1.8-6.9L2 9.5 9 9z",
    "AI": ("M9 2v2m6-2v2M9 20v2m6-2v2M2 9h2m-2 6h2m16-6h2m-2 6h2M6 6h12v12H6zM9 9h6v6H9z"),
    "Todo": "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01",
    "Backlog": "M12 2 2 7l10 5 10-5zM2 17l10 5 10-5M2 12l10 5 10-5",
    "Error": ("M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"),
    "Support": (
        "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 6a4 4 0 1 0 0 8"
        " 4 4 0 0 0 0-8zM4.9 4.9l3.5 3.5m7.2 7.2 3.5 3.5m0-14.2"
        "-3.5 3.5m-7.2 7.2-3.5 3.5"
    ),
    "Staging": (
        "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM19.4 15a1.65 1.65 0 0 0"
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
        " 1.65 0 0 0-1.51 1z"
    ),
    "Review": ("M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"),
    "Done": "M22 11.1V12a10 10 0 1 1-5.9-9.1M22 4 12 14.01l-3-3",
}


def build_kanban_payload(project: dict, columns: dict, summary: dict, timestamp: str) -> dict:
    """Assemble the frozen ``nx-kanban.json`` contract (JS key order)."""
    from ..kanban_board import VIEWS

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
        "\t\t\t\t\t<span>auto-generated · daily</span>\n"
        "\t\t\t\t</span>\n"
        '\t\t\t\t<h1 class="bento-title">\n'
        "\t\t\t\t\tProject board\n"
        '\t\t\t\t\t<span class="bento-title__accent">across every'
        " column.</span>\n"
        "\t\t\t\t</h1>\n"
        f'\t\t\t\t<p class="bento-lede">{lede}</p>\n'
        f'\t\t\t\t<p class="bento-lede">Last generated'
        f" <strong>{timestamp}</strong>.</p>\n"
        '\t\t\t\t<div class="bento-cta">\n'
        '\t\t\t\t\t<a class="bento-btn bento-btn--primary" href="#columns">\n'
        "\t\t\t\t\t\tView columns\n"
        '\t\t\t\t\t\t<svg viewBox="0 0 24 24" fill="none"'
        ' stroke="currentColor" aria-hidden="true"><path'
        ' stroke-linecap="round" stroke-linejoin="round" stroke-width="2"'
        ' d="M5 12h14M13 6l6 6-6 6" /></svg>\n'
        "\t\t\t\t\t</a>\n"
        f'\t\t\t\t\t<a class="bento-btn bento-btn--ghost"'
        f' href="{project_url}">Open board</a>\n'
        '\t\t\t\t\t<a class="bento-btn bento-btn--ghost"'
        ' href="/dashboard/">Dashboard home</a>\n'
        "\t\t\t\t</div>\n"
        "\t\t\t</div>\n\n"
    )

    _stat_tile(out, KANBAN_COL_SVG["Backlog"], tracked, "Tracked")
    _stat_tile(out, "M13 2 3 14h7l-1 8 10-12h-7z", active, "Active")
    _stat_tile(out, KANBAN_COL_SVG["Error"], blocked, "Blocked")
    _stat_tile(out, KANBAN_COL_SVG["Theory"], planning, "Planning")
    _stat_tile(out, KANBAN_COL_SVG["Done"], done, "Done")

    out.write(
        "\t\t</div>\n"
        '\t\t<nav class="bento-jump" aria-label="On this page">\n'
        '\t\t\t<a class="bento-chip" href="#columns">Columns</a>\n'
        '\t\t\t<a class="bento-chip" href="#flow">Pipeline</a>\n'
        '\t\t\t<a class="bento-chip" href="#board">Board</a>\n'
        "\t\t</nav>\n"
        "\t</div>\n"
        "</section>\n\n"
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
            out,
            KANBAN_COL_SVG[col],
            col,
            copy,
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
    out.write(f"Source: [KBVE Project Board]({project_url})\n\n")
    out.write(
        "*Auto-generated by "
        "[ci-daily-content.yml]"
        "(https://github.com/KBVE/kbve/actions/"
        "workflows/ci-daily-content.yml)*\n\n"
    )
    out.write("</BentoProse>\n\n")

    out.write("</div>\n\n")
    out.write("<style is:global>{`.kanban-report{--bento-accent:#8b5cf6;--bento-accent-2:#3b82f6}`}</style>\n")

    return out.getvalue()


def _write_kanban_charts(
    out: TextIO, summary: dict, columns: dict, active: int, blocked: int, done: int, planning: int
) -> None:
    by_status = donut_svg(
        "Items by Status",
        _folded_slices([(c, summary.get(c, 0)) for c in KANBAN_COLUMNS]),
    )
    if by_status:
        out.write("### Items by status\n\n")
        out.write(f'<div class="kbve-figure">{by_status}</div>\n\n')

    work_state = donut_svg(
        "Work State",
        [
            Slice("Active", active),
            Slice("Blocked", blocked),
            Slice("Done", done),
            Slice("Planning", planning),
        ],
    )
    if work_state:
        out.write("### Work state\n\n")
        out.write(f'<div class="kbve-figure">{work_state}</div>\n\n')

    pipeline = dag_svg(
        [
            DagNode(
                col,
                _KANBAN_TONE.get(col, ""),
                label=col + " (" + str(summary.get(col, 0)) + ")",
            )
            for col in KANBAN_COLUMNS
        ],
        [DagEdge(a, b) for a, b in zip(KANBAN_COLUMNS, KANBAN_COLUMNS[1:])],
        title="Pipeline",
    )
    if pipeline:
        out.write("### Pipeline\n\n")
        out.write(f'<div class="kbve-figure kbve-figure--wide">{pipeline}</div>\n\n')

    type_counts: dict[str, int] = {}
    for col in KANBAN_COLUMNS:
        for item in columns.get(col, []):
            t = item.get("type") or "DRAFT_ISSUE"
            type_counts[t] = type_counts.get(t, 0) + 1
    by_type = donut_svg(
        "Items by Type",
        _folded_slices(
            [(_titlecase_type(t), c) for t, c in sorted(type_counts.items(), key=lambda kv: kv[1], reverse=True)]
        ),
    )
    if by_type:
        out.write("### Items by type\n\n")
        out.write(f'<div class="kbve-figure">{by_type}</div>\n\n')


def _write_kanban_labels(out: TextIO, columns: dict) -> None:
    label_counts: dict[str, int] = {}
    for col in KANBAN_COLUMNS:
        for item in columns.get(col, []):
            for lbl in item.get("labels", []):
                label_counts[lbl] = label_counts.get(lbl, 0) + 1
    top = sorted(label_counts.items(), key=lambda kv: kv[1], reverse=True)[:10]
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
            out.write(f":::tip[Empty]\nNo items in **{col}**.\n:::\n\n")
            continue
        out.write("| # | Title | Priority | Assignees | Labels |\n|---|-------|----------|-----------|--------|\n")
        for it in items:
            num = it.get("number")
            url = it.get("url")
            ref = f"[#{num}]({url})" if url and num else (str(num) if num else "—")
            title = escape_mdx(it.get("title", ""))[:80]
            priority = it.get("matrix") or "—"
            assignees = ", ".join(it.get("assignees", [])) or "—"
            labels = ", ".join(it.get("labels", [])[:3]) or "—"
            out.write(f"| {ref} | {title} | {priority} | {assignees} | {labels} |\n")
        out.write("\n")
