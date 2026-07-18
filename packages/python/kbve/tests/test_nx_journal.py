import shutil
from datetime import date
from pathlib import Path

import kbve.nx  # noqa: F401  ensure routes register
from kbve.nx.builder import Builder, BuildContext
from kbve.nx.router import get
from kbve.seo._pages import find_content_dir

FIXTURE = Path(find_content_dir(None)) / "journal" / "07-19.mdx"


def _setup(tmp_path):
    journal = tmp_path / "journal"
    journal.mkdir()
    shutil.copy(FIXTURE, journal / "07-19.mdx")
    return tmp_path


def test_journal_build_scaffolds_year(tmp_path):
    root = _setup(tmp_path)
    builder = Builder(content_root=root, date=date(2026, 7, 19))
    result = builder.build_one("journal")

    assert result.skipped is False
    assert result.changed

    text = (root / "journal" / "07-19.mdx").read_text(encoding="utf-8")
    assert "date: 2026-07-19 12:00:00" in text
    assert "href: '#2026'" in text
    assert '<BentoProse id="2026" heading="2026">' in text
    assert text.index('id="2026"') < text.index('id="2025"')

    block = text[text.index('id="2026"'):text.index('id="2025"')]
    assert "- [ ]" in block


def test_journal_build_idempotent(tmp_path):
    root = _setup(tmp_path)
    builder = Builder(content_root=root, date=date(2026, 7, 19))
    builder.build_one("journal")
    after_first = (root / "journal" / "07-19.mdx").read_text(encoding="utf-8")

    result2 = builder.build_one("journal")
    assert result2.skipped is True
    after_second = (root / "journal" / "07-19.mdx").read_text(encoding="utf-8")
    assert after_first == after_second


def test_journal_plan_after_build(tmp_path):
    root = _setup(tmp_path)
    builder = Builder(content_root=root, date=date(2026, 7, 19))

    ctx = BuildContext(content_root=root, date=date(2026, 7, 19),
                       dry_run=False, inputs={})
    assert get("journal").plan(ctx).needs_work is True

    builder.build_one("journal")
    assert get("journal").plan(ctx).needs_work is False


def test_journal_missing_file(tmp_path):
    builder = Builder(content_root=tmp_path, date=date(2026, 7, 19))
    ctx = BuildContext(content_root=tmp_path, date=date(2026, 7, 19),
                       dry_run=False, inputs={})
    plan = get("journal").plan(ctx)
    assert plan.needs_work is False
    assert plan.reason == "file absent"
    result = builder.build_one("journal")
    assert result.skipped is True
