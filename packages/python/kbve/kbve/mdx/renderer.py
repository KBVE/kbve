"""Starlight MDX rendering primitives.

Provides ``MdxWriter``, a composable builder for generating Astro Starlight
MDX pages with frontmatter, cards, tabs, mermaid diagrams, tables, and
admonitions.
"""

from __future__ import annotations

import io
from typing import Any


class MdxWriter:
    """Composable builder for Starlight MDX content.

    Usage::

        w = MdxWriter()
        w.frontmatter(title="My Page", description="A page.")
        w.imports("Card", "CardGrid", source="@astrojs/starlight/components")
        w.heading("Hello", level=2)
        w.admonition("note", "Auto-generated", "Some body text.")
        w.card_grid_start()
        w.card("3 Apps", icon="rocket", body="app1, app2, app3")
        w.card_grid_end()
        w.mermaid_pie("Title", {"Apps": 3, "Libs": 5})
        w.table(["Col A", "Col B"], [["a", "b"]])
        content = w.render()
    """

    def __init__(self) -> None:
        self._buf = io.StringIO()

    # ── Frontmatter ──────────────────────────────────────────────

    def frontmatter(self, **kwargs: Any) -> "MdxWriter":
        """Write YAML frontmatter block.

        Supports flat keys and one level of nesting via dict values::

            w.frontmatter(
                title="Page",
                sidebar={"label": "Nav", "order": 1},
            )
        """
        colon = ":"
        self._buf.write("---\n")
        for key, val in kwargs.items():
            if isinstance(val, dict):
                self._buf.write(f"{key}{colon}\n")
                for k, v in val.items():
                    if isinstance(v, str) and "\n" in v:
                        self._buf.write(f"    {k}{colon} |\n")
                        for line in v.splitlines():
                            self._buf.write(f"        {line}\n")
                    else:
                        self._buf.write(f"    {k}{colon} {v}\n")
            elif isinstance(val, bool):
                bval = "true" if val else "false"
                self._buf.write(f"{key}{colon} {bval}\n")
            else:
                self._buf.write(f"{key}{colon} {val}\n")
        self._buf.write("---\n\n")
        return self

    # ── Imports ──────────────────────────────────────────────────

    def imports(self, *components: str, source: str) -> "MdxWriter":
        """Write an ESM import statement."""
        names = ", ".join(components)
        lbrace = "{"
        rbrace = "}"
        semi = ";"
        self._buf.write(
            f"import {lbrace} {names} {rbrace} from '{source}'{semi}\n\n"
        )
        return self

    # ── Headings & text ──────────────────────────────────────────

    def heading(self, text: str, level: int = 2) -> "MdxWriter":
        prefix = "#" * level
        self._buf.write(f"{prefix} {text}\n\n")
        return self

    def text(self, content: str) -> "MdxWriter":
        self._buf.write(f"{content}\n\n")
        return self

    def raw(self, content: str) -> "MdxWriter":
        """Write raw content without trailing newlines."""
        self._buf.write(content)
        return self

    # ── Admonitions ──────────────────────────────────────────────

    def admonition(
        self, kind: str, title: str, body: str,
    ) -> "MdxWriter":
        """Write a Starlight admonition (note, tip, caution, danger)."""
        prefix = ":" * 3
        self._buf.write(
            f"{prefix}{kind}[{title}]\n{body}\n{prefix}\n\n"
        )
        return self

    # ── Cards ────────────────────────────────────────────────────

    def card_grid_start(self) -> "MdxWriter":
        self._buf.write("<CardGrid>\n")
        return self

    def card_grid_end(self) -> "MdxWriter":
        self._buf.write("</CardGrid>\n\n")
        return self

    def card(
        self, title: str, icon: str, body: str,
    ) -> "MdxWriter":
        line1 = f'  <Card title="{title}" icon="{icon}">'
        line2 = f"    {body}"
        self._buf.write(f"{line1}\n{line2}\n  </Card>\n")
        return self

    # ── Tabs ─────────────────────────────────────────────────────

    def tabs_start(self) -> "MdxWriter":
        self._buf.write("<Tabs>\n")
        return self

    def tabs_end(self) -> "MdxWriter":
        self._buf.write("</Tabs>\n\n")
        return self

    def tab_start(self, label: str) -> "MdxWriter":
        tag = f'  <TabItem label="{label}">'
        self._buf.write(f"{tag}\n\n")
        return self

    def tab_end(self) -> "MdxWriter":
        self._buf.write("  </TabItem>\n")
        return self

    # ── Mermaid ──────────────────────────────────────────────────

    def mermaid_pie(
        self, title: str, data: dict[str, int | float],
    ) -> "MdxWriter":
        """Write a Mermaid pie chart."""
        self._buf.write("```mermaid\npie showData\n")
        self._buf.write(f"    title {title}\n")
        for label, value in data.items():
            if value > 0:
                self._buf.write(
                    '    "' + label + '" : ' + str(value) + '\n'
                )
        self._buf.write("```\n\n")
        return self

    def mermaid_graph(self, lines: list[str]) -> "MdxWriter":
        """Write a raw Mermaid graph block."""
        self._buf.write("```mermaid\n")
        self._buf.write("\n".join(lines))
        self._buf.write("\n```\n\n")
        return self

    # ── Tables ───────────────────────────────────────────────────

    def table(
        self,
        headers: list[str],
        rows: list[list[str]],
        alignments: list[str] | None = None,
    ) -> "MdxWriter":
        """Write a Markdown table.

        ``alignments`` can contain ``"left"``, ``"center"``, or ``"right"``
        per column.  Defaults to left-aligned.
        """
        if alignments is None:
            alignments = ["left"] * len(headers)

        sep_map = {
            "left": "---",
            "center": ":---:",
            "right": "---:",
        }
        header_line = "| " + " | ".join(headers) + " |"
        sep_line = "| " + " | ".join(
            sep_map.get(a, "---") for a in alignments
        ) + " |"

        self._buf.write(header_line + "\n")
        self._buf.write(sep_line + "\n")
        for row in rows:
            self._buf.write("| " + " | ".join(row) + " |\n")
        self._buf.write("\n")
        return self

    # ── Details / collapsible ────────────────────────────────────

    def details_start(self, summary: str) -> "MdxWriter":
        self._buf.write(f"<details>\n<summary>{summary}</summary>\n\n")
        return self

    def details_end(self) -> "MdxWriter":
        self._buf.write("\n</details>\n\n")
        return self

    # ── Render ───────────────────────────────────────────────────

    def render(self) -> str:
        """Return the accumulated MDX content as a string."""
        return self._buf.getvalue()

    def write_to(self, path: str) -> None:
        """Write the accumulated MDX content to a file."""
        with open(path, "w") as f:
            f.write(self.render())
