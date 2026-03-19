"""Tests for kbve.utils module."""

import json

from kbve.utils.json_utils import load_json, merge_dicts, write_json
from kbve.utils.module_info import (
    ModuleInfo,
    get_module_info,
    list_modules,
)


# ── load_json ────────────────────────────────────────────────────────

def test_load_json(tmp_path):
    path = tmp_path / "data.json"
    path.write_text('{"key": "value"}')
    result = load_json(path)
    assert result == {"key": "value"}


def test_load_json_string_path(tmp_path):
    path = tmp_path / "data.json"
    path.write_text("[1, 2, 3]")
    result = load_json(str(path))
    assert result == [1, 2, 3]


def test_load_json_file_not_found():
    import pytest
    with pytest.raises(FileNotFoundError):
        load_json("/nonexistent/file.json")


def test_load_json_malformed(tmp_path):
    path = tmp_path / "bad.json"
    path.write_text("{invalid json")
    import pytest
    with pytest.raises(json.JSONDecodeError):
        load_json(path)


# ── write_json ───────────────────────────────────────────────────────

def test_write_json(tmp_path):
    path = tmp_path / "out.json"
    write_json({"a": 1}, path)
    result = json.loads(path.read_text())
    assert result == {"a": 1}


def test_write_json_indent(tmp_path):
    path = tmp_path / "out.json"
    write_json({"a": 1}, path, indent=4)
    text = path.read_text()
    assert "    " in text


def test_write_json_overwrites(tmp_path):
    path = tmp_path / "out.json"
    path.write_text("old")
    write_json({"new": True}, path)
    assert "old" not in path.read_text()
    assert json.loads(path.read_text()) == {"new": True}


def test_write_json_list(tmp_path):
    path = tmp_path / "out.json"
    write_json([1, 2, 3], path)
    assert json.loads(path.read_text()) == [1, 2, 3]


# ── merge_dicts ──────────────────────────────────────────────────────

def test_merge_dicts_flat():
    result = merge_dicts({"a": 1}, {"b": 2})
    assert result == {"a": 1, "b": 2}


def test_merge_dicts_override():
    result = merge_dicts({"a": 1}, {"a": 2})
    assert result == {"a": 2}


def test_merge_dicts_deep():
    base = {"nested": {"a": 1, "b": 2}}
    override = {"nested": {"b": 3, "c": 4}}
    result = merge_dicts(base, override)
    assert result == {"nested": {"a": 1, "b": 3, "c": 4}}


def test_merge_dicts_deep_preserves_originals():
    base = {"nested": {"a": 1}}
    override = {"nested": {"b": 2}}
    merge_dicts(base, override)
    assert base == {"nested": {"a": 1}}  # not mutated


def test_merge_dicts_shallow():
    base = {"nested": {"a": 1, "b": 2}}
    override = {"nested": {"c": 3}}
    result = merge_dicts(base, override, deep=False)
    assert result == {"nested": {"c": 3}}  # replaced, not merged


def test_merge_dicts_empty():
    assert merge_dicts({}, {"a": 1}) == {"a": 1}
    assert merge_dicts({"a": 1}, {}) == {"a": 1}
    assert merge_dicts({}, {}) == {}


def test_merge_dicts_nested_multi_level():
    base = {"a": {"b": {"c": 1}}}
    override = {"a": {"b": {"d": 2}}}
    result = merge_dicts(base, override)
    assert result == {"a": {"b": {"c": 1, "d": 2}}}


def test_merge_dicts_non_dict_override():
    base = {"a": {"nested": True}}
    override = {"a": "flat now"}
    result = merge_dicts(base, override)
    assert result == {"a": "flat now"}


# ── module_info ──────────────────────────────────────────────────────

def test_list_modules():
    modules = list_modules()
    assert len(modules) > 0
    assert all(isinstance(m, ModuleInfo) for m in modules)
    names = [m.name for m in modules]
    assert "kbve.server" in names
    assert "kbve.nx.graph" in names
    assert "kbve.mdx" in names
    assert "kbve.utils" in names


def test_list_modules_availability():
    modules = list_modules()
    core_modules = [m for m in modules if m.name == "kbve.server"]
    assert core_modules[0].available is True


def test_get_module_info_known():
    info = get_module_info("kbve.nx.graph")
    assert info is not None
    assert info.name == "kbve.nx.graph"
    assert info.available is True
    assert "graph" in info.description.lower()


def test_get_module_info_unknown():
    info = get_module_info("kbve.nonexistent")
    assert info is None


def test_module_info_descriptions():
    modules = list_modules()
    for m in modules:
        assert m.description, f"{m.name} has empty description"
