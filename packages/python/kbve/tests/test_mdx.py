"""Tests for kbve.mdx module."""

from kbve.mdx.escape import escape_mdx
from kbve.mdx.renderer import MdxWriter


def test_escape_mdx():
    assert escape_mdx("a & b") == "a &amp; b"
    assert escape_mdx("<div>") == "&lt;div&gt;"
    assert escape_mdx("{value}") == "&#123;value&#125;"
    assert escape_mdx("col | col") == "col \\| col"


def test_escape_mdx_combined():
    assert escape_mdx("<a & {b}>") == "&lt;a &amp; &#123;b&#125;&gt;"


def test_frontmatter():
    w = MdxWriter()
    w.frontmatter(title="Test", editUrl=False)
    out = w.render()
    assert "---\n" in out
    assert "title: Test\n" in out
    assert "editUrl: false\n" in out


def test_frontmatter_nested():
    w = MdxWriter()
    w.frontmatter(sidebar={"label": "Nav", "order": 1})
    out = w.render()
    assert "sidebar:\n" in out
    assert "    label: Nav\n" in out
    assert "    order: 1\n" in out


def test_imports():
    w = MdxWriter()
    w.imports("Card", "CardGrid", source="@astrojs/starlight/components")
    out = w.render()
    assert "import { Card, CardGrid }" in out
    assert "'@astrojs/starlight/components'" in out


def test_heading():
    w = MdxWriter()
    w.heading("Title", level=3)
    assert "### Title\n" in w.render()


def test_admonition():
    w = MdxWriter()
    w.admonition("note", "Hey", "Some body.")
    out = w.render()
    assert ":::note[Hey]" in out
    assert "Some body." in out


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


def test_mermaid_pie():
    w = MdxWriter()
    w.mermaid_pie("By Type", {"Apps": 3, "Libs": 5, "Empty": 0})
    out = w.render()
    assert "```mermaid" in out
    assert "pie showData" in out
    assert '"Apps" : 3' in out
    assert '"Libs" : 5' in out
    assert "Empty" not in out  # zero values are skipped


def test_mermaid_graph():
    w = MdxWriter()
    w.mermaid_graph(["graph LR", "    A --> B"])
    out = w.render()
    assert "graph LR" in out
    assert "A --> B" in out


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


def test_write_to(tmp_path):
    w = MdxWriter()
    w.heading("Test")
    path = tmp_path / "out.mdx"
    w.write_to(str(path))
    assert path.read_text().startswith("## Test")
