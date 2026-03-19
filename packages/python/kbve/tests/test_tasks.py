"""Tests for kbve.tasks module."""

import asyncio

import pytest

from kbve.tasks.runner import TaskResult, TaskRunner, TaskState


@pytest.fixture
def runner():
    return TaskRunner()


# ── TaskRunner basics ────────────────────────────────────────────────

def test_task_runner_empty(runner):
    results = asyncio.get_event_loop().run_until_complete(
        runner.run_all()
    )
    assert results == []


def test_task_runner_single(runner):
    async def job():
        return 42

    runner.add("calc", job)
    results = asyncio.get_event_loop().run_until_complete(
        runner.run_all()
    )
    assert len(results) == 1
    assert results[0].name == "calc"
    assert results[0].state == TaskState.COMPLETED
    assert results[0].result == 42


def test_task_runner_multiple(runner):
    async def a():
        return "a"

    async def b():
        return "b"

    runner.add("a", a).add("b", b)
    results = asyncio.get_event_loop().run_until_complete(
        runner.run_all()
    )
    assert len(results) == 2
    assert all(r.state == TaskState.COMPLETED for r in results)


def test_task_runner_failure(runner):
    async def failing():
        raise ValueError("broken")

    runner.add("fail", failing)
    results = asyncio.get_event_loop().run_until_complete(
        runner.run_all()
    )
    assert results[0].state == TaskState.FAILED
    assert "broken" in results[0].error


def test_task_runner_timeout(runner):
    async def slow():
        await asyncio.sleep(10)

    runner.add("slow", slow, timeout=0.01)
    results = asyncio.get_event_loop().run_until_complete(
        runner.run_all()
    )
    assert results[0].state == TaskState.TIMEOUT
    assert "Timed out" in results[0].error


def test_task_runner_sequential(runner):
    order = []

    async def first():
        order.append("first")

    async def second():
        order.append("second")

    runner.add("first", first).add("second", second)
    results = asyncio.get_event_loop().run_until_complete(
        runner.run_sequential()
    )
    assert order == ["first", "second"]
    assert all(r.state == TaskState.COMPLETED for r in results)


def test_task_runner_sequential_continues_on_failure(runner):
    async def failing():
        raise RuntimeError("oops")

    async def ok():
        return "fine"

    runner.add("fail", failing).add("ok", ok)
    results = asyncio.get_event_loop().run_until_complete(
        runner.run_sequential()
    )
    assert results[0].state == TaskState.FAILED
    assert results[1].state == TaskState.COMPLETED


def test_task_runner_names(runner):
    async def noop():
        pass

    runner.add("a", noop).add("b", noop)
    assert runner.task_names() == ["a", "b"]


def test_task_runner_duration(runner):
    async def job():
        return True

    runner.add("job", job)
    results = asyncio.get_event_loop().run_until_complete(
        runner.run_all()
    )
    assert results[0].duration_ms >= 0


def test_task_runner_chaining(runner):
    async def noop():
        pass

    result = runner.add("a", noop).add("b", noop)
    assert result is runner


# ── TaskState enum ───────────────────────────────────────────────────

def test_task_state_values():
    assert TaskState.PENDING.value == "pending"
    assert TaskState.RUNNING.value == "running"
    assert TaskState.COMPLETED.value == "completed"
    assert TaskState.FAILED.value == "failed"
    assert TaskState.TIMEOUT.value == "timeout"


# ── TaskResult ───────────────────────────────────────────────────────

def test_task_result_defaults():
    tr = TaskResult(name="test", state=TaskState.PENDING)
    assert tr.result is None
    assert tr.error is None
    assert tr.duration_ms == 0.0
