"""Tests for the ``security`` route (acquisition bypassed via ``inputs``)."""

from __future__ import annotations

import json

from kbve.nx.builder import BuildContext
from kbve.nx.router import get


def _raw_fixture() -> dict:
    return {
        "npm": {
            "advisories": {
                "1179": {
                    "severity": "high",
                    "title": "Prototype Pollution",
                    "module_name": "lodash",
                    "url": "https://example.com/npm/1179",
                }
            }
        },
        "cargo": {
            "vulnerabilities": {
                "found": 1,
                "list": [
                    {
                        "advisory": {
                            "id": "RUSTSEC-2021-0001",
                            "title": "Memory corruption",
                            "url": "https://example.com/cargo",
                        },
                        "package": {"name": "openssl"},
                    }
                ],
            },
            "warnings": {},
        },
        "python": [
            {
                "name": "requests",
                "vulns": [
                    {"id": "GHSA-xxxx", "description": "Header injection"}
                ],
            }
        ],
        "codeql": [
            {
                "state": "open",
                "rule": {
                    "id": "py/sql-injection",
                    "security_severity_level": "high",
                    "description": "SQL injection",
                },
                "most_recent_instance": {
                    "location": {"path": "app/db.py"}
                },
                "html_url": "https://example.com/codeql",
            }
        ],
        "dependabot": [
            {
                "state": "open",
                "security_vulnerability": {
                    "severity": "critical",
                    "package": {"name": "django", "ecosystem": "pip"},
                },
                "security_advisory": {"summary": "RCE in django"},
                "html_url": "https://example.com/dependabot",
            }
        ],
    }


def _ctx(tmp_path):
    content_root = tmp_path / "content" / "docs"
    public_dir = tmp_path / "public" / "data" / "nx"
    content_root.mkdir(parents=True)
    return BuildContext(
        content_root=content_root,
        public_dir=public_dir,
        timestamp="2026-07-18T00:00:00Z",
        inputs={"raw": _raw_fixture()},
    )


def test_security_needs_tags():
    assert get("security").needs == ("node", "rust", "python", "token")


def test_security_plan_needs_work(tmp_path):
    plan = get("security").plan(_ctx(tmp_path))
    assert plan.needs_work is True


def test_security_build_writes_mdx_and_json(tmp_path):
    ctx = _ctx(tmp_path)
    result = get("security").build(ctx)

    assert result.skipped is False
    assert result.route == "security"

    mdx = ctx.content_root / "dashboard" / "security.mdx"
    js = ctx.public_dir / "nx-security.json"
    assert mdx.exists()
    assert js.exists()

    text = mdx.read_text()
    assert text.startswith("---\n")
    assert "title: Security Audit Report" in text
    assert 'heading="Ecosystem breakdown"' in text

    payload = json.loads(js.read_text())
    assert "summary" in payload
    assert "ecosystems" in payload
    assert set(payload["ecosystems"]) == {
        "npm", "cargo", "python", "codeql", "dependabot"
    }
    assert payload["summary"]["critical"] == 1
    assert payload["summary"]["high"] == 2


def test_security_build_accepts_security_raw_key(tmp_path):
    ctx = _ctx(tmp_path)
    ctx.inputs = {"security_raw": _raw_fixture()}
    result = get("security").build(ctx)
    assert (ctx.content_root / "dashboard" / "security.mdx").exists()
    assert result.skipped is False
