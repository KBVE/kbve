"""OSRS item-corpus analysis toolchain (kbve.osrs.*).

Survey and audit the OSRS MDX item corpus for content tiers, section fill,
variant classes, and thin-content remediation targets. Kept off the core
install behind the ``osrs`` extra. Enable with: ``uv sync --extra osrs``.

CLI entry points:
    uv run kbve-osrs-survey --root <repo>
    uv run kbve-osrs-audit  --root <repo>
"""
