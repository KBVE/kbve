"""Tests for kbve.nx.alerts and the kbve-nx-alerts CLI."""

import json

from kbve.nx.alerts import ENDPOINTS, next_link, validate
from kbve.nx.cli import alerts_main


# ── next_link ────────────────────────────────────────────────────────

def test_next_link_present():
    header = (
        '<https://api.github.com/x?page=2>; rel="next", '
        '<https://api.github.com/x?page=9>; rel="last"'
    )
    assert next_link(header) == "https://api.github.com/x?page=2"


def test_next_link_absent():
    header = '<https://api.github.com/x?page=9>; rel="last"'
    assert next_link(header) is None
    assert next_link("") is None


# ── validate ─────────────────────────────────────────────────────────

def test_validate_keeps_only_open_dicts():
    alerts = [
        {"state": "open", "number": 1},
        {"state": "fixed", "number": 2},
        {"state": "dismissed", "number": 3},
        "not-a-dict",
        {"number": 4},
    ]
    clean = validate(alerts)
    assert clean == [{"state": "open", "number": 1}]


# ── endpoints ────────────────────────────────────────────────────────

def test_endpoints_shape():
    assert set(ENDPOINTS) == {"code-scanning", "dependabot"}
    assert ENDPOINTS["dependabot"].endswith("/dependabot/alerts")


# ── CLI ──────────────────────────────────────────────────────────────

def test_alerts_main_missing_token_writes_empty(tmp_path, monkeypatch):
    monkeypatch.delenv("GITHUB_TOKEN", raising=False)
    out = tmp_path / "alerts.json"
    rc = alerts_main([
        "--endpoint", "dependabot", "--out", str(out)])
    assert rc == 2
    assert json.loads(out.read_text()) == []


def test_alerts_main_success(tmp_path, monkeypatch):
    monkeypatch.setenv("GITHUB_TOKEN", "x")
    monkeypatch.setattr(
        "kbve.nx.cli.fetch_all",
        lambda *a, **k: [
            {"state": "open", "number": 1},
            {"state": "fixed", "number": 2},
        ],
    )
    out = tmp_path / "alerts.json"
    rc = alerts_main([
        "--endpoint", "code-scanning", "--out", str(out)])
    assert rc == 0
    assert json.loads(out.read_text()) == [{"state": "open", "number": 1}]
