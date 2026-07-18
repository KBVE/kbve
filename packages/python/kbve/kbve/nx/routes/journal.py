"""The ``journal`` route — nightly year-block scaffold for journal/MM-DD.mdx."""

from __future__ import annotations

import os
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from ..builder import BuildContext, BuildResult, PlanResult
from ..document import MdxDocument
from ..router import route

_ET = ZoneInfo("America/New_York")


def _target(ctx: BuildContext):
    if ctx.date is not None:
        target = ctx.date
    else:
        target = datetime.now(_ET).date() + timedelta(days=1)
    mm_dd = target.strftime("%m-%d")
    year = target.strftime("%Y")
    path = ctx.content_root / "journal" / ("%s.mdx" % mm_dd)
    return path, mm_dd, year


def _block(year: str) -> str:
    return (
        '<BentoProse id="%s" heading="%s">\n'
        "\n"
        "- [ ]\n"
        "\n"
        "</BentoProse>\n"
        "\n"
    ) % (year, year)


@route("journal", "daily")
class JournalRoute:
    def plan(self, ctx: BuildContext) -> PlanResult:
        path, _mm_dd, year = _target(ctx)
        if not path.exists():
            return PlanResult("journal", False, "file absent", [])
        doc = MdxDocument.load(path)
        marker = 'id="%s"' % year
        needs = not doc.contains(marker)
        reason = "year block missing" if needs else "year block present"
        return PlanResult("journal", needs, reason, [str(path)])

    def build(self, ctx: BuildContext) -> BuildResult:
        path, _mm_dd, year = _target(ctx)
        if not path.exists():
            return BuildResult("journal", [], True, "file absent")
        doc = MdxDocument.load(path)
        if doc.contains('id="%s"' % year):
            return BuildResult("journal", [], True, "year block present")

        doc.set_frontmatter_year("date", year)
        doc.replace(r"href: '#\d{4}'", "href: '#%s'" % year, count=1)
        doc.insert_before(r'<BentoProse id="', _block(year))

        rel = os.path.relpath(path, ctx.content_root)
        if not ctx.dry_run:
            doc.save()
        return BuildResult("journal", [rel], False, "scaffolded")
