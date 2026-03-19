"""Integration tests for fudster.cli module using Click CliRunner."""

import json

from click.testing import CliRunner

from fudster.cli import main

SAMPLE_GRAPH = {
    "graph": {
        "nodes": {
            "app-web": {"type": "app", "data": {"root": "apps/web"}},
            "lib-ui": {"type": "lib", "data": {"root": "packages/ui"}},
        },
        "dependencies": {
            "app-web": [
                {"source": "app-web", "target": "lib-ui",
                 "type": "static"},
            ],
            "lib-ui": [],
        },
    }
}

SAMPLE_SECURITY = {
    "npm": {
        "advisories": {
            "1": {
                "severity": "high",
                "title": "Prototype Pollution",
                "module_name": "lodash",
                "url": "https://example.com/1",
            },
        },
    },
    "cargo": {
        "vulnerabilities": {"list": []},
    },
    "python": [],
    "codeql": [],
    "dependabot": [],
}


# ── CLI group ────────────────────────────────────────────────────────

def test_cli_help():
    runner = CliRunner()
    result = runner.invoke(main, ["--help"])
    assert result.exit_code == 0
    assert "Fudster CLI" in result.output


def test_nx_help():
    runner = CliRunner()
    result = runner.invoke(main, ["nx", "--help"])
    assert result.exit_code == 0
    assert "graph-to-mdx" in result.output
    assert "security-to-mdx" in result.output


# ── graph-to-mdx ─────────────────────────────────────────────────────

def test_graph_to_mdx(tmp_path):
    graph_file = tmp_path / "graph.json"
    graph_file.write_text(json.dumps(SAMPLE_GRAPH))
    output_file = tmp_path / "output.mdx"

    runner = CliRunner()
    result = runner.invoke(main, [
        "nx", "graph-to-mdx",
        str(graph_file),
        str(output_file),
        "2026-03-18T00:00:00Z",
    ])
    assert result.exit_code == 0
    assert "Generated" in result.output
    assert "2 projects" in result.output

    content = output_file.read_text()
    assert content.startswith("---\n")
    assert "NX Dependency Graph" in content
    assert "2026-03-18" in content
    assert "<CardGrid>" in content
    assert "app-web" in content
    assert "lib-ui" in content


def test_graph_to_mdx_frontmatter(tmp_path):
    graph_file = tmp_path / "graph.json"
    graph_file.write_text(json.dumps(SAMPLE_GRAPH))
    output_file = tmp_path / "output.mdx"

    runner = CliRunner()
    runner.invoke(main, [
        "nx", "graph-to-mdx",
        str(graph_file), str(output_file), "ts",
    ])
    content = output_file.read_text()
    assert "title: NX Dependency Graph" in content
    assert "editUrl: false" in content
    assert "import {" in content


def test_graph_to_mdx_diagram_included(tmp_path):
    graph_file = tmp_path / "graph.json"
    graph_file.write_text(json.dumps(SAMPLE_GRAPH))
    output_file = tmp_path / "output.mdx"

    runner = CliRunner()
    runner.invoke(main, [
        "nx", "graph-to-mdx",
        str(graph_file), str(output_file), "ts",
    ])
    content = output_file.read_text()
    assert "graph LR" in content
    assert "Legend" in content


def test_graph_to_mdx_project_index(tmp_path):
    graph_file = tmp_path / "graph.json"
    graph_file.write_text(json.dumps(SAMPLE_GRAPH))
    output_file = tmp_path / "output.mdx"

    runner = CliRunner()
    runner.invoke(main, [
        "nx", "graph-to-mdx",
        str(graph_file), str(output_file), "ts",
    ])
    content = output_file.read_text()
    assert "| Project |" in content
    assert "**app-web**" in content


def test_graph_to_mdx_missing_file():
    runner = CliRunner()
    result = runner.invoke(main, [
        "nx", "graph-to-mdx",
        "/nonexistent/graph.json", "/tmp/out.mdx", "ts",
    ])
    assert result.exit_code != 0


# ── security-to-mdx ─────────────────────────────────────────────────

def test_security_to_mdx_json_output(tmp_path):
    input_file = tmp_path / "security.json"
    input_file.write_text(json.dumps(SAMPLE_SECURITY))
    json_out = tmp_path / "report.json"

    runner = CliRunner()
    result = runner.invoke(main, [
        "nx", "security-to-mdx",
        "--input", str(input_file),
        "--timestamp", "2026-03-18T00:00:00Z",
        "--json-out", str(json_out),
    ])
    assert result.exit_code == 0
    assert "JSON written" in result.output

    data = json.loads(json_out.read_text())
    assert "summary" in data
    assert "ecosystems" in data
    assert data["generated_at"] == "2026-03-18T00:00:00Z"
    assert data["ecosystems"]["npm"]["total"] == 1


def test_security_to_mdx_mdx_output(tmp_path):
    input_file = tmp_path / "security.json"
    input_file.write_text(json.dumps(SAMPLE_SECURITY))
    mdx_out = tmp_path / "report.mdx"

    runner = CliRunner()
    result = runner.invoke(main, [
        "nx", "security-to-mdx",
        "--input", str(input_file),
        "--timestamp", "2026-03-18T00:00:00Z",
        "--mdx-out", str(mdx_out),
    ])
    assert result.exit_code == 0
    assert "MDX written" in result.output

    content = mdx_out.read_text()
    assert "Security Audit Report" in content
    assert "2026-03-18" in content
    assert "<CardGrid>" in content
    assert "npm" in content


