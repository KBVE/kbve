"""Claude Code process interaction and usage tracking.

Provides functions to query a running or available Claude Code
installation for version info and usage statistics.
"""

from __future__ import annotations

import json
import logging
import re
import shutil
from dataclasses import dataclass
from typing import Any

from .process import CommandResult, run_command

logger = logging.getLogger(__name__)


@dataclass
class ClaudeUsage:
    """Parsed Claude Code usage statistics."""

    raw_output: str
    cost_usd: float | None = None
    input_tokens: int | None = None
    output_tokens: int | None = None
    cache_read_tokens: int | None = None
    cache_write_tokens: int | None = None
    total_tokens: int | None = None
    percent_used: float | None = None
    duration_s: float | None = None
    available: bool = True
    error: str | None = None

    def as_dict(self) -> dict[str, Any]:
        """Return usage data as a dict (for JSON serialization)."""
        return {
            "available": self.available,
            "cost_usd": self.cost_usd,
            "input_tokens": self.input_tokens,
            "output_tokens": self.output_tokens,
            "cache_read_tokens": self.cache_read_tokens,
            "cache_write_tokens": self.cache_write_tokens,
            "total_tokens": self.total_tokens,
            "percent_used": self.percent_used,
            "duration_s": self.duration_s,
            "error": self.error,
        }


def _find_claude_binary() -> str | None:
    """Find the claude CLI binary on PATH."""
    return shutil.which("claude")


def get_claude_version(
    binary: str | None = None,
) -> CommandResult:
    """Get the installed Claude Code version.

    Returns a ``CommandResult`` with the version string in stdout.
    """
    cmd = binary or _find_claude_binary()
    if cmd is None:
        return CommandResult(
            exit_code=-1,
            stdout="",
            stderr="claude binary not found on PATH",
        )
    return run_command([cmd, "--version"], timeout=10.0)


def _parse_usage_output(raw: str) -> ClaudeUsage:
    """Parse Claude Code usage output into structured data.

    Handles both the human-readable /usage output and any
    structured JSON that Claude may emit.
    """
    usage = ClaudeUsage(raw_output=raw)

    if not raw.strip():
        usage.available = False
        usage.error = "Empty output"
        return usage

    # Try JSON first (future-proofing)
    try:
        data = json.loads(raw)
        if isinstance(data, dict):
            usage.cost_usd = data.get("cost_usd")
            usage.input_tokens = data.get("input_tokens")
            usage.output_tokens = data.get("output_tokens")
            usage.total_tokens = data.get("total_tokens")
            usage.percent_used = data.get("percent_used")
            return usage
    except (json.JSONDecodeError, ValueError):
        pass

    # Parse human-readable output
    cost_match = re.search(
        r"\$([0-9]+\.?[0-9]*)", raw,
    )
    if cost_match:
        usage.cost_usd = float(cost_match.group(1))

    token_patterns = [
        (r"input[:\s]+([0-9,]+)\s*tokens?", "input_tokens"),
        (r"output[:\s]+([0-9,]+)\s*tokens?", "output_tokens"),
        (r"cache.?read[:\s]+([0-9,]+)\s*tokens?", "cache_read_tokens"),
        (r"cache.?write[:\s]+([0-9,]+)\s*tokens?", "cache_write_tokens"),
        (r"total[:\s]+([0-9,]+)\s*tokens?", "total_tokens"),
    ]
    for pattern, attr in token_patterns:
        match = re.search(pattern, raw, re.IGNORECASE)
        if match:
            val = int(match.group(1).replace(",", ""))
            setattr(usage, attr, val)

    pct_match = re.search(r"([0-9]+\.?[0-9]*)%", raw)
    if pct_match:
        usage.percent_used = float(pct_match.group(1))

    duration_match = re.search(
        r"([0-9]+\.?[0-9]*)\s*(?:seconds?|s\b)", raw, re.IGNORECASE,
    )
    if duration_match:
        usage.duration_s = float(duration_match.group(1))

    return usage


def get_usage(
    binary: str | None = None,
    timeout: float = 15.0,
) -> ClaudeUsage:
    """Query Claude Code for current session usage.

    Runs ``claude`` in print mode with the ``/usage`` command.
    Parses the output into a ``ClaudeUsage`` dataclass.
    """
    cmd = binary or _find_claude_binary()
    if cmd is None:
        return ClaudeUsage(
            raw_output="",
            available=False,
            error="claude binary not found on PATH",
        )

    result = run_command(
        [cmd, "-p", "/usage"],
        timeout=timeout,
    )

    if not result.success:
        return ClaudeUsage(
            raw_output=result.stderr or result.stdout,
            available=True,
            error=result.stderr or "Command failed",
        )

    return _parse_usage_output(result.stdout)
