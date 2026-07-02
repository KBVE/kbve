import argparse
import json
import shlex
import subprocess
import sys
from pathlib import Path

HEADER_SUFFIXES = {".h", ".hpp", ".inl"}


class EntryNotFound(Exception):
    pass


def load_db(path: Path) -> list[dict]:
    return json.loads(Path(path).read_text())


def find_entry(entries: list[dict], file: str) -> dict | None:
    target = str(Path(file).resolve())
    for entry in entries:
        if str(Path(entry["file"]).resolve()) == target:
            return entry
    return None


def rewrite_command(command: str) -> list[str]:
    args = shlex.split(command)
    out: list[str] = []
    skip = False
    for arg in args:
        if skip:
            skip = False
            continue
        if arg == "-o":
            skip = True
            continue
        if arg == "-c":
            continue
        out.append(arg)
    out.append("-fsyntax-only")
    out.append("-Wno-unused-command-line-argument")
    return out


def filter_diagnostics(text: str) -> str:
    kept = [
        line
        for line in text.splitlines()
        if "error:" in line or "warning:" in line or ": note:" in line
    ]
    return "\n".join(kept)


def resolve_check_entry(entries: list[dict], file: str) -> tuple[dict, str | None]:
    path = Path(file).resolve()
    if path.suffix not in HEADER_SUFFIXES:
        entry = find_entry(entries, str(path))
        if entry is None:
            raise EntryNotFound(str(path))
        return entry, None
    candidates = [path.parent]
    if path.parent.name == "Public":
        candidates.append(path.parent.parent / "Private")
    for directory in candidates:
        sibling = find_entry(entries, str(directory / path.with_suffix(".cpp").name))
        if sibling is not None:
            return sibling, str(path)
    module_root = _module_root(path)
    for entry in entries:
        entry_path = Path(entry["file"]).resolve()
        if entry_path.parent in candidates:
            return entry, str(path)
        if module_root is not None and entry_path.is_relative_to(module_root):
            return entry, str(path)
    raise EntryNotFound(str(path))


def _module_root(path: Path) -> Path | None:
    for parent in path.parents:
        if parent.name == "Source":
            relative = path.relative_to(parent)
            if len(relative.parts) > 1:
                return parent / relative.parts[0]
    return None


def build_check_invocation(entries: list[dict], file: str) -> list[str]:
    entry, include = resolve_check_entry(entries, file)
    cmd = rewrite_command(entry["command"])
    if include is not None:
        cmd += ["-include", include]
    return cmd


def default_db_path() -> Path | None:
    cwd = Path.cwd().resolve()
    for root in [cwd, *cwd.parents]:
        clangd = root / ".clangd"
        if clangd.exists():
            for line in clangd.read_text().splitlines():
                key, _, value = line.partition(":")
                if key.strip() == "CompilationDatabase":
                    return root / value.strip() / "compile_commands.json"
    return None


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="kbve-unreal-check")
    parser.add_argument("files", nargs="+")
    parser.add_argument("--db")
    args = parser.parse_args(argv)

    db = Path(args.db) if args.db else default_db_path()
    if db is None or not db.exists():
        print(
            "compile_commands.json not found; generate it with kbve-unreal-clangd",
            file=sys.stderr,
        )
        return 2

    entries = load_db(db)
    failed = False
    for file in args.files:
        try:
            entry, _ = resolve_check_entry(entries, file)
            cmd = build_check_invocation(entries, file)
        except EntryNotFound:
            print(
                file + " not in compile database; regenerate with kbve-unreal-clangd",
                file=sys.stderr,
            )
            return 2
        result = subprocess.run(
            cmd, capture_output=True, text=True, cwd=entry["directory"]
        )
        if result.returncode != 0:
            failed = True
            output = filter_diagnostics(result.stderr or result.stdout)
            print(output or (result.stderr or result.stdout).strip())
    return 1 if failed else 0
