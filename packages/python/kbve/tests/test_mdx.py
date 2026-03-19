"""Tests for kbve.mdx module."""

from kbve.mdx.escape import escape_mdx
from kbve.mdx.renderer import MdxWriter


# ── escape_mdx ───────────────────────────────────────────────────────

def test_escape_mdx():
    assert escape_mdx("a & b") == "a &amp; b"
    assert escape_mdx("<div>") == "&lt;div&gt;"
    assert escape_mdx("{value}") == "&#123;value&#125;"
    assert escape_mdx("col | col") == "col \\| col"


def test_escape_mdx_combined():
    assert escape_mdx("<a & {b}>") == "&lt;a &amp; &#123;b&#125;&gt;"


def test_escape_mdx_empty():
    assert escape_mdx("") == ""


def test_escape_mdx_no_special():
    assert escape_mdx("plain text") == "plain text"


def test_escape_mdx_consecutive_specials():
    assert escape_mdx("&&") == "&amp;&amp;"
    assert escape_mdx("<<") == "&lt;&lt;"


def test_escape_mdx_already_escaped():
    assert escape_mdx("&amp;") == "&amp;amp;"


# ── frontmatter ──────────────────────────────────────────────────────

def test_frontmatter():
    w = MdxWriter()
    w.frontmatter(title="Test", editUrl=False)
    out = w.render()
    assert "---\n" in out
    assert "title: Test\n" in out
    assert "editUrl: false\n" in out


def test_frontmatter_bool_true():
    w = MdxWriter()
    w.frontmatter(draft=True)
    assert "draft: true\n" in w.render()


def test_frontmatter_nested():
    w = MdxWriter()
    w.frontmatter(sidebar={"label": "Nav", "order": 1})
    out = w.render()
    assert "sidebar:\n" in out
    assert "    label: Nav\n" in out
    assert "    order: 1\n" in out


def test_frontmatter_nested_multiline():
    w = MdxWriter()
    w.frontmatter(description={"text": "line1\nline2"})
    out = w.render()
    assert "description:\n" in out
    assert "    text: |\n" in out
    assert "        line1\n" in out
    assert "        line2\n" in out


def test_frontmatter_integer_value():
    w = MdxWriter()
    w.frontmatter(order=42)
    assert "order: 42\n" in w.render()


def test_frontmatter_empty():
    w = MdxWriter()
    w.frontmatter()
    assert w.render() == "---\n---\n\n"


# ── imports ──────────────────────────────────────────────────────────

def test_imports():
    w = MdxWriter()
    w.imports("Card", "CardGrid",
              source="@astrojs/starlight/components")
    out = w.render()
    assert "import { Card, CardGrid }" in out
    assert "'@astrojs/starlight/components'" in out


def test_imports_single():
    w = MdxWriter()
    w.imports("Card", source="@astrojs/starlight/components")
    assert "import { Card }" in w.render()


# ── heading ──────────────────────────────────────────────────────────

def test_heading():
    w = MdxWriter()
    w.heading("Title", level=3)
    assert "### Title\n" in w.render()


def test_heading_level_1():
    w = MdxWriter()
    w.heading("Top", level=1)
    assert "# Top\n" in w.render()


def test_heading_default_level():
    w = MdxWriter()
    w.heading("Default")
    assert "## Default\n" in w.render()


# ── text and raw ─────────────────────────────────────────────────────

def test_text():
    w = MdxWriter()
    w.text("Hello world.")
    assert "Hello world.\n\n" in w.render()


def test_text_empty():
    w = MdxWriter()
    w.text("")
    assert "\n\n" in w.render()


def test_raw():
    w = MdxWriter()
    w.raw("no trailing newline")
    assert w.render() == "no trailing newline"


def test_raw_empty():
    w = MdxWriter()
    w.raw("")
    assert w.render() == ""


# ── admonition ───────────────────────────────────────────────────────

def test_admonition():
    w = MdxWriter()
    w.admonition("note", "Hey", "Some body.")
    out = w.render()
    assert ":::note[Hey]" in out
    assert "Some body." in out


def test_admonition_types():
    for kind in ("tip", "caution", "danger"):
        w = MdxWriter()
        w.admonition(kind, "Title", "Body")
        out = w.render()
        prefix = ":" * 3
        assert f"{prefix}{kind}[Title]" in out


def test_admonition_empty_title():
    w = MdxWriter()
    w.admonition("note", "", "Body only.")
    out = w.render()
    assert ":::note[]" in out


# ── cards ────────────────────────────────────────────────────────────

def test_card():
    w = MdxWriter()
    w.card_grid_start()
    w.card("3 Apps", "rocket", "app1, app2, app3")
    w.card_grid_end()
    out = w.render()
    assert "<CardGrid>" in out
    assert 'title="3 Apps"' in out
    assert 'icon="rocket"' in out
    assert "app1, app2, app3" in out
    assert "</CardGrid>" in out


def test_card_standalone():
    w = MdxWriter()
    w.card("Solo", "star", "standalone card")
    assert 'title="Solo"' in w.render()


def test_card_grid_empty():
    w = MdxWriter()
    w.card_grid_start()
    w.card_grid_end()
    out = w.render()
    assert "<CardGrid>\n</CardGrid>" in out


# ── tabs ─────────────────────────────────────────────────────────────

def test_tabs():
    w = MdxWriter()
    w.tabs_start()
    w.tab_start("First")
    w.text("Content here.")
    w.tab_end()
    w.tabs_end()
    out = w.render()
    assert "<Tabs>" in out
    assert '<TabItem label="First">' in out
    assert "Content here." in out
    assert "</TabItem>" in out
    assert "</Tabs>" in out


