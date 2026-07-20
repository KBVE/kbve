"""Tests for the ``releases`` route (registry fetch bypassed via inputs)."""

from __future__ import annotations

import json

from kbve.nx.builder import BuildContext
from kbve.nx.releases import aggregate, classify, resolve
from kbve.nx.router import get


def _ctx(tmp_path, inputs):
    content_root = tmp_path / "apps/kbve/astro-kbve/src/content/docs"
    public_dir = tmp_path / "apps/kbve/astro-kbve/public/data/nx"
    content_root.mkdir(parents=True)
    (tmp_path / "nx.json").write_text("{}")
    return BuildContext(
        content_root=content_root, public_dir=public_dir,
        timestamp="2026-07-19T00:00:00Z", inputs=inputs,
    )


def test_releases_needs_empty():
    assert get("releases").needs == ()


def test_classify_buckets():
    assert classify("1.2.0", "1.1.0") == "pending"
    assert classify("1.1.0", "1.1.0") == "published"
    assert classify("1.0.0", "1.2.0") == "behind"
    assert classify("1.0.0", None) == "unpublished"
    assert classify("0.0.0", None) == "skipped"


def test_resolve_uses_injected_fetch():
    manifest = {
        "crates": [{"crate_name": "kbve", "version": "1.2.0"}],
        "npm": [{"package_name": "droid", "version": "0.1.1"}],
        "python": [{"package_name": "kbve", "version": "0.0.0"}],
    }
    latest = {("crates", "kbve"): "1.1.0", ("npm", "droid"): "0.1.1"}
    rows = resolve(manifest, fetch=lambda e, n, t: latest.get((e, n)))
    by = {(r["ecosystem"], r["name"]): r["status"] for r in rows}
    assert by[("crates", "kbve")] == "pending"
    assert by[("npm", "droid")] == "published"
    assert by[("python", "kbve")] == "skipped"


def test_aggregate_summary():
    rows = [
        {"ecosystem": "crates", "name": "a", "local": "2.0", "published":
         "1.0", "status": "pending"},
        {"ecosystem": "npm", "name": "b", "local": "1.0", "published": "1.0",
         "status": "published"},
    ]
    agg = aggregate(rows)
    assert agg["total"] == 2
    assert agg["summary"]["pending"] == 1
    assert agg["ecosystems"]["crates"]["pending"] == 1


def test_releases_build_writes(tmp_path):
    # resolve() will hit the network for the real fetch; instead inject rows
    rows = [{"ecosystem": "crates", "name": "kbve", "local": "0.0.1",
             "published": "0.0.1", "status": "published"}]
    ctx = _ctx(tmp_path, {"release_rows": rows})
    result = get("releases").build(ctx)
    assert result.skipped is False and len(result.changed) == 2

    data = json.loads((ctx.public_dir / "nx-releases.json").read_text())
    assert data["total"] == 1

    mdx = (ctx.content_root / "dashboard" / "releases.mdx").read_text()
    assert "template: splash" in mdx and "CardGrid" not in mdx
    assert mdx.count("<BentoProse") == mdx.count("</BentoProse>")
