"""Shell process runner with structured output capture.

Generic subprocess execution with timeout, stderr capture, and
structured results. Used as the foundation for Claude Code
interaction.
"""

from __future__ import annotations

import logging
import subprocess
from dataclasses import dataclass

logger = logging.getLogger(__name__)


@dataclass
class CommandResult:
    """Result of a shell command execution."""

    exit_code: int
    stdout: str
    stderr: str
    timed_out: bool = False

    @property
    def success(self) -> bool:
        return self.exit_code == 0 and not self.timed_out


def run_command(
    args: list[str],
    input_text: str | None = None,
    timeout: float = 30.0,
    cwd: str | None = None,
    env: dict[str, str] | None = None,
) -> CommandResult:
    """Run a shell command and return structured results.

    Args:
        args: Command and arguments (e.g., ``["claude", "--version"]``).
        input_text: Optional text to send to stdin.
        timeout: Timeout in seconds.
        cwd: Working directory.
        env: Environment variable overrides.

    Returns:
        A ``CommandResult`` with stdout, stderr, exit code, and
        timeout status.
    """
    try:
        proc = subprocess.run(
            args,
            input=input_text,
            capture_output=True,
            text=True,
            timeout=timeout,
            cwd=cwd,
            env=env,
        )
        return CommandResult(
            exit_code=proc.returncode,
            stdout=proc.stdout.strip(),
            stderr=proc.stderr.strip(),
        )
    except subprocess.TimeoutExpired:
        logger.warning("Command timed out after %.1fs: %s", timeout, args)
        return CommandResult(
            exit_code=-1,
            stdout="",
            stderr=f"Command timed out after {timeout}s",
            timed_out=True,
        )
    except FileNotFoundError:
        return CommandResult(
            exit_code=-1,
            stdout="",
            stderr=f"Command not found: {args[0]}",
        )
