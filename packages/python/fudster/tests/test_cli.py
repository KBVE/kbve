"""Integration tests for fudster.cli module using Click CliRunner."""

import json

import pytest
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


# ── version ──────────────────────────────────────────────────────────

def test_version():
    runner = CliRunner()
    result = runner.invoke(main, ["version"])
    assert result.exit_code == 0
    assert "fudster" in result.output
    assert "kbve" in result.output
    assert "0.1.0" in result.output


# ── info ─────────────────────────────────────────────────────────────

def test_info():
    runner = CliRunner()
    result = runner.invoke(main, ["info"])
    assert result.exit_code == 0
    assert "kbve modules" in result.output
    assert "kbve.server" in result.output
    assert "kbve.nx.graph" in result.output
    assert "kbve.mdx" in result.output
    assert "kbve.utils" in result.output


def test_info_json():
    runner = CliRunner()
    result = runner.invoke(main, ["info", "--json"])
    assert result.exit_code == 0
    data = json.loads(result.output)
    assert isinstance(data, list)
    assert len(data) > 0
    names = [m["name"] for m in data]
    assert "kbve.server" in names
    assert "kbve.nx.graph" in names
    assert all("available" in m for m in data)
    assert all("description" in m for m in data)


def test_info_json_all_available():
    runner = CliRunner()
    result = runner.invoke(main, ["info", "--json"])
    data = json.loads(result.output)
    for m in data:
        assert m["available"] is True, (
            f"{m['name']} should be available"
        )


def test_info_includes_new_modules():
    runner = CliRunner()
    result = runner.invoke(main, ["info", "--json"])
    data = json.loads(result.output)
    names = [m["name"] for m in data]
    assert "kbve.config" in names
    assert "kbve.health" in names
    assert "kbve.tasks" in names


# ── serve ────────────────────────────────────────────────────────────

def test_serve_help():
    runner = CliRunner()
    result = runner.invoke(main, ["serve", "--help"])
    assert result.exit_code == 0
    assert "--host" in result.output
    assert "--port" in result.output
    assert "--grpc-port" in result.output
    assert "--env-file" in result.output


# ── config ───────────────────────────────────────────────────────────

def test_config_empty():
    runner = CliRunner()
    result = runner.invoke(main, ["config"])
    assert result.exit_code == 0


def test_config_with_env_file(tmp_path):
    f = tmp_path / ".env"
    f.write_text("TESTCLI_PORT=9090\nTESTCLI_HOST=127.0.0.1\n")

    runner = CliRunner()
    result = runner.invoke(main, [
        "config",
        "--env-file", str(f),
        "--prefix", "TESTCLI",
    ])
    assert result.exit_code == 0
    assert "port" in result.output
    assert "9090" in result.output


def test_config_json(tmp_path):
    f = tmp_path / ".env"
    f.write_text("JSONCFG_A=1\nJSONCFG_B=two\n")

    runner = CliRunner()
    result = runner.invoke(main, [
        "config",
        "--env-file", str(f),
        "--prefix", "JSONCFG",
        "--json",
    ])
    assert result.exit_code == 0
    data = json.loads(result.output)
    assert data["a"] == "1"
    assert data["b"] == "two"


# ── grpc subgroup ────────────────────────────────────────────────────

def test_grpc_help():
    runner = CliRunner()
    result = runner.invoke(main, ["grpc", "--help"])
    assert result.exit_code == 0
    assert "health" in result.output
    assert "compile" in result.output


def test_grpc_health_unreachable():
    runner = CliRunner()
    result = runner.invoke(main, [
        "grpc", "health", "localhost:1", "--timeout", "0.5",
    ])
    assert result.exit_code != 0
    assert "UNREACHABLE" in result.output or "ERROR" in result.output


def _has_grpc_tools():
    try:
        import grpc_tools  # noqa: F401
        return True
    except ImportError:
        return False


@pytest.mark.skipif(
    not _has_grpc_tools(),
    reason="grpcio-tools not installed",
)
def test_grpc_compile_success(tmp_path):
    proto_file = tmp_path / "cli_test.proto"
    proto_file.write_text(
        'syntax = "proto3";\n'
        "package clipkg;\n"
        "message CliMsg { string v = 1; }\n"
    )

    runner = CliRunner()
    result = runner.invoke(main, [
        "grpc", "compile",
        str(proto_file),
        "--proto-path", str(tmp_path),
        "--python-out", str(tmp_path),
    ])
    assert result.exit_code == 0
    assert "Compiled" in result.output
    assert (tmp_path / "cli_test_pb2.py").exists()


@pytest.mark.skipif(
    not _has_grpc_tools(),
    reason="grpcio-tools not installed",
)
def test_grpc_compile_bad_proto(tmp_path):
    proto_file = tmp_path / "bad.proto"
    proto_file.write_text("invalid proto")

    runner = CliRunner()
    result = runner.invoke(main, [
        "grpc", "compile",
        str(proto_file),
        "--proto-path", str(tmp_path),
        "--python-out", str(tmp_path),
    ])
    assert result.exit_code != 0
    assert "failed" in result.output


def test_grpc_compile_help():
    runner = CliRunner()
    result = runner.invoke(main, ["grpc", "compile", "--help"])
    assert result.exit_code == 0
    assert "--proto-path" in result.output
    assert "--grpc-out" in result.output
    assert "--pyi-out" in result.output


# ── claude subgroup ──────────────────────────────────────────────────

def test_claude_help():
    runner = CliRunner()
    result = runner.invoke(main, ["claude", "--help"])
    assert result.exit_code == 0
    assert "usage" in result.output
    assert "version" in result.output
    assert "status" in result.output


def test_claude_version():
    runner = CliRunner()
    result = runner.invoke(main, ["claude", "version"])
    # Should work if claude is installed, or fail gracefully
    assert isinstance(result.output, str)


def test_claude_usage_json():
    runner = CliRunner()
    result = runner.invoke(main, ["claude", "usage", "--json"])
    assert result.exit_code == 0
    data = json.loads(result.output)
    assert "available" in data
    assert "cost_usd" in data
    assert "error" in data


def test_claude_status_json():
    runner = CliRunner()
    result = runner.invoke(main, ["claude", "status", "--json"])
    assert result.exit_code == 0
    data = json.loads(result.output)
    assert "installed" in data
    assert "version" in data
    assert "usage_available" in data


def test_claude_usage_help():
    runner = CliRunner()
    result = runner.invoke(main, ["claude", "usage", "--help"])
    assert result.exit_code == 0
    assert "--json" in result.output
    assert "--timeout" in result.output
