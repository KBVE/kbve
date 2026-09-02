"""Quit, build and launch the Unreal editor for a project.

Host-side, and deliberately game-agnostic: everything specific to a game is a
path or a log prefix, which the caller supplies. This replaces a per-game shell
script whose only variable parts were the project directory and the name of the
module to look for.
"""

import os
import re
import signal
import subprocess
import sys
import time
from pathlib import Path

from .ubt import resolve_engine_root

# UE severities are a field, not a word: 'LogFoo: Warning: msg'. Matching the
# bare words instead catches every line that merely says "error", which is how a
# clean run ends up printing a wall of hits.
ISSUE_RE = re.compile(
    r": (Error|Warning|Fatal): |Assertion failed|ensure condition failed"
    r"|Caught signal|LogOutputDevice: Error"
)
ERROR_RE = re.compile(
    r": (Error|Fatal): |Assertion failed|ensure condition failed"
    r"|Caught signal|LogOutputDevice: Error"
)
WARNING_RE = re.compile(r": Warning: ")


def editor_binary(engine_root: Path) -> Path:
    return Path(engine_root) / "Engine/Binaries/Mac/UnrealEditor.app/Contents/MacOS/UnrealEditor"


def build_script(engine_root: Path) -> Path:
    return Path(engine_root) / "Engine/Build/BatchFiles/Mac/Build.sh"


def running_editor_pids(uproject: Path) -> list[int]:
    pattern = f"UnrealEditor.*{Path(uproject).name}"
    proc = subprocess.run(["pgrep", "-f", pattern], capture_output=True, text=True)
    return [int(p) for p in proc.stdout.split() if p.strip()]


def quit_editor(uproject: Path, timeout: int = 30) -> int:
    """Quit any editor holding this project, escalating if it will not go.

    Order matters against a build: UnrealBuildTool cannot replace a dylib the
    running editor has loaded, so it writes a numbered hot-reload copy and
    leaves the real one untouched. Build first and quit second and the editor
    then starts against a module that is silently stale.
    """
    pids = running_editor_pids(uproject)
    if not pids:
        return 0

    print(f"==> graceful quit: UnrealEditor pids={pids}")
    subprocess.run(
        ["osascript", "-e", 'tell application "UnrealEditor" to quit'],
        capture_output=True,
    )

    for _ in range(timeout):
        if not running_editor_pids(uproject):
            break
        time.sleep(1)

    for sig in (signal.SIGINT, signal.SIGTERM, signal.SIGKILL):
        remaining = running_editor_pids(uproject)
        if not remaining:
            break
        print(f"==> {sig.name} escalation: {remaining}")
        for pid in remaining:
            try:
                os.kill(pid, sig)
            except ProcessLookupError:
                pass
        for _ in range(10):
            if not running_editor_pids(uproject):
                break
            time.sleep(1)

    for name in ("CrashReportClient", "EpicWebHelper"):
        subprocess.run(["pkill", "-f", name], capture_output=True)

    remove_hot_reload_dylibs(Path(uproject).parent)
    return 0


def remove_hot_reload_dylibs(project_dir: Path) -> int:
    """Delete hot-reload copies left by builds that ran against a live editor.

    Harmless at runtime, but their presence is the symptom that says a build
    went somewhere other than the module the editor loads.
    """
    binaries = project_dir / "Binaries" / "Mac"
    if not binaries.is_dir():
        return 0
    stale = [p for p in binaries.glob("*.dylib") if re.search(r"-\d{4}\.dylib$", p.name)]
    for path in stale:
        path.unlink(missing_ok=True)
    if stale:
        print(f"==> removed {len(stale)} hot-reload dylibs")
    return len(stale)


def build_target(
    uproject: Path, target: str, config: str = "Development", platform: str = "Mac", engine_root: Path | None = None
) -> int:
    uproject = Path(uproject).resolve()
    root = resolve_engine_root(uproject, engine_root)
    script = build_script(root)
    if not os.access(script, os.X_OK):
        print(f"error: Build.sh not found at {script}", file=sys.stderr)
        return 127
    print(f"==> building {target} {platform} {config}")
    return subprocess.run([str(script), target, platform, config, str(uproject)]).returncode


