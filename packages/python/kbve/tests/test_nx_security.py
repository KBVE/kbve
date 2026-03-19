"""Tests for kbve.nx.security module."""

from kbve.nx.security import (
    SEVERITY_ORDER,
    build_summary,
    normalize_severity,
    parse_all_ecosystems,
    parse_cargo,
    parse_codeql,
    parse_dependabot,
    parse_npm,
    parse_python,
)


# ── normalize_severity ───────────────────────────────────────────────

def test_normalize_severity():
    assert normalize_severity("critical") == "critical"
    assert normalize_severity("CRITICAL") == "critical"
    assert normalize_severity("moderate") == "medium"
    assert normalize_severity("warning") == "medium"
    assert normalize_severity("error") == "high"
    assert normalize_severity("informational") == "info"
    assert normalize_severity("note") == "low"
    assert normalize_severity("") == "medium"
    assert normalize_severity("unknown-value") == "medium"


# ── parse_npm ────────────────────────────────────────────────────────

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
    assert result["advisories"][0]["id"] == "1234"
    assert result["advisories"][0]["title"] == "Prototype Pollution"


def test_parse_npm_classic_multiple():
    raw = {
        "advisories": {
            "1": {
                "severity": "low",
                "title": "A",
                "module_name": "a",
                "url": "",
            },
            "2": {
                "severity": "critical",
                "title": "B",
                "module_name": "b",
                "url": "",
            },
        },
    }
    result = parse_npm(raw)
    assert result["total"] == 2
    assert result["severities"]["low"] == 1
    assert result["severities"]["critical"] == 1


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
                    "body-parser",
                ],
            },
        },
    }
    result = parse_npm(raw)
    assert result["total"] == 1
    assert result["severities"]["medium"] == 1
    assert result["advisories"][0]["package"] == "express"


def test_parse_npm_v10_empty_via():
    raw = {"vulnerabilities": {"pkg": {"via": []}}}
    result = parse_npm(raw)
    assert result["total"] == 0


def test_parse_npm_empty():
    assert parse_npm({})["total"] == 0
    assert parse_npm(None)["total"] == 0


def test_parse_npm_non_dict():
    assert parse_npm("string")["total"] == 0
    assert parse_npm(42)["total"] == 0


def test_parse_npm_advisories_not_dict():
    raw = {"advisories": []}
    result = parse_npm(raw)
    assert result["total"] == 0


# ── parse_cargo ──────────────────────────────────────────────────────

def test_parse_cargo_critical():
    raw = {
        "vulnerabilities": {
            "list": [{
                "advisory": {
                    "id": "RUSTSEC-2024-001",
                    "title": "Memory safety",
                    "cvss": "9.8",
                    "url": "https://rustsec.org/1",
                },
                "package": {"name": "some-crate"},
            }],
        },
    }
    result = parse_cargo(raw)
    assert result["total"] == 1
    assert result["severities"]["critical"] == 1


def test_parse_cargo_high_cvss():
    raw = {
        "vulnerabilities": {
            "list": [{
                "advisory": {"id": "X", "title": "X", "cvss": "7.5"},
                "package": {"name": "pkg"},
            }],
        },
    }
    result = parse_cargo(raw)
    assert result["severities"]["high"] == 1


def test_parse_cargo_medium_cvss():
    raw = {
        "vulnerabilities": {
            "list": [{
                "advisory": {"id": "X", "title": "X", "cvss": "5.0"},
                "package": {"name": "pkg"},
            }],
        },
    }
    result = parse_cargo(raw)
    assert result["severities"]["medium"] == 1


def test_parse_cargo_low_cvss():
    raw = {
        "vulnerabilities": {
            "list": [{
                "advisory": {"id": "X", "title": "X", "cvss": "3.0"},
                "package": {"name": "pkg"},
            }],
        },
    }
    result = parse_cargo(raw)
    assert result["severities"]["medium"] == 1  # <4.0 still medium


