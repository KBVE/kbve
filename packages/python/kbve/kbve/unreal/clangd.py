import argparse
import shutil
import subprocess
import time
import sys
from pathlib import Path

from .ubt import generate_clang_db_command, resolve_engine_root

DEFAULT_PROJECT = "apps/rentearth/unreal-rentearth/rentearth.uproject"


def write_clangd_pointer(repo_root: Path, db_dir: Path) -> Path:
    rel = Path(db_dir).resolve().relative_to(Path(repo_root).resolve())
    out = Path(repo_root) / ".clangd"
    out.write_text("CompileFlags:\n  CompilationDatabase: " + str(rel) + "\n")
    return out


def locate_generated_db(engine_root: Path, project_dir: Path, newer_than: float = 0.0) -> Path | None:
    candidates = [
        Path(project_dir) / "compile_commands.json",
        Path(engine_root) / "compile_commands.json",
    ]
    # The previous run left a database in the project directory, and UBT writes
    # its own under the engine root. Taking the first that exists picks up the
    # old file every time -- the run reports success and the database never
    # changes. Only a file this run wrote counts.
    fresh = [c for c in candidates if c.exists() and c.stat().st_mtime >= newer_than]
    if fresh:
        return max(fresh, key=lambda c: c.stat().st_mtime)
    return None


def find_repo_root(start: Path) -> Path:
    for root in [start, *start.parents]:
        if (root / ".git").exists():
            return root
    return start


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="kbve-unreal-clangd")
    parser.add_argument("--project", default=DEFAULT_PROJECT)
    parser.add_argument("--target", default="chuckEditor")
    parser.add_argument("--config", default="Development")
    parser.add_argument("--platform", default="Mac")
    parser.add_argument("--engine-root")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args(argv)

    repo_root = find_repo_root(Path.cwd().resolve())
    uproject = (repo_root / args.project).resolve()
    if not uproject.exists():
        print(f"uproject not found: {uproject}", file=sys.stderr)
        return 2

    engine_root = resolve_engine_root(uproject, override=Path(args.engine_root) if args.engine_root else None)
    if not args.dry_run and not engine_root.exists():
        print(
            f"engine not found: {engine_root} (override with --engine-root or KBVE_UE_ROOT)",
            file=sys.stderr,
        )
        return 2

    cmd = generate_clang_db_command(
        engine_root=engine_root,
        uproject=uproject,
        target=args.target,
        config=args.config,
        platform=args.platform,
    )
    if args.dry_run:
        print(" ".join(cmd))
        return 0

    started = time.time()
    result = subprocess.run(cmd)
    if result.returncode != 0:
        print(f"UBT failed with exit code {result.returncode}", file=sys.stderr)
        return result.returncode

    project_dir = uproject.parent
    db = locate_generated_db(engine_root, project_dir, newer_than=started)
    if db is None:
        print("UBT succeeded but wrote no compile_commands.json", file=sys.stderr)
        return 2
    target_db = project_dir / "compile_commands.json"
    if db != target_db:
        shutil.move(str(db), str(target_db))

    pointer = write_clangd_pointer(repo_root, project_dir)
    print(f"database: {target_db}")
    print(f"pointer:  {pointer}")
    return 0