def test_tabs_multiple():
    w = MdxWriter()
    w.tabs_start()
    w.tab_start("A")
    w.text("Tab A")
    w.tab_end()
    w.tab_start("B")
    w.text("Tab B")
    w.tab_end()
    w.tabs_end()
    out = w.render()
    assert '<TabItem label="A">' in out
    assert '<TabItem label="B">' in out


# ── mermaid ──────────────────────────────────────────────────────────

def test_mermaid_pie():
    w = MdxWriter()
    w.mermaid_pie("By Type", {"Apps": 3, "Libs": 5, "Empty": 0})
    out = w.render()
    assert "```mermaid" in out
    assert "pie showData" in out
    assert '"Apps" : 3' in out
    assert '"Libs" : 5' in out
    assert "Empty" not in out


def test_mermaid_pie_all_zero():
    w = MdxWriter()
    w.mermaid_pie("Empty", {"A": 0, "B": 0})
    out = w.render()
    assert "pie showData" in out
    assert '"A"' not in out


def test_mermaid_pie_empty_data():
    w = MdxWriter()
    w.mermaid_pie("Nothing", {})
    out = w.render()
    assert "pie showData" in out
    assert "title Nothing" in out


def test_mermaid_pie_float_values():
    w = MdxWriter()
    w.mermaid_pie("Floats", {"X": 1.5, "Y": 2.7})
    out = w.render()
    assert '"X" : 1.5' in out
    assert '"Y" : 2.7' in out


def test_mermaid_graph():
    w = MdxWriter()
    w.mermaid_graph(["graph LR", "    A --> B"])
    out = w.render()
    assert "graph LR" in out
    assert "A --> B" in out


def test_mermaid_graph_empty():
    w = MdxWriter()
    w.mermaid_graph([])
    out = w.render()
    assert "```mermaid\n\n```" in out


# ── table ────────────────────────────────────────────────────────────

def test_table():
    w = MdxWriter()
    w.table(
        ["Name", "Count"],
        [["alpha", "1"], ["beta", "2"]],
        ["left", "center"],
    )
    out = w.render()
    assert "| Name | Count |" in out
    assert "| --- | :---: |" in out
    assert "| alpha | 1 |" in out


def test_table_right_alignment():
    w = MdxWriter()
    w.table(["Val"], [["x"]], ["right"])
    assert "| ---: |" in w.render()


def test_table_default_alignment():
    w = MdxWriter()
    w.table(["A", "B"], [["1", "2"]])
    out = w.render()
    assert "| --- | --- |" in out


def test_table_unknown_alignment():
    w = MdxWriter()
    w.table(["A"], [["1"]], ["bogus"])
    assert "| --- |" in w.render()


def test_table_empty_rows():
    w = MdxWriter()
    w.table(["H1", "H2"], [])
    out = w.render()
    assert "| H1 | H2 |" in out
    lines = out.strip().split("\n")
    assert len(lines) == 2  # header + separator only


# ── details ──────────────────────────────────────────────────────────

def test_details():
    w = MdxWriter()
    w.details_start("<strong>Section</strong>")
    w.text("Inner content.")
    w.details_end()
    out = w.render()
    assert "<details>" in out
    assert "<summary><strong>Section</strong></summary>" in out
    assert "Inner content." in out
    assert "</details>" in out


# ── render / write_to ────────────────────────────────────────────────

def test_render_empty():
    w = MdxWriter()
    assert w.render() == ""


def test_write_to(tmp_path):
    w = MdxWriter()
    w.heading("Test")
    path = tmp_path / "out.mdx"
    w.write_to(str(path))
    assert path.read_text().startswith("## Test")


def test_write_to_overwrites(tmp_path):
    path = tmp_path / "out.mdx"
    path.write_text("old content")

    w = MdxWriter()
    w.heading("New")
    w.write_to(str(path))
    assert path.read_text().startswith("## New")
    assert "old content" not in path.read_text()


# ── chaining ─────────────────────────────────────────────────────────

def test_method_chaining():
    w = MdxWriter()
    result = (
        w.frontmatter(title="Chain")
        .heading("H")
        .text("body")
        .raw("end")
    )
    assert result is w
    out = w.render()
    assert "title: Chain" in out
    assert "## H" in out
    assert "body" in out
    assert out.endswith("end")


# ── full document integration ────────────────────────────────────────

def test_full_document(tmp_path):
    w = MdxWriter()
    w.frontmatter(title="Report", editUrl=False)
    w.imports("Card", source="@astrojs/starlight/components")
    w.heading("Overview")
    w.admonition("note", "Auto", "Generated daily.")
    w.card_grid_start()
    w.card("5 Apps", "rocket", "app list here")
    w.card_grid_end()
    w.mermaid_pie("Distribution", {"Apps": 5, "Libs": 10})
    w.tabs_start()
    w.tab_start("Table")
    w.table(["Name", "Type"], [["web", "app"]])
    w.tab_end()
    w.tabs_end()
    w.details_start("<b>More</b>")
    w.text("Detail content.")
    w.details_end()

    path = tmp_path / "report.mdx"
    w.write_to(str(path))
    content = path.read_text()

    assert content.startswith("---\n")
    assert "title: Report" in content
    assert "import { Card }" in content
    assert "## Overview" in content
    assert ":::note[Auto]" in content
    assert "<CardGrid>" in content
    assert "pie showData" in content
    assert "<Tabs>" in content
    assert "| Name | Type |" in content
    assert "<details>" in content
