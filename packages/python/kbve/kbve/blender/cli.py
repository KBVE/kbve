"""Venv launchers for the Blender-python tools.

The tools need ``bpy`` (Blender's bundled Python), so each launcher locates a
Blender binary and re-runs the target module inside it via
``blender -b -P <module> -- <args>``.
"""

import argparse
import os
import shutil
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent


def find_blender(explicit: str | None) -> str:
    if explicit:
        return explicit
    env = os.environ.get("BLENDER")
    if env:
        return env
    found = shutil.which("blender")
    if found:
        return found
    mac = "/Applications/Blender.app/Contents/MacOS/Blender"
    if Path(mac).exists():
        return mac
    raise SystemExit("blender not found: install it, set $BLENDER, or pass --blender")


def run_in_blender(module: Path, passthrough: list[str], blender: str, blend: str | None = None) -> int:
    # `blender -b <file>` opens the .blend before running the script. The
    # retarget and VAT tools open their own inputs and pass nothing here; the
    # render and export tools operate on an already-loaded scene.
    cmd = [blender, "-b"]
    if blend:
        cmd.append(blend)
    cmd += ["-P", str(module), "--", *passthrough]
    return subprocess.run(cmd).returncode


def retarget_main() -> None:
    p = argparse.ArgumentParser(
        prog="kbve-blender-retarget", description="Headless Rokoko retarget (Mesh2Motion -> Synty SIDEKICK)."
    )
    p.add_argument("--char", required=True, help="target rig glb (skinned)")
    p.add_argument("--anims", required=True, help="source rig glb (actions)")
    p.add_argument("--out", required=True, help="output glb")
    p.add_argument("--clips", required=True, help="comma-separated action names")
    p.add_argument("--no-plume", action="store_true", help="skip the helmet-crest plume bone (herbmail-specific)")
    p.add_argument("--no-reweight", action="store_true", help="skip neutral_bone weight routing")
    p.add_argument("--blender", default=None, help="path to blender binary")
    a = p.parse_args()
    blender = find_blender(a.blender)
    passthrough = [
        a.char,
        a.anims,
        a.out,
        a.clips,
        "0" if a.no_plume else "1",
        "0" if a.no_reweight else "1",
    ]
    code = run_in_blender(HERE / "retarget.py", passthrough, blender)
    sys.exit(code)


def vat_main() -> None:
    p = argparse.ArgumentParser(
        prog="kbve-blender-vat", description="Bake a looping skinned animation to a vertex animation texture."
    )
    p.add_argument("--src", required=True, help="source fbx/glb with one skinned mesh")
    p.add_argument("--out", required=True, help="output directory")
    p.add_argument("--tris", type=int, default=1200, help="decimate target; texture size is verts x frames")
    p.add_argument("--frames", type=int, default=32, help="resampled cycle length")
    p.add_argument("--name", default=None, help="output basename (default: source stem)")
    p.add_argument("--blender", default=None, help="path to blender binary")
    a = p.parse_args()
    blender = find_blender(a.blender)
    passthrough = [a.src, a.out, str(a.tris), str(a.frames)]
    if a.name:
        passthrough.append(a.name)
    code = run_in_blender(HERE / "vat_bake.py", passthrough, blender)
    sys.exit(code)


def which_main() -> None:
    """Print the Blender binary that the other launchers would use.

    For callers that need to run Blender themselves -- a one-off --python-expr,
    or a user-supplied script -- so that the search order lives in one place
    rather than being restated in shell.
    """
    p = argparse.ArgumentParser(prog="kbve-blender-which", description="Print the path to the Blender binary.")
    p.add_argument("--blender", default=None, help="path to blender binary")
    p.add_argument(
        "--install",
        action="store_true",
        help="on macOS, install Blender via Homebrew when it is not found",
    )
    a = p.parse_args()
    try:
        print(find_blender(a.blender))
        return
    except SystemExit:
        if not a.install:
            raise
    # Only macOS: it is the only platform with a one-command install here, and
    # a Linux runner that reaches this wants to hear that Blender is missing
    # rather than that `brew` is.
    if sys.platform != "darwin" or shutil.which("brew") is None:
        raise SystemExit("blender not found and cannot be installed here: install it, set $BLENDER, or pass --blender")
    print("installing Blender via Homebrew...", file=sys.stderr)
    subprocess.run(["brew", "install", "--cask", "blender"], check=True)
    print(find_blender(None))


def render_main() -> None:
    p = argparse.ArgumentParser(prog="kbve-blender-render", description="Render a .blend to a still image.")
    p.add_argument("--blend", required=True, help="the .blend file to render")
    p.add_argument("--out", required=True, help="output directory")
    p.add_argument("--engine", default="CYCLES", help="render engine")
    p.add_argument("--device", default="GPU", help="CYCLES compute device")
    p.add_argument("--format", default="PNG", help="image format")
    p.add_argument("--samples", default="", help="CYCLES sample count")
    p.add_argument("--resolution-scale", default="100", help="resolution percentage")
    p.add_argument("--blender", default=None, help="path to blender binary")
    a = p.parse_args()
    passthrough = [
        a.out,
        a.engine,
        a.device,
        a.format,
        a.samples,
        a.resolution_scale,
    ]
    code = run_in_blender(HERE / "render.py", passthrough, find_blender(a.blender), blend=a.blend)
    sys.exit(code)


def export_main() -> None:
    p = argparse.ArgumentParser(prog="kbve-blender-export", description="Export a .blend to a single file.")
    p.add_argument("--blend", required=True, help="the .blend file to export")
    p.add_argument("--out", required=True, help="output directory")
    p.add_argument("--format", default="FBX", help="FBX | GLTF | OBJ | USD | ALEMBIC | STL")
    p.add_argument("--selection-only", default="false", help="export selected objects only")
    p.add_argument("--apply-modifiers", default="true", help="apply modifiers on export")
    p.add_argument("--blender", default=None, help="path to blender binary")
    a = p.parse_args()
    passthrough = [a.out, a.format, a.selection_only, a.apply_modifiers]
    code = run_in_blender(HERE / "export.py", passthrough, find_blender(a.blender), blend=a.blend)
    sys.exit(code)


def batch_export_main() -> None:
    p = argparse.ArgumentParser(
        prog="kbve-blender-batch-export",
        description="Export every mesh object in a .blend to its own file.",
    )
    p.add_argument("--blend", required=True, help="the .blend file to export")
    p.add_argument("--out", required=True, help="output directory")
    p.add_argument("--format", default="FBX", help="FBX | GLTF | OBJ | USD | ALEMBIC | STL")
    p.add_argument("--blender", default=None, help="path to blender binary")
    a = p.parse_args()
    code = run_in_blender(HERE / "batch_export.py", [a.out, a.format], find_blender(a.blender), blend=a.blend)
    sys.exit(code)


# Default entry when invoked bare; kept generic in case more tools are added.
def main() -> None:
    retarget_main()


if __name__ == "__main__":
    main()
