"""Tests for the ``professiondb`` route (hard-fail propagation, drift report)."""

from __future__ import annotations

import pytest

from kbve.nx.builder import BuildContext
from kbve.nx.router import get, select
from kbve.nx.routes import professiondb as mod


def _ctx(tmp_path):
    content_root = tmp_path / "apps/kbve/astro-kbve/src/content/docs"
    public_dir = tmp_path / "apps/kbve/astro-kbve/public/data/nx"
    content_root.mkdir(parents=True)
    (tmp_path / "nx.json").write_text("{}")
    return BuildContext(
        content_root=content_root,
        public_dir=public_dir,
        timestamp="2026-07-19T00:00:00Z",
        inputs={},
    )


def test_professiondb_registered_weekly():
    assert any(r.name == "professiondb" for r in select("weekly"))
    assert get("professiondb").cadence == "weekly"


def test_professiondb_plan_needs_work(tmp_path):
    assert get("professiondb").plan(_ctx(tmp_path)).needs_work is True


def test_professiondb_build_propagates_validator_failure(monkeypatch, tmp_path):
    def boom(cmd, cwd, timeout=mod._GEN_TIMEOUT):
        raise mod.ProfessiondbValidationError("xref FAIL")

    monkeypatch.setattr(mod, "_run", boom)
    with pytest.raises(mod.ProfessiondbValidationError):
        get("professiondb").build(_ctx(tmp_path))


def test_professiondb_build_success_reports_drift(monkeypatch, tmp_path):
    monkeypatch.setattr(mod, "_run", lambda *a, **k: "ok")
    monkeypatch.setattr(mod, "_changed", lambda root: ["x.json"])
    res = get("professiondb").build(_ctx(tmp_path))
    assert res.skipped is False
    assert res.changed == ["x.json"]
