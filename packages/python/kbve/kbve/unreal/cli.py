"""CLI entry points for the packaged Unreal editor scripts."""

import argparse
import json
import sys
from pathlib import Path

from .commandlet import run_editor_script
from .process import build_target, launch_editor, quit_editor, sample_perf


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


def _project_arg(description):
    parser = argparse.ArgumentParser(description=description)
    parser.add_argument("--project", required=True, type=Path, help="path to the .uproject")
    parser.add_argument("--engine-root", type=Path, default=None, help="override the engine install")
    return parser


def quit_main(argv: list[str] | None = None) -> int:
    args = _project_arg("Quit any Unreal editor holding a project.").parse_args(argv or sys.argv[1:])
    return quit_editor(args.project)


def build_main(argv: list[str] | None = None) -> int:
    parser = _project_arg("Build an Unreal target with UnrealBuildTool.")
    parser.add_argument("--target", required=True, help="e.g. RareIconEditor")
    parser.add_argument("--config", default="Development")
    parser.add_argument("--platform", default="Mac")
    args = parser.parse_args(argv or sys.argv[1:])
    return build_target(args.project, args.target, args.config, args.platform, args.engine_root)


def launch_main(argv: list[str] | None = None) -> int:
    parser = _project_arg("Launch the Unreal editor with filtered logging.")
    parser.add_argument("--log-prefix", required=True, help="basename for the four log files")
    parser.add_argument("--module", default=None, help="game module that must already be built")
    parser.add_argument("rest", nargs="*", help="extra arguments forwarded to the editor")
    args = parser.parse_args(argv or sys.argv[1:])
    return launch_editor(args.project, args.log_prefix, args.module, args.rest, args.engine_root)


def dev_main(argv: list[str] | None = None) -> int:
    """Quit, build, launch -- in that order.

    One command rather than three moon tasks with dependencies, because moon
    runs a dependency first and the editor would still be up while UBT tried to
    replace the module it has open.
    """
    parser = _project_arg("Quit, build and launch the Unreal editor.")
    parser.add_argument("--target", required=True, help="e.g. RareIconEditor")
    parser.add_argument("--log-prefix", required=True)
    parser.add_argument("--module", default=None)
    parser.add_argument("--config", default="Development")
    parser.add_argument("--platform", default="Mac")
    args = parser.parse_args(argv or sys.argv[1:])

    code = quit_editor(args.project)
    if code != 0:
        return code
    code = build_target(args.project, args.target, args.config, args.platform, args.engine_root)
    if code != 0:
        return code
    return launch_editor(args.project, args.log_prefix, args.module, [], args.engine_root)


def perf_main(argv: list[str] | None = None) -> int:
    parser = _project_arg("Sample KBVEPerf frame timings from a running game.")
    parser.add_argument("--seconds", type=int, default=20, help="how long to sample")
    parser.add_argument("--port", type=int, default=8099)
    parser.add_argument("--cvars", default="", help="extra console commands, comma separated")
    args = parser.parse_args(argv or sys.argv[1:])
    return sample_perf(args.project, args.seconds, args.port, args.cvars, args.engine_root)
