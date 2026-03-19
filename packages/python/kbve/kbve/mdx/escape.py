"""MDX/JSX text escaping utilities."""

from __future__ import annotations


def escape_mdx(text: str) -> str:
    """Escape characters that MDX/JSX would interpret as markup."""
    return (text
            .replace("&", "&amp;")
            .replace("<", "&lt;")
            .replace(">", "&gt;")
            .replace("{", "&#123;")
            .replace("}", "&#125;")
            .replace("|", "\\|"))
