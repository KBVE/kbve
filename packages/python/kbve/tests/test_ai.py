"""Tests for kbve.ai module."""

from kbve.ai.process import CommandResult, run_command
from kbve.ai.claude import (
    ClaudeUsage,
    _parse_usage_output,
    get_claude_version,
)


# ── CommandResult ────────────────────────────────────────────────────

def test_command_result_success():
    r = CommandResult(exit_code=0, stdout="ok", stderr="")
    assert r.success is True


def test_command_result_failure():
    r = CommandResult(exit_code=1, stdout="", stderr="err")
    assert r.success is False


def test_command_result_timeout():
    r = CommandResult(exit_code=-1, stdout="", stderr="", timed_out=True)
    assert r.success is False
    assert r.timed_out is True


# ── run_command ──────────────────────────────────────────────────────

def test_run_command_echo():
    result = run_command(["echo", "hello"])
    assert result.success is True
    assert result.stdout == "hello"


def test_run_command_exit_code():
    result = run_command(["false"])
    assert result.success is False
    assert result.exit_code != 0


def test_run_command_not_found():
    result = run_command(["nonexistent_binary_xyz"])
    assert result.success is False
    assert "not found" in result.stderr


def test_run_command_timeout():
    result = run_command(["sleep", "10"], timeout=0.1)
    assert result.timed_out is True
    assert result.success is False


def test_run_command_with_input():
    result = run_command(["cat"], input_text="hello from stdin")
    assert result.success is True
    assert result.stdout == "hello from stdin"


def test_run_command_cwd(tmp_path):
    result = run_command(["pwd"], cwd=str(tmp_path))
    assert result.success is True
    assert str(tmp_path) in result.stdout


# ── _parse_usage_output ─────────────────────────────────────────────

def test_parse_usage_empty():
    usage = _parse_usage_output("")
    assert usage.available is False
    assert usage.error == "Empty output"


def test_parse_usage_cost():
    usage = _parse_usage_output("Total cost: $1.2345")
    assert usage.cost_usd == 1.2345


def test_parse_usage_tokens():
    raw = (
        "Input: 50,000 tokens\n"
        "Output: 10,000 tokens\n"
        "Total: 60,000 tokens"
    )
    usage = _parse_usage_output(raw)
    assert usage.input_tokens == 50000
    assert usage.output_tokens == 10000
    assert usage.total_tokens == 60000


def test_parse_usage_cache_tokens():
    raw = (
        "Cache read: 100,000 tokens\n"
        "Cache write: 5,000 tokens"
    )
    usage = _parse_usage_output(raw)
    assert usage.cache_read_tokens == 100000
    assert usage.cache_write_tokens == 5000


def test_parse_usage_percent():
    usage = _parse_usage_output("Context: 45.2% used")
    assert usage.percent_used == 45.2


def test_parse_usage_duration():
    usage = _parse_usage_output("Duration: 123.4 seconds")
    assert usage.duration_s == 123.4


def test_parse_usage_duration_short():
    usage = _parse_usage_output("Took 5.0s")
    assert usage.duration_s == 5.0


def test_parse_usage_json():
    import json
    data = {
        "cost_usd": 0.55,
        "input_tokens": 1000,
        "output_tokens": 500,
        "total_tokens": 1500,
        "percent_used": 30.0,
    }
    usage = _parse_usage_output(json.dumps(data))
    assert usage.cost_usd == 0.55
    assert usage.input_tokens == 1000
    assert usage.output_tokens == 500
    assert usage.total_tokens == 1500
    assert usage.percent_used == 30.0


def test_parse_usage_combined():
    raw = (
        "Session stats:\n"
        "  Cost: $0.0842\n"
        "  Input: 25,000 tokens\n"
        "  Output: 8,000 tokens\n"
        "  Total: 33,000 tokens\n"
        "  Context: 12.5% used\n"
        "  Duration: 45 seconds"
    )
    usage = _parse_usage_output(raw)
    assert usage.cost_usd == 0.0842
    assert usage.input_tokens == 25000
    assert usage.output_tokens == 8000
    assert usage.total_tokens == 33000
    assert usage.percent_used == 12.5
    assert usage.duration_s == 45.0


# ── ClaudeUsage ──────────────────────────────────────────────────────

def test_claude_usage_as_dict():
    usage = ClaudeUsage(
        raw_output="test",
        cost_usd=1.0,
        input_tokens=100,
    )
    d = usage.as_dict()
    assert d["cost_usd"] == 1.0
    assert d["input_tokens"] == 100
    assert d["available"] is True
    assert d["error"] is None


def test_claude_usage_defaults():
    usage = ClaudeUsage(raw_output="")
    assert usage.cost_usd is None
    assert usage.total_tokens is None
    assert usage.percent_used is None
    assert usage.available is True


# ── get_claude_version ───────────────────────────────────────────────

def test_get_claude_version():
    result = get_claude_version()
    # Claude is installed in this environment
    if result.success:
        assert "claude" in result.stdout.lower() or \
            result.stdout[0].isdigit()
    # If not installed, still shouldn't crash
    assert isinstance(result, CommandResult)


def test_get_claude_version_bad_binary():
    result = get_claude_version(binary="/nonexistent/claude")
    assert result.success is False


# ── Module imports ───────────────────────────────────────────────────

def test_ai_module_imports():
    from kbve.ai import (
        ClaudeUsage,
        CommandResult,
        get_claude_version,
        get_usage,
        run_command,
    )
    assert callable(run_command)
    assert callable(get_usage)
    assert callable(get_claude_version)
    assert ClaudeUsage is not None
    assert CommandResult is not None