def test_parse_cargo_cvss_boundary_values():
    def make_entry(cvss):
        return {
            "vulnerabilities": {
                "list": [{
                    "advisory": {"id": "X", "title": "X", "cvss": cvss},
                    "package": {"name": "pkg"},
                }],
            },
        }

    assert parse_cargo(make_entry("9.0"))["severities"]["critical"] == 1
    assert parse_cargo(make_entry("7.0"))["severities"]["high"] == 1
    assert parse_cargo(make_entry("4.0"))["severities"]["medium"] == 1
    assert parse_cargo(make_entry("3.9"))["severities"]["medium"] == 1


def test_parse_cargo_cvss_non_numeric():
    raw = {
        "vulnerabilities": {
            "list": [{
                "advisory": {
                    "id": "X", "title": "X",
                    "cvss": "CVSS:3.1/AV:N/AC:L",
                },
                "package": {"name": "pkg"},
            }],
        },
    }
    result = parse_cargo(raw)
    assert result["severities"]["medium"] == 1


def test_parse_cargo_informational():
    raw = {
        "vulnerabilities": {
            "list": [{
                "advisory": {
                    "id": "X", "title": "X",
                    "informational": "unsound",
                    "cvss": "9.0",
                },
                "package": {"name": "pkg"},
            }],
        },
    }
    result = parse_cargo(raw)
    assert result["severities"]["info"] == 1  # informational wins


def test_parse_cargo_no_cvss():
    raw = {
        "vulnerabilities": {
            "list": [{
                "advisory": {"id": "X", "title": "X"},
                "package": {"name": "pkg"},
            }],
        },
    }
    result = parse_cargo(raw)
    assert result["severities"]["medium"] == 1


def test_parse_cargo_warnings():
    raw = {
        "vulnerabilities": {"list": []},
        "warnings": {
            "yanked": [{
                "advisory": {"id": "Y", "title": "Yanked"},
                "package": {"name": "old"},
            }],
            "unmaintained": [{
                "advisory": {"id": "Z", "title": "Unmaintained"},
                "package": {"name": "stale"},
            }],
        },
    }
    result = parse_cargo(raw)
    assert result["total"] == 2
    assert result["severities"]["info"] == 2


def test_parse_cargo_warnings_non_list():
    raw = {
        "vulnerabilities": {"list": []},
        "warnings": {"other": "not a list"},
    }
    result = parse_cargo(raw)
    assert result["total"] == 0


def test_parse_cargo_empty():
    assert parse_cargo({})["total"] == 0
    assert parse_cargo(None)["total"] == 0


# ── parse_python ─────────────────────────────────────────────────────

def test_parse_python_list_format():
    raw = [{
        "name": "requests",
        "version": "2.25.0",
        "vulns": [
            {"id": "PYSEC-2024-001", "description": "SSRF vulnerability"},
        ],
    }]
    result = parse_python(raw)
    assert result["total"] == 1
    assert result["advisories"][0]["package"] == "requests"
    assert "osv.dev" in result["advisories"][0]["url"]


def test_parse_python_dict_format():
    raw = {
        "dependencies": [{
            "name": "django",
            "vulns": [{"id": "PYSEC-2024-002", "description": "XSS"}],
        }],
    }
    result = parse_python(raw)
    assert result["total"] == 1
    assert result["advisories"][0]["package"] == "django"


def test_parse_python_no_vulns():
    raw = [{"name": "safe-pkg", "vulns": []}]
    result = parse_python(raw)
    assert result["total"] == 0


def test_parse_python_missing_id():
    raw = [{"name": "pkg", "vulns": [{"description": "issue"}]}]
    result = parse_python(raw)
    assert result["total"] == 1
    assert result["advisories"][0]["id"] == ""
    assert result["advisories"][0]["url"] == ""


def test_parse_python_empty():
    assert parse_python(None)["total"] == 0
    assert parse_python([])["total"] == 0


def test_parse_python_multiple_vulns_per_dep():
    raw = [{
        "name": "pkg",
        "vulns": [
            {"id": "A", "description": "first"},
            {"id": "B", "description": "second"},
        ],
    }]
    result = parse_python(raw)
    assert result["total"] == 2
    assert result["severities"]["medium"] == 2


