"""Tests for the router matrix ``needs`` tags and explicit route selection."""

from __future__ import annotations

import json

from kbve.nx.cli import router_main


def _matrix(capsys, argv):
    rc = router_main(argv)
    assert rc == 0
    out = capsys.readouterr().out.strip().splitlines()[-1]
    return json.loads(out)


def test_explicit_route_bypasses_cadence(capsys):
    matrix = _matrix(capsys, ["--route", "security"])
    routes = [e["route"] for e in matrix["include"]]
    assert routes == ["security"]
    entry = matrix["include"][0]
    assert entry["needs"] == "node,rust,python,token"


def test_explicit_multiple_routes(capsys):
    matrix = _matrix(capsys, ["--route", "security", "--route", "graph"])
    by_route = {e["route"]: e["needs"] for e in matrix["include"]}
    assert by_route == {
        "security": "node,rust,python,token",
        "graph": "node",
    }


def test_daily_cadence_includes_generated_routes(capsys):
    # security and graph always regenerate (plan needs_work=True); journal's
    # inclusion is date-dependent, so only assert the always-on routes here.
    matrix = _matrix(capsys, ["--cadence", "daily"])
    routes = [e["route"] for e in matrix["include"]]
    assert "security" in routes
    assert "graph" in routes


def test_matrix_entries_include_needs_key(capsys):
    matrix = _matrix(capsys, ["--route", "graph"])
    for entry in matrix["include"]:
        assert "needs" in entry
