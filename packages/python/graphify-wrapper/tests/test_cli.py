"""
Tests for CLI commands.
"""

from click.testing import CliRunner
from graphify_wrapper.cli import build_main, query_main, export_main


def test_build_main_requires_scope():
    """Test that build command requires scope."""
    runner = CliRunner()
    result = runner.invoke(build_main, [])
    assert result.exit_code != 0
    assert 'scope' in result.output.lower() or 'Error' in result.output


def test_build_main_requires_output():
    """Test that build command requires output path."""
    runner = CliRunner()
    result = runner.invoke(build_main, ['--scope', 'monorepo'])
    assert result.exit_code != 0


def test_query_main_requires_graph():
    """Test that query command requires graph path."""
    runner = CliRunner()
    result = runner.invoke(query_main, [])
    assert result.exit_code != 0


def test_export_main_requires_paths():
    """Test that export command requires input and output paths."""
    runner = CliRunner()
    result = runner.invoke(export_main, [])
    assert result.exit_code != 0