# ── parse_codeql ─────────────────────────────────────────────────────

def test_parse_codeql():
    raw = [{
        "rule": {
            "id": "js/sql-injection",
            "description": "SQL Injection",
            "security_severity_level": "high",
        },
        "most_recent_instance": {
            "location": {"path": "src/db.js"},
        },
        "html_url": "https://github.com/example/1",
    }]
    result = parse_codeql(raw)
    assert result["total"] == 1
    assert result["alerts"][0]["rule_id"] == "js/sql-injection"
    assert result["severities"]["high"] == 1


def test_parse_codeql_severity_fallback():
    raw = [{
        "rule": {"id": "test", "severity": "warning"},
        "most_recent_instance": {"location": {"path": "x.js"}},
        "html_url": "",
    }]
    result = parse_codeql(raw)
    assert result["severities"]["medium"] == 1


def test_parse_codeql_missing_fields():
    raw = [{"rule": {}, "html_url": ""}]
    result = parse_codeql(raw)
    assert result["total"] == 1
    assert result["alerts"][0]["rule_id"] == ""
    assert result["alerts"][0]["path"] == ""


def test_parse_codeql_empty():
    assert parse_codeql(None)["total"] == 0
    assert parse_codeql([])["total"] == 0
    assert parse_codeql({})["total"] == 0


# ── parse_dependabot ─────────────────────────────────────────────────

def test_parse_dependabot():
    raw = [{
        "security_vulnerability": {
            "severity": "critical",
            "package": {"name": "axios", "ecosystem": "npm"},
        },
        "security_advisory": {"summary": "SSRF in axios"},
        "html_url": "https://github.com/example/2",
    }]
    result = parse_dependabot(raw)
    assert result["total"] == 1
    assert result["alerts"][0]["package"] == "axios"
    assert result["alerts"][0]["ecosystem"] == "npm"
    assert result["severities"]["critical"] == 1


def test_parse_dependabot_missing_fields():
    raw = [{"html_url": ""}]
    result = parse_dependabot(raw)
    assert result["total"] == 1
    assert result["alerts"][0]["package"] == ""
    assert result["alerts"][0]["summary"] == ""


def test_parse_dependabot_empty():
    assert parse_dependabot(None)["total"] == 0
    assert parse_dependabot([])["total"] == 0
    assert parse_dependabot({})["total"] == 0


def test_parse_dependabot_multiple():
    raw = [
        {
            "security_vulnerability": {
                "severity": "high",
                "package": {"name": "a", "ecosystem": "npm"},
            },
            "security_advisory": {"summary": "x"},
            "html_url": "",
        },
        {
            "security_vulnerability": {
                "severity": "low",
                "package": {"name": "b", "ecosystem": "pip"},
            },
            "security_advisory": {"summary": "y"},
            "html_url": "",
        },
    ]
    result = parse_dependabot(raw)
    assert result["total"] == 2
    assert result["severities"]["high"] == 1
    assert result["severities"]["low"] == 1


# ── build_summary ────────────────────────────────────────────────────

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


def test_build_summary_empty():
    summary = build_summary({})
    assert all(v == 0 for v in summary.values())


def test_build_summary_missing_severities_key():
    ecosystems = {"npm": {}}
    summary = build_summary(ecosystems)
    assert all(v == 0 for v in summary.values())


# ── parse_all_ecosystems ─────────────────────────────────────────────

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


def test_parse_all_ecosystems_empty():
    result = parse_all_ecosystems({})
    assert all(v == 0 for v in result["summary"].values())
    for eco in result["ecosystems"].values():
        assert eco["total"] == 0


def test_parse_all_ecosystems_all_present():
    raw = {
        "npm": {},
        "cargo": {},
        "python": [],
        "codeql": [],
        "dependabot": [],
    }
    result = parse_all_ecosystems(raw)
    assert len(result["ecosystems"]) == 5


def test_severity_order_completeness():
    assert set(SEVERITY_ORDER) == {
        "critical", "high", "medium", "low", "info",
    }