def launch_editor(
    uproject: Path,
    log_prefix: str,
    module_name: str | None = None,
    extra_args: list[str] | None = None,
    engine_root: Path | None = None,
) -> int:
    """Launch the editor, streaming a filtered console and keeping four logs.

    The engine gets its own -AbsLog path rather than sharing the streamed one:
    pointing both at one file has the engine and the tee writing through two
    handles, which interleaves.
    """
    uproject = Path(uproject).resolve()
    project_dir = uproject.parent
    root = resolve_engine_root(uproject, engine_root)
    editor = editor_binary(root)
    if not os.access(editor, os.X_OK):
        print(f"error: UnrealEditor not found at {editor}", file=sys.stderr)
        return 127

    if module_name:
        # The editor loads this at startup; a missing one is a startup crash
        # rather than a compile error, so fail here with something readable.
        binaries = project_dir / "Binaries" / "Mac"
        if not list(binaries.glob(f"*UnrealEditor-{module_name}.dylib")):
            print(f"error: module {module_name} not built in {binaries}", file=sys.stderr)
            return 1

    quit_editor(uproject)

    log_dir = project_dir / "Saved" / "Logs"
    log_dir.mkdir(parents=True, exist_ok=True)
    raw_log = log_dir / f"{log_prefix}-stream.log"
    friendly_log = log_dir / f"{log_prefix}.log"
    issue_log = log_dir / f"{log_prefix}-issues.log"
    ue_log = log_dir / f"{log_prefix}-ue.log"
    friendly_log.write_text("")
    issue_log.write_text("")

    print(f"==> launching UnrealEditor (uproject={uproject})")
    for label, path in (
        ("raw stream", raw_log),
        ("engine log", ue_log),
        ("issues", issue_log),
        ("friendly", friendly_log),
    ):
        print(f"==> {label:11}: {path}")
    print("")

    argv = [str(editor), str(uproject), "-stdout", "-FullStdOutLogOutput", f"-AbsLog={ue_log}", *(extra_args or [])]

    keep = re.compile(r"LogKBVE|Engine exit requested")
    exit_code = 0
    with open(raw_log, "w") as raw, open(friendly_log, "w") as friendly:
        proc = subprocess.Popen(argv, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1)
        for line in proc.stdout:
            raw.write(line)
            if keep.search(line) or ISSUE_RE.search(line):
                friendly.write(line)
                sys.stdout.write(line)
                sys.stdout.flush()
        exit_code = proc.wait()

    # Extracted after exit rather than during the run: no flush race, and it
    # still works when the editor is killed hard.
    issues = [ln for ln in raw_log.read_text(errors="replace").splitlines() if ISSUE_RE.search(ln)]
    issue_log.write_text("\n".join(issues) + ("\n" if issues else ""))
    errors = sum(1 for ln in issues if ERROR_RE.search(ln))
    warnings = sum(1 for ln in issues if WARNING_RE.search(ln))
    print(f"\n==> {errors} error(s), {warnings} warning(s) -> {issue_log}")

    if exit_code != 0:
        print(f"\n{'=' * 63}\n  UnrealEditor exited with code {exit_code}\n{'=' * 63}")
        if issues:
            print(f"\n--- warnings + errors ({errors} error(s), {warnings} warning(s)) ---")
            print("\n".join(issues))
        if ue_log.is_file():
            print(f"\n--- last 80 lines of {ue_log} ---")
            print("\n".join(ue_log.read_text(errors="replace").splitlines()[-80:]))
        crashes = sorted((project_dir / "Saved" / "Crashes").glob("UECC-*"))
        if crashes:
            latest = crashes[-1]
            print(f"\n--- latest crash dump: {latest} ---")
            diagnostics = latest / "Diagnostics.txt"
            if diagnostics.is_file():
                print(diagnostics.read_text(errors="replace"))

    return exit_code
