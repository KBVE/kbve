import json

import pytest

from kbve.unreal.check import (
    load_db,
    find_entry,
    rewrite_command,
    resolve_check_entry,
    EntryNotFound,
)


@pytest.fixture
def db_path(tmp_path):
    src = tmp_path / "Plugins/KBVEUI/Source/KBVEUI/Private"
    src.mkdir(parents=True)
    widget = src / "KBVEWidget.cpp"
    widget.write_text("")
    other = src / "KBVETheme.cpp"
    other.write_text("")
    header = src / "KBVEWidget.h"
    header.write_text("")
    lonely_header = src / "KBVEStyle.h"
    lonely_header.write_text("")
    entries = [
        {
            "file": str(widget),
            "directory": str(tmp_path),
            "command": f'clang++ -DWITH_EDITOR=1 -I/ue/inc -c {widget} -o /out/KBVEWidget.o',
        },
        {
            "file": str(other),
            "directory": str(tmp_path),
            "command": f'clang++ -DWITH_EDITOR=1 -I/ue/inc -c {other} -o /out/KBVETheme.o',
        },
    ]
    path = tmp_path / "compile_commands.json"
    path.write_text(json.dumps(entries))
    return path


def test_load_db_parses_entries(db_path):
    entries = load_db(db_path)
    assert len(entries) == 2
    assert entries[0]["file"].endswith("KBVEWidget.cpp")


def test_find_entry_matches_absolute_path(db_path):
    entries = load_db(db_path)
    target = entries[1]["file"]
    assert find_entry(entries, target)["file"] == target


def test_find_entry_returns_none_for_unknown(db_path):
    entries = load_db(db_path)
    assert find_entry(entries, "/nope/missing.cpp") is None


def test_rewrite_command_adds_syntax_only_strips_output():
    cmd = rewrite_command('clang++ -DX=1 -I/inc -c /src/a.cpp -o /out/a.o')
    assert "-fsyntax-only" in cmd
    assert "-o" not in cmd
    assert "/out/a.o" not in cmd
    assert "-c" not in cmd
    assert "/src/a.cpp" in cmd


def test_resolve_check_entry_source_direct(db_path):
    entries = load_db(db_path)
    target = entries[0]["file"]
    entry, include = resolve_check_entry(entries, target)
    assert entry["file"] == target
    assert include is None


def test_resolve_check_entry_header_uses_sibling_source(db_path):
    entries = load_db(db_path)
    header = entries[0]["file"].replace(".cpp", ".h")
    entry, include = resolve_check_entry(entries, header)
    assert entry["file"].endswith("KBVEWidget.cpp")
    assert include == header


def test_resolve_check_entry_header_falls_back_to_module_source(db_path):
    entries = load_db(db_path)
    header = entries[0]["file"].replace("KBVEWidget.cpp", "KBVEStyle.h")
    entry, include = resolve_check_entry(entries, header)
    assert entry["file"].endswith(".cpp")
    assert include == header


def test_resolve_check_entry_unknown_raises(db_path):
    entries = load_db(db_path)
    with pytest.raises(EntryNotFound):
        resolve_check_entry(entries, "/elsewhere/Foo.cpp")


def test_rewrite_command_suppresses_unused_arg_error():
    cmd = rewrite_command('clang++ @/rsp/file.rsp')
    assert "-fsyntax-only" in cmd
    assert "-Wno-unused-command-line-argument" in cmd
    assert cmd[1] == "@/rsp/file.rsp"


def test_filter_diagnostics_keeps_driver_errors():
    from kbve.unreal.check import filter_diagnostics
    text = (
        "note noise\n"
        "clang++: error: something broke\n"
        "/src/a.cpp:10:5: error: no member\n"
        "/src/a.cpp:10:5: note: candidate\n"
        "random line\n"
    )
    kept = filter_diagnostics(text)
    assert "clang++: error: something broke" in kept
    assert "/src/a.cpp:10:5: error: no member" in kept
    assert "random line" not in kept


def test_resolve_check_entry_public_header_finds_private_source(tmp_path):
    priv = tmp_path / "Source/KBVECombat/Private"
    pub = tmp_path / "Source/KBVECombat/Public"
    priv.mkdir(parents=True)
    pub.mkdir(parents=True)
    cpp = priv / "KBVECombatComponent.cpp"
    cpp.write_text("")
    header = pub / "KBVECombatComponent.h"
    header.write_text("")
    entries = [
        {
            "file": str(cpp),
            "directory": str(tmp_path),
            "command": f"clang++ -c {cpp} -o /out/x.o",
        }
    ]
    entry, include = resolve_check_entry(entries, str(header))
    assert entry["file"] == str(cpp)
    assert include == str(header)


def test_resolve_check_entry_public_header_falls_back_to_module_any_source(tmp_path):
    priv = tmp_path / "Source/KBVECombat/Private"
    pub = tmp_path / "Source/KBVECombat/Public"
    priv.mkdir(parents=True)
    pub.mkdir(parents=True)
    cpp = priv / "Other.cpp"
    cpp.write_text("")
    header = pub / "KBVELonely.h"
    header.write_text("")
    entries = [
        {
            "file": str(cpp),
            "directory": str(tmp_path),
            "command": f"clang++ -c {cpp} -o /out/x.o",
        }
    ]
    entry, include = resolve_check_entry(entries, str(header))
    assert entry["file"] == str(cpp)
    assert include == str(header)
