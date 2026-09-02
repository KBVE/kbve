"""Host-side runner for the editor scripts in kbve.unreal.editor."""

import json
import os
import re
import subprocess
import sys
from pathlib import Path

from .ubt import resolve_engine_root

# Lines worth surfacing from an editor run. The editor is prolific and almost
# none of it concerns the script that was asked for.
INTERESTING = re.compile(r"LogPython: (Display|Warning|Error)|LogPythonScriptCommandlet|: (Error|Fatal): ")
NOISE = re.compile(r"LogInit: Display:|init_unreal\.py|pip-enabled")


def editor_cmd(engine_root: Path) -> Path:
    return Path(engine_root) / "Engine/Binaries/Mac/UnrealEditor-Cmd"


def script_path(name: str) -> Path:
    """Absolute path to an editor script shipped in this package."""
    path = Path(__file__).parent / "editor" / f"{name}.py"
    if not path.is_file():
        raise FileNotFoundError(f"no editor script named {name!r} at {path}")
    return path


def run_editor_script(
    uproject: Path,
    name: str,
    config: dict | None = None,
    engine_root: Path | None = None,
) -> int:
    """Run a packaged editor script against a project, returning its exit code."""
    uproject = Path(uproject).resolve()
    if not uproject.is_file():
        print(f"error: no uproject at {uproject}", file=sys.stderr)
        return 1

    root = resolve_engine_root(uproject, engine_root)
    cmd = editor_cmd(root)
    if not os.access(cmd, os.X_OK):
        print(f"error: UnrealEditor-Cmd not found at {cmd}", file=sys.stderr)
        return 127

    env = dict(os.environ)
    config_file = None
    if config is not None:
        # Written beside the project's Saved/ rather than passed on the command
        # line: the editor's argument parsing mangles quoting, and a config of
        # any size would not survive it.
        saved = uproject.parent / "Saved"
        saved.mkdir(parents=True, exist_ok=True)
        config_file = saved / f"kbve-{name}-config.json"
        config_file.write_text(json.dumps(config, indent=2))
        env["KBVE_UNREAL_CONFIG"] = str(config_file)

    argv = [
        str(cmd),
        str(uproject),
        "-run=pythonscript",
        f"-script={script_path(name)}",
        "-unattended",
        "-nosplash",
        "-nosound",
    ]

    proc = subprocess.run(argv, capture_output=True, text=True, env=env)
    for line in (proc.stdout or "").splitlines():
        if INTERESTING.search(line) and not NOISE.search(line):
            print(line)

    if proc.returncode != 0:
        print(f"error: editor script {name!r} failed (exit {proc.returncode})", file=sys.stderr)
    return proc.returncode
