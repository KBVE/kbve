"""JSON and file I/O helpers for kbve core.

Provides safe loading, writing, and merging of JSON data — useful as
building blocks for CLI commands and microservice endpoints.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any


def load_json(source: str | Path) -> Any:
    """Load JSON from a file path.

    Raises ``FileNotFoundError`` if the path doesn't exist,
    ``json.JSONDecodeError`` on malformed JSON.
    """
    with open(source) as f:
        return json.load(f)


def write_json(
    data: Any,
    path: str | Path,
    indent: int = 2,
) -> None:
    """Write *data* as formatted JSON to *path*."""
    with open(path, "w") as f:
        json.dump(data, f, indent=indent)


def merge_dicts(
    base: dict,
    override: dict,
    deep: bool = True,
) -> dict:
    """Merge *override* into *base*, returning a new dict.

    When *deep* is True (default), nested dicts are merged recursively
    rather than replaced wholesale.
    """
    merged = dict(base)
    for key, val in override.items():
        if (
            deep
            and key in merged
            and isinstance(merged[key], dict)
            and isinstance(val, dict)
        ):
            merged[key] = merge_dicts(merged[key], val, deep=True)
        else:
            merged[key] = val
    return merged
