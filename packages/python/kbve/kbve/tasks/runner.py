"""Lightweight async task runner.

Runs named async callables with timeout, error capture, and status
tracking. Designed for microservice startup jobs, periodic checks,
and one-shot background work.
"""

from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass
from enum import Enum
from typing import Any, Callable, Coroutine


class TaskState(str, Enum):
    """Lifecycle state of a task."""

    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    TIMEOUT = "timeout"


@dataclass
class TaskResult:
    """Outcome of a single task execution."""

    name: str
    state: TaskState
    result: Any = None
    error: str | None = None
    duration_ms: float = 0.0


class TaskRunner:
    """Run named async tasks with timeout and error capture.

    Usage::

        runner = TaskRunner()
        runner.add("migrate", migrate_db, timeout=30.0)
        runner.add("cache-warm", warm_cache)

        results = await runner.run_all()
        # [TaskResult(name="migrate", state=COMPLETED, ...), ...]

        # Or run sequentially:
        results = await runner.run_sequential()
    """

    def __init__(self) -> None:
        self._tasks: list[tuple[str, Callable, float | None]] = []

    def add(
        self,
        name: str,
        fn: Callable[[], Coroutine],
        timeout: float | None = None,
    ) -> "TaskRunner":
        """Register a named async callable.

        *timeout* is in seconds. None means no timeout.
        """
        self._tasks.append((name, fn, timeout))
        return self

    async def run_all(self) -> list[TaskResult]:
        """Run all tasks concurrently and return results."""
        coros = [self._execute(name, fn, timeout)
                 for name, fn, timeout in self._tasks]
        return await asyncio.gather(*coros)

    async def run_sequential(self) -> list[TaskResult]:
        """Run all tasks one-by-one in registration order."""
        results: list[TaskResult] = []
        for name, fn, timeout in self._tasks:
            result = await self._execute(name, fn, timeout)
            results.append(result)
        return results

    def task_names(self) -> list[str]:
        """Return registered task names."""
        return [name for name, _, _ in self._tasks]

    async def _execute(
        self, name: str, fn: Callable, timeout: float | None,
    ) -> TaskResult:
        start = time.monotonic()
        try:
            if timeout is not None:
                ret = await asyncio.wait_for(fn(), timeout=timeout)
            else:
                ret = await fn()
            elapsed = (time.monotonic() - start) * 1000
            return TaskResult(
                name=name,
                state=TaskState.COMPLETED,
                result=ret,
                duration_ms=round(elapsed, 2),
            )
        except asyncio.TimeoutError:
            elapsed = (time.monotonic() - start) * 1000
            return TaskResult(
                name=name,
                state=TaskState.TIMEOUT,
                error=f"Timed out after {timeout}s",
                duration_ms=round(elapsed, 2),
            )
        except Exception as exc:
            elapsed = (time.monotonic() - start) * 1000
            return TaskResult(
                name=name,
                state=TaskState.FAILED,
                error=str(exc),
                duration_ms=round(elapsed, 2),
            )
