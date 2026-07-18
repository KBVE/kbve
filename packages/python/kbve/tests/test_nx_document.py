from kbve.nx.document import MdxDocument

SAMPLE = """---
title: "July: 19"
date: 2025-07-19 12:00:00
---

<BentoProse id="2025" heading="2025">

hello

</BentoProse>
"""


def _doc(tmp_path):
    p = tmp_path / "07-19.mdx"
    p.write_text(SAMPLE, encoding="utf-8")
    return MdxDocument.load(p), p


def test_frontmatter_scalar(tmp_path):
    doc, _ = _doc(tmp_path)
    assert doc.frontmatter_scalar("date") == "2025-07-19 12:00:00"
    assert doc.frontmatter_scalar("missing") is None


def test_set_frontmatter_year(tmp_path):
    doc, _ = _doc(tmp_path)
    assert doc.set_frontmatter_year("date", "2026") is True
    assert "date: 2026-07-19 12:00:00" in doc.text
    assert doc.dirty is True


def test_replace(tmp_path):
    doc, _ = _doc(tmp_path)
    n = doc.replace(r'id="\d{4}"', 'id="2026"', count=1)
    assert n == 1
    assert 'id="2026"' in doc.text


def test_insert_before(tmp_path):
    doc, _ = _doc(tmp_path)
    ok = doc.insert_before(r'<BentoProse id="', "<NEW/>\n\n")
    assert ok is True
    assert doc.text.index("<NEW/>") < doc.text.index('<BentoProse id="2025"')


def test_contains(tmp_path):
    doc, _ = _doc(tmp_path)
    assert doc.contains('id="2025"') is True
    assert doc.contains('id="2026"') is False


def test_dirty_and_save(tmp_path):
    doc, p = _doc(tmp_path)
    assert doc.dirty is False
    doc.set_frontmatter_year("date", "2026")
    assert doc.dirty is True
    doc.save()
    assert doc.dirty is False
    assert "date: 2026-07-19 12:00:00" in p.read_text(encoding="utf-8")
