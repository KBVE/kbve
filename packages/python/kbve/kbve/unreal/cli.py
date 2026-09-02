"""CLI entry points for the packaged Unreal editor scripts."""

import argparse
import json
import sys
from pathlib import Path

from .commandlet import run_editor_script


def _parse(argv, description):
    parser = argparse.ArgumentParser(description=description)
    parser.add_argument("--project", required=True, type=Path, help="path to the .uproject")
    parser.add_argument("--config", required=True, type=Path, help="path to the JSON description")
    parser.add_argument("--engine-root", type=Path, default=None, help="override the engine install")
    return parser.parse_args(argv)


def _run(argv, script, description):
    args = _parse(argv, description)
    if not args.config.is_file():
        print(f"error: no config at {args.config}", file=sys.stderr)
        return 1
    config = json.loads(args.config.read_text())
    return run_editor_script(args.project, script, config, args.engine_root)


def input_assets_main(argv: list[str] | None = None) -> int:
    return _run(argv or sys.argv[1:], "input_assets", "Build Enhanced Input assets in an Unreal project.")


def world_map_main(argv: list[str] | None = None) -> int:
    return _run(argv or sys.argv[1:], "world_map", "Populate an Unreal level from a JSON description.")
