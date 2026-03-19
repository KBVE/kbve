"""Tests for kbve.nx.security module."""

from kbve.nx.security import (
    build_summary,
    normalize_severity,
    parse_all_ecosystems,
    parse_cargo,
    parse_codeql,
    parse_dependabot,
    parse_npm,
    parse_python,
)


def test_normalize_severity():
    assert normalize_severity("critical") == "critical"
    assert normalize_severity("CRITICAL") == "critical"
    assert normalize_severity("moderate") == "medium"
    assert normalize_severity("warning") == "medium"
    assert normalize_severity("error") == "high"
    assert normalize_severity("informational") == "info"
    assert normalize_severity("") == "medium"
    assert normalize_severity("unknown-value") == "medium"


def test_parse_npm_classic():
    raw = {
        "advisories": {
            "1234": {
                "severity": "high",
                "title": "Prototype Pollution",
                "module_name": "lodash",
                "url": "https://npmjs.com/advisories/1234",
            },
        },
    }
    result = parse_npm(raw)
    assert result["total"] == 1
    assert result["severities"]["high"] == 1
    assert result["advisories"][0]["package"] == "lodash"


def test_parse_npm_v10():
    raw = {
        "vulnerabilities": {
            "express": {
                "via": [
                    {
                        "source": "5678",
                        "title": "Open Redirect",
                        "severity": "moderate",
                        "url": "https://example.com",
                    },
                    "body-parser",  # string via entries should be skipped
                ],
            },
        },
    }
    result = parse_npm(raw)
    assert result["total"] == 1
    assert result["severities"]["medium"] == 1


def test_parse_npm_empty():
    assert parse_npm({})["total"] == 0
    assert parse_npm(None)["total"] == 0


def test_parse_cargo():
    raw = {
        "vulnerabilities": {
            "list": [
                {
                    "advisory": {
                        "id": "RUSTSEC-2024-001",
                        "title": "Memory safety issue",
                        "cvss": "9.8",
                        "url": "https://rustsec.org/RUSTSEC-2024-001",
                    },
                    "package": {"name": "some-crate"},
                },
            ],
        },
        "warnings": {
            "yanked": [
                {
                    "advisory": {
                        "id": "RUSTSEC-2024-002",
                        "title": "Yanked crate",
                    },
                    "package": {"name": "old-crate"},
                },
            ],
        },
    }
    result = parse_cargo(raw)
    assert result["total"] == 2
    assert result["severities"]["critical"] == 1
    assert result["severities"]["info"] == 1


def test_parse_python():
    raw = [
        {
            "name": "requests",
            "version": "2.25.0",
            "vulns": [
                {"id": "PYSEC-2024-001", "description": "SSRF vulnerability"},
            ],
        },
    ]
    result = parse_python(raw)
    assert result["total"] == 1
    assert result["advisories"][0]["package"] == "requests"
    assert "osv.dev" in result["advisories"][0]["url"]


def test_parse_python_empty():
    assert parse_python(None)["total"] == 0
    assert parse_python([])["total"] == 0


def test_parse_codeql():
    raw = [
        {
            "rule": {
                "id": "js/sql-injection",
                "description": "SQL Injection",
                "security_severity_level": "high",
            },
            "most_recent_instance": {
                "location": {"path": "src/db.js"},
            },
            "html_url": "https://github.com/example/1",
        },
    ]
    result = parse_codeql(raw)
    assert result["total"] == 1
    assert result["alerts"][0]["rule_id"] == "js/sql-injection"
    assert result["severities"]["high"] == 1


def test_parse_dependabot():
    raw = [
        {
            "security_vulnerability": {
                "severity": "critical",
                "package": {"name": "axios", "ecosystem": "npm"},
            },
            "security_advisory": {"summary": "SSRF in axios"},
            "html_url": "https://github.com/example/2",
        },
    ]
    result = parse_dependabot(raw)
    assert result["total"] == 1
    assert result["alerts"][0]["package"] == "axios"
    assert result["severities"]["critical"] == 1


def test_build_summary():
    ecosystems = {
        "npm": {"severities": {
            "critical": 1, "high": 0, "medium": 2,
            "low": 0, "info": 0,
        }},
        "cargo": {"severities": {
            "critical": 0, "high": 1, "medium": 0,
            "low": 0, "info": 1,
        }},
    }
    summary = build_summary(ecosystems)
    assert summary["critical"] == 1
    assert summary["high"] == 1
    assert summary["medium"] == 2
    assert summary["info"] == 1


def test_parse_all_ecosystems():
    raw = {
        "npm": {
            "advisories": {
                "1": {
                    "severity": "low",
                    "title": "test",
                    "module_name": "pkg",
                    "url": "",
                },
            },
        },
    }
    result = parse_all_ecosystems(raw)
    assert "ecosystems" in result
    assert "summary" in result
    assert result["summary"]["low"] == 1
    assert result["ecosystems"]["npm"]["total"] == 1
