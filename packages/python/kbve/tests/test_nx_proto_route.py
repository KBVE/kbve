"""Tests for the ``proto`` route (codegen subprocess bypassed via inputs)."""

from __future__ import annotations

import json

from kbve.nx.builder import BuildContext
from kbve.nx.router import get


def _ctx(tmp_path, inputs):
    content_root = tmp_path / "apps/kbve/astro-kbve/src/content/docs"
    public_dir = tmp_path / "apps/kbve/astro-kbve/public/data/nx"
    content_root.mkdir(parents=True)
    # mark repo root so repo_root_for resolves cleanly
    (tmp_path / "nx.json").write_text("{}")
    return BuildContext(
        content_root=content_root,
        public_dir=public_dir,
        timestamp="2026-07-19T00:00:00Z",
        inputs=inputs,
    )


def test_proto_needs_tags():
    assert get("proto").needs == ("node", "protoc")


def test_proto_plan_needs_work(tmp_path):
    assert get("proto").plan(_ctx(tmp_path, {})).needs_work is True


def test_proto_build_merges_drift_metadata(tmp_path):
    ctx = _ctx(
        tmp_path,
        {
            "proto_registry": {"schemas": [{"name": "kbve"}], "count": 1},
            "proto_drift": {"detected": True, "files": ["a.ts", "b.ts"]},
        },
    )
    result = get("proto").build(ctx)
    assert result.skipped is False

    out = ctx.public_dir / "nx-proto.json"
    assert out.exists()
    data = json.loads(out.read_text())
    assert data["count"] == 1
    assert data["checked_at"] == "2026-07-19T00:00:00Z"
    assert data["drift_detected"] is True
    assert data["drift_files"] == ["a.ts", "b.ts"]


def test_proto_build_defaults_no_drift(tmp_path):
    ctx = _ctx(tmp_path, {"proto_registry": {"schemas": []}})
    get("proto").build(ctx)
    data = json.loads((ctx.public_dir / "nx-proto.json").read_text())
    assert data["drift_detected"] is False
    assert data["drift_files"] == []
