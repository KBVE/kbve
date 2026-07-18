"""Surgical, format-preserving MDX editor.

Anchored regex edits only — no YAML parse/redump — so hand-authored bento
frontmatter and prose keep their exact bytes and diffs stay minimal.
"""

from __future__ import annotations

import re
from pathlib import Path


class MdxDocument:
    def __init__(self, path: Path, text: str) -> None:
        self._path = Path(path)
        self._text = text
        self._original = text

    @classmethod
    def load(cls, path) -> "MdxDocument":
        p = Path(path)
        return cls(p, p.read_text(encoding="utf-8"))

    @property
    def text(self) -> str:
        return self._text

    @property
    def dirty(self) -> bool:
        return self._text != self._original

    def contains(self, needle: str) -> bool:
        return needle in self._text

    def frontmatter_scalar(self, key: str) -> str | None:
        m = re.search(
            r"^%s:[ \t]*(.+?)[ \t]*$" % re.escape(key), self._text, re.M
        )
        return m.group(1) if m else None

    def set_frontmatter_year(self, key: str, year: str) -> bool:
        pattern = r"(^%s:[ \t]*)(\d{4})(-)" % re.escape(key)
        new, n = re.subn(
            pattern, r"\g<1>%s\g<3>" % year, self._text, count=1, flags=re.M
        )
        if n:
            self._text = new
        return bool(n)

    def replace(self, pattern: str, repl: str, count: int = 1) -> int:
        new, n = re.subn(pattern, repl, self._text, count=count)
        self._text = new
        return n

    def insert_before(self, anchor_pattern: str, block: str) -> bool:
        m = re.search(anchor_pattern, self._text)
        if not m:
            return False
        i = m.start()
        self._text = self._text[:i] + block + self._text[i:]
        return True

    def save(self) -> None:
        self._path.write_text(self._text, encoding="utf-8")
        self._original = self._text
