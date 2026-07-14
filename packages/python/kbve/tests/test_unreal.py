import json

import pytest

from kbve.unreal.ubt import (
    parse_engine_association,
    resolve_engine_root,
    generate_clang_db_command,
)


@pytest.fixture
def uproject(tmp_path):
    path = tmp_path / "rentearth.uproject"
    path.write_text(json.dumps({"FileVersion": 3, "EngineAssociation": "5.8"}))
    return path


def test_parse_engine_association_reads_version(uproject):
    assert parse_engine_association(uproject) == "5.8"


def test_resolve_engine_root_defaults_to_shared_epic(uproject, monkeypatch):
    monkeypatch.delenv("KBVE_UE_ROOT", raising=False)
    assert str(resolve_engine_root(uproject)) == "/Users/Shared/Epic Games/UE_5.8"


def test_resolve_engine_root_env_override(uproject, monkeypatch, tmp_path):
    monkeypatch.setenv("KBVE_UE_ROOT", str(tmp_path / "UE"))
    assert resolve_engine_root(uproject) == tmp_path / "UE"


def test_resolve_engine_root_arg_beats_env(uproject, monkeypatch, tmp_path):
    monkeypatch.setenv("KBVE_UE_ROOT", str(tmp_path / "env"))
    assert resolve_engine_root(uproject, override=tmp_path / "arg") == tmp_path / "arg"


def test_generate_clang_db_command_shape(uproject, tmp_path):
    engine = tmp_path / "UE_5.8"
    cmd = generate_clang_db_command(
        engine_root=engine,
        uproject=uproject,
        target="chuckEditor",
        config="Development",
        platform="Mac",
    )
    assert cmd[0] == str(engine / "Engine/Build/BatchFiles/Mac/Build.sh")
    assert "-mode=GenerateClangDatabase" in cmd
    assert f"-project={uproject}" in cmd
    assert "chuckEditor" in cmd
    assert "Development" in cmd
    assert "Mac" in cmd
