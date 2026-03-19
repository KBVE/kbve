"""Tests for kbve.config module."""

import os

import pytest

from kbve.config.env_config import (
    EnvConfig,
    apply_env_file,
    get_env,
    load_env_file,
)


# ── load_env_file ────────────────────────────────────────────────────

def test_load_env_file(tmp_path):
    f = tmp_path / ".env"
    f.write_text("KEY=value\nOTHER=123\n")
    result = load_env_file(f)
    assert result == {"KEY": "value", "OTHER": "123"}


def test_load_env_file_comments_and_blanks(tmp_path):
    f = tmp_path / ".env"
    f.write_text("# comment\n\nKEY=val\n  # another\nB=2\n")
    result = load_env_file(f)
    assert result == {"KEY": "val", "B": "2"}


def test_load_env_file_quoted_values(tmp_path):
    f = tmp_path / ".env"
    f.write_text('A="hello world"\nB=\'single\'\n')
    result = load_env_file(f)
    assert result["A"] == "hello world"
    assert result["B"] == "single"


def test_load_env_file_no_equals(tmp_path):
    f = tmp_path / ".env"
    f.write_text("NOEQUALS\nKEY=val\n")
    result = load_env_file(f)
    assert result == {"KEY": "val"}


def test_load_env_file_missing():
    result = load_env_file("/nonexistent/.env")
    assert result == {}


def test_load_env_file_equals_in_value(tmp_path):
    f = tmp_path / ".env"
    f.write_text("URL=postgres://user:pass@host/db?opt=1\n")
    result = load_env_file(f)
    assert result["URL"] == "postgres://user:pass@host/db?opt=1"


# ── apply_env_file ───────────────────────────────────────────────────

def test_apply_env_file(tmp_path, monkeypatch):
    f = tmp_path / ".env"
    f.write_text("TEST_APPLY_VAR=hello\n")
    monkeypatch.delenv("TEST_APPLY_VAR", raising=False)

    count = apply_env_file(f)
    assert count == 1
    assert os.environ["TEST_APPLY_VAR"] == "hello"

    monkeypatch.delenv("TEST_APPLY_VAR")


def test_apply_env_file_no_override(tmp_path, monkeypatch):
    f = tmp_path / ".env"
    f.write_text("TEST_NOOVER=from_file\n")
    monkeypatch.setenv("TEST_NOOVER", "from_env")

    apply_env_file(f, override=False)
    assert os.environ["TEST_NOOVER"] == "from_env"


def test_apply_env_file_override(tmp_path, monkeypatch):
    f = tmp_path / ".env"
    f.write_text("TEST_OVER=from_file\n")
    monkeypatch.setenv("TEST_OVER", "from_env")

    apply_env_file(f, override=True)
    assert os.environ["TEST_OVER"] == "from_file"


# ── get_env ──────────────────────────────────────────────────────────

def test_get_env(monkeypatch):
    monkeypatch.setenv("TEST_GET_ENV", "val")
    assert get_env("TEST_GET_ENV") == "val"


def test_get_env_default():
    assert get_env("NONEXISTENT_VAR_XYZ", default="fallback") == "fallback"


def test_get_env_required(monkeypatch):
    monkeypatch.delenv("REQUIRED_MISSING", raising=False)
    with pytest.raises(ValueError, match="REQUIRED_MISSING"):
        get_env("REQUIRED_MISSING", required=True)


def test_get_env_required_present(monkeypatch):
    monkeypatch.setenv("REQUIRED_PRESENT", "ok")
    assert get_env("REQUIRED_PRESENT", required=True) == "ok"


# ── EnvConfig ────────────────────────────────────────────────────────

def test_env_config_defaults():
    cfg = EnvConfig.from_env(defaults={"port": "8000", "host": "localhost"})
    assert cfg.get("port") == "8000"
    assert cfg.get("host") == "localhost"


def test_env_config_env_override(monkeypatch):
    monkeypatch.setenv("MYAPP_PORT", "9090")
    cfg = EnvConfig.from_env(
        prefix="MYAPP",
        defaults={"port": "8000"},
    )
    assert cfg.get("port") == "9090"


def test_env_config_from_file(tmp_path, monkeypatch):
    f = tmp_path / ".env"
    f.write_text("TESTCFG_PORT=3000\n")
    monkeypatch.delenv("TESTCFG_PORT", raising=False)

    cfg = EnvConfig.from_env(
        prefix="TESTCFG",
        defaults={"port": "8000"},
        env_file=f,
    )
    assert cfg.get("port") == "3000"

    monkeypatch.delenv("TESTCFG_PORT", raising=False)


def test_env_config_get_int():
    cfg = EnvConfig(values={"port": "8080"})
    assert cfg.get_int("port") == 8080
    assert cfg.get_int("missing") == 0
    assert cfg.get_int("missing", default=42) == 42


def test_env_config_get_bool():
    cfg = EnvConfig(values={"debug": "true", "verbose": "0"})
    assert cfg.get_bool("debug") is True
    assert cfg.get_bool("verbose") is False
    assert cfg.get_bool("missing") is False
    assert cfg.get_bool("missing", default=True) is True


def test_env_config_get_bool_variants():
    for truthy in ("true", "1", "yes", "on", "True", "YES"):
        cfg = EnvConfig(values={"v": truthy})
        assert cfg.get_bool("v") is True
    for falsy in ("false", "0", "no", "off"):
        cfg = EnvConfig(values={"v": falsy})
        assert cfg.get_bool("v") is False


def test_env_config_as_dict():
    cfg = EnvConfig(values={"a": "1", "b": "2"})
    assert cfg.as_dict() == {"a": "1", "b": "2"}


def test_env_config_auto_discover(monkeypatch):
    monkeypatch.setenv("SVC_CUSTOM_KEY", "discovered")
    cfg = EnvConfig.from_env(prefix="SVC")
    assert cfg.get("custom_key") == "discovered"

    monkeypatch.delenv("SVC_CUSTOM_KEY")