def test_security_to_mdx_both_outputs(tmp_path):
    input_file = tmp_path / "security.json"
    input_file.write_text(json.dumps(SAMPLE_SECURITY))
    mdx_out = tmp_path / "report.mdx"
    json_out = tmp_path / "report.json"

    runner = CliRunner()
    result = runner.invoke(main, [
        "nx", "security-to-mdx",
        "--input", str(input_file),
        "--timestamp", "ts",
        "--mdx-out", str(mdx_out),
        "--json-out", str(json_out),
    ])
    assert result.exit_code == 0
    assert mdx_out.exists()
    assert json_out.exists()


def test_security_to_mdx_no_output_flags(tmp_path):
    input_file = tmp_path / "security.json"
    input_file.write_text(json.dumps(SAMPLE_SECURITY))

    runner = CliRunner()
    result = runner.invoke(main, [
        "nx", "security-to-mdx",
        "--input", str(input_file),
        "--timestamp", "ts",
    ])
    assert result.exit_code != 0
    assert "at least one" in result.output.lower() or result.exit_code != 0


def test_security_to_mdx_crit_high_callout(tmp_path):
    security_data = {
        "npm": {
            "advisories": {
                "1": {
                    "severity": "critical",
                    "title": "RCE",
                    "module_name": "pkg",
                    "url": "",
                },
            },
        },
    }
    input_file = tmp_path / "security.json"
    input_file.write_text(json.dumps(security_data))
    mdx_out = tmp_path / "report.mdx"

    runner = CliRunner()
    runner.invoke(main, [
        "nx", "security-to-mdx",
        "--input", str(input_file),
        "--timestamp", "ts",
        "--mdx-out", str(mdx_out),
    ])
    content = mdx_out.read_text()
    assert "Action Required" in content


def test_security_to_mdx_all_clear(tmp_path):
    input_file = tmp_path / "security.json"
    input_file.write_text(json.dumps({
        "npm": {},
        "cargo": {},
        "python": [],
        "codeql": [],
        "dependabot": [],
    }))
    mdx_out = tmp_path / "report.mdx"

    runner = CliRunner()
    runner.invoke(main, [
        "nx", "security-to-mdx",
        "--input", str(input_file),
        "--timestamp", "ts",
        "--mdx-out", str(mdx_out),
    ])
    content = mdx_out.read_text()
    assert "All Clear" in content


def test_security_to_mdx_medium_only(tmp_path):
    security_data = {
        "npm": {
            "advisories": {
                "1": {
                    "severity": "low",
                    "title": "minor",
                    "module_name": "pkg",
                    "url": "",
                },
            },
        },
    }
    input_file = tmp_path / "security.json"
    input_file.write_text(json.dumps(security_data))
    mdx_out = tmp_path / "report.mdx"

    runner = CliRunner()
    runner.invoke(main, [
        "nx", "security-to-mdx",
        "--input", str(input_file),
        "--timestamp", "ts",
        "--mdx-out", str(mdx_out),
    ])
    content = mdx_out.read_text()
    assert "Findings Present" in content


def test_security_to_mdx_long_title_truncation(tmp_path):
    long_title = "A" * 100
    security_data = {
        "npm": {
            "advisories": {
                "1": {
                    "severity": "high",
                    "title": long_title,
                    "module_name": "pkg",
                    "url": "",
                },
            },
        },
    }
    input_file = tmp_path / "security.json"
    input_file.write_text(json.dumps(security_data))
    mdx_out = tmp_path / "report.mdx"

    runner = CliRunner()
    runner.invoke(main, [
        "nx", "security-to-mdx",
        "--input", str(input_file),
        "--timestamp", "ts",
        "--mdx-out", str(mdx_out),
    ])
    content = mdx_out.read_text()
    assert "..." in content
    assert long_title not in content


def test_security_to_mdx_codeql_tab(tmp_path):
    security_data = {
        "codeql": [{
            "rule": {"id": "js/xss", "security_severity_level": "high"},
            "most_recent_instance": {
                "location": {"path": "src/app.js"},
            },
            "html_url": "https://github.com/example",
        }],
    }
    input_file = tmp_path / "security.json"
    input_file.write_text(json.dumps(security_data))
    mdx_out = tmp_path / "report.mdx"

    runner = CliRunner()
    runner.invoke(main, [
        "nx", "security-to-mdx",
        "--input", str(input_file),
        "--timestamp", "ts",
        "--mdx-out", str(mdx_out),
    ])
    content = mdx_out.read_text()
    assert "js/xss" in content
    assert "src/app.js" in content


def test_security_to_mdx_dependabot_tab(tmp_path):
    security_data = {
        "dependabot": [{
            "security_vulnerability": {
                "severity": "high",
                "package": {"name": "axios", "ecosystem": "npm"},
            },
            "security_advisory": {"summary": "SSRF in axios"},
            "html_url": "https://github.com/example",
        }],
    }
    input_file = tmp_path / "security.json"
    input_file.write_text(json.dumps(security_data))
    mdx_out = tmp_path / "report.mdx"

    runner = CliRunner()
    runner.invoke(main, [
        "nx", "security-to-mdx",
        "--input", str(input_file),
        "--timestamp", "ts",
        "--mdx-out", str(mdx_out),
    ])
    content = mdx_out.read_text()
    assert "axios" in content
    assert "SSRF" in content
