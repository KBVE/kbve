"""Render commit and PR activity into the activity pulse page."""

from __future__ import annotations

import json

from ...mdx.escape import escape_mdx
from ...svg import donut_svg
from ._shared import (
    _about,
    _folded_slices,
    _hero_close,
    _hero_open,
    _linkcard,
    _stat_tile,
)


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
        out,
        "Activity pulse",
        "M22 12h-4l-3 9L9 3l-3 9H2",
        "Repository pulse",
        "commits, PRs, and issues.",
        lede,
        timestamp,
        "#leaderboard",
        "View leaderboard",
        [("Commits", "#commits"), ("Dashboard home", "/dashboard/")],
    )
    _stat_tile(
        out,
        "M6 3v12M18 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM15 6a9 9 0 0 1-9 9",
        commits["total"],
        f"Commits ({days}d)",
    )
    _stat_tile(
        out,
        "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.9",
        commits["authors"],
        "Contributors",
    )
    _stat_tile(
        out,
        "M18 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 15V9M18 6a9 9 0 0 1-9 9",
        prs["merged"],
        "PRs merged",
    )
    _stat_tile(out, "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM12 8v4m0 4h.01", issues["opened"], "Issues opened")
    _stat_tile(out, "M22 11.1V12a10 10 0 1 1-5.9-9.1M22 4 12 14.01l-3-3", issues["closed"], "Issues closed")
    _hero_close(out, [("Leaderboard", "#leaderboard"), ("Commits", "#commits")])

    out.write(
        '<BentoShell id="leaderboard" eyebrow="Contributors"'
        ' heading="Top contributors">\n'
        '\t<div class="bento-board bento-board--cols-3">\n'
    )
    for c in commits["leaderboard"][:6]:
        _linkcard(
            out,
            "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
            escape_mdx(c["author"]),
            f"{c['commits']} commit{'s' if c['commits'] != 1 else ''}",
            href="#commits",
        )
    out.write("\t</div>\n</BentoShell>\n\n")

    out.write('<BentoProse id="commits" heading="Activity detail">\n\n')
    by_author = donut_svg(
        "Commits by Author",
        _folded_slices([(c["author"], c["commits"]) for c in commits["leaderboard"]]),
    )
    if by_author:
        out.write(f'<div class="kbve-figure">{by_author}</div>\n\n')

    out.write("### Recent commits\n\n")
    if commits["recent"]:
        out.write("| SHA | Author | Message |\n|-----|--------|---------|\n")
        for c in commits["recent"]:
            sha = f"[`{c['sha']}`]({c['url']})" if c.get("url") else f"`{c['sha']}`"
            msg = escape_mdx(c.get("message") or "")[:72]
            out.write(f"| {sha} | {escape_mdx(c['author'])} | {msg} |\n")
        out.write("\n")
    else:
        out.write(":::tip[Quiet]\nNo commits in the window.\n:::\n\n")

    out.write("### Recently merged PRs\n\n")
    if prs["recent"]:
        out.write("| # | Title | Author |\n|---|-------|--------|\n")
        for p in prs["recent"]:
            ref = f"[#{p['number']}]({p['url']})" if p.get("url") else str(p.get("number") or "—")
            out.write(f"| {ref} | {escape_mdx(p.get('title') or '')[:72]} | {escape_mdx(p.get('user') or '—')} |\n")
        out.write("\n")
    else:
        out.write(":::tip[Quiet]\nNo PRs merged in the window.\n:::\n\n")
    out.write("</BentoProse>\n\n")

    _about(out)
    out.write("</div>\n\n")
    out.write("<style is:global>{`.activity-report{--bento-accent:#8b5cf6;--bento-accent-2:#06b6d4}`}</style>\n")
    return out.getvalue()
