"""Convert PBR source sets to the three-map PNG convention the editor imports.

PolyHaven ships 2k/4k EXR and JPG per map. Unreal can read none of that
usefully: the EXRs are float where the material wants 8-bit, the normal maps are
OpenGL convention where Unreal samples DirectX, and roughness and height arrive
as two textures for what should cost one sample.

So conversion happens here rather than in the editor, and the result -- three
PNGs per set -- is what lives in LFS. The usual case, a fresh clone with the
PNGs already pulled, needs no source set and no ImageMagick at all.

Driven by the same JSON the editor script reads, because the two halves used to
be a bash array and a python dict that had drifted: one set was being converted
that the import side had never heard of.
"""

import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

SUFFIXES = ("D", "N", "RH")

# What each map is looked for as: the names it might carry, then the formats,
# each best precision first.
#
# Two conventions rather than one because PolyHaven is not the only place a set
# comes from, and the game-oriented packs name their maps after what they are
# rather than after the measurement -- and are not consistent about the format
# either. A hard-coded name or extension is a missing map for one pack and a
# working conversion for the next.
# {res} is the resolution PolyHaven stamps into every filename. It is the pack's
# own resolution, not the one being converted to: a 1k pack downsampled to 512
# is still named _1k on disk. Taken from the pack directory's suffix, which is
# where PolyHaven puts the same token, and overridable with "res" for a pack
# named some other way.
CANDIDATES = {
    "colour": (("diff_{res}", "BaseColor", "basecolor", "albedo", "Albedo"), ("jpg", "png", "exr")),
    "normal": (("nor_gl_{res}", "nor_dx_{res}", "Normal", "normal"), ("exr", "png", "jpg")),
    "rough": (("rough_{res}", "Roughness", "roughness"), ("exr", "png", "jpg")),
    "height": (("disp_{res}", "Height", "height", "Displacement"), ("png", "exr", "jpg")),
    "alpha": (("alpha_{res}", "Alpha", "alpha", "Opacity", "opacity"), ("png", "jpg", "exr")),
}


def res_token(entry: dict) -> str:
    if entry.get("res"):
        return entry["res"]
    match = re.search(r"_(\d+k)$", entry["pack"])
    return match.group(1) if match else "2k"


def source_map(src: Path, base: str, name: str, res: str) -> Path | None:
    suffixes, extensions = CANDIDATES[name]
    for suffix in suffixes:
        for extension in extensions:
            path = src / f"{base}_{suffix.format(res=res)}.{extension}"
            if path.is_file():
                return path
    return None


def converted(art: Path, entry: dict) -> list[Path]:
    return [art / entry["source"] / f"{entry['stem']}_{suffix}.png" for suffix in SUFFIXES]


def magick(args: list[str]) -> bool:
    proc = subprocess.run(["magick", *args], capture_output=True, text=True)
    if proc.returncode != 0:
        print(f"error: magick failed: {(proc.stderr or '').strip()}", file=sys.stderr)
        return False
    return True


def convert_set(art: Path, source_root: Path, entry: dict, resolution: int) -> bool:
    pack = entry["pack"]

    # PolyHaven puts the maps in a "textures" subdirectory and names them after
    # the pack; other packs put them beside each other and name them anything.
    # Both are spelled out in the config rather than guessed at.
    subdir = entry.get("textures_subdir", "textures")
    src = source_root / pack / subdir if subdir else source_root / pack
    if not src.is_dir():
        print(f"error: source set not found at {src}", file=sys.stderr)
        return False

    base = entry.get("base") or pack.rsplit("_", 1)[0]
    res = res_token(entry)
    maps = {name: source_map(src, base, name, res) for name in ("colour", "normal", "rough")}
    if entry.get("displacement"):
        maps["height"] = source_map(src, base, "height", res)
    if entry.get("alpha"):
        maps["alpha"] = source_map(src, base, "alpha", res)
    missing = [name for name, path in maps.items() if path is None]
    if missing:
        print(f"error: {pack} has no {', '.join(missing)} map in any known format", file=sys.stderr)
        return False

    out = art / entry["source"]
    out.mkdir(parents=True, exist_ok=True)
    # Per-set, because the run-wide resolution is a ceiling rather than a target:
    # resizing a 1k pack to 2k stores four times the bytes of the same detail.
    edge = min(resolution, int(entry.get("resolution", resolution)))
    size = f"{edge}x{edge}"
    stem = entry["stem"]
    print(f"  {stem} <- {pack}")

    # A cutout pack paints the cut-away region black, and black is not nothing:
    # a mip is an average of its texels, so by the third one every blade carries
    # a dark rim it never had, and a field of them at distance reads as grey mud
    # rather than as grass. Grow the colour outwards under the mask first, so the
    # texels that get averaged in are the colour the blade already was.
    #
    # Dilated then composited rather than dilated in place: a max filter over the
    # blade itself would eat its own shading. Eight passes covers the gaps this
    # atlas leaves between clumps at the mips that are actually sampled.
    colour = [str(maps["colour"]), "-resize", size]
    if entry.get("alpha"):
        colour += ["(", "+clone"]
        colour += ["-morphology", "Dilate", "Octagon:1"] * 8
        colour += [")", "+swap", "(", str(maps["alpha"]), "-resize", size, ")", "-composite"]
    if not magick([*colour, "-depth", "8", str(out / f"{stem}_D.png")]):
        return False

    # -set, not -colorspace: the EXR values are already the encoding wanted, and
    # converting would gamma-shift a normal map into nonsense.
    #
    # Unreal samples DirectX normals, so an OpenGL map has to have its green
    # inverted and a DirectX one must not. Which a pack ships is not something to
    # guess at: flipped the wrong way the lighting is subtly inside out -- bumps
    # read as dents under a moving sun -- and it looks like a material problem
    # forever. Correlate the green channel against the height map's vertical
    # gradient to settle it, then record the answer here.
    flip = ["-channel", "G", "-negate", "+channel"] if entry.get("flip_green", True) else []
    if not magick(
        [
            str(maps["normal"]),
            "-set",
            "colorspace",
            "sRGB",
            "-resize",
            size,
            *flip,
            "-depth",
            "8",
            f"PNG24:{out / f'{stem}_N.png'}",
        ]
    ):
        return False

    # R = roughness, G = height, B = opacity mask. One sample instead of three.
    # Sets with no displacement map get a flat mid-grey height so the channel
    # stays meaningful rather than black.
    #
    # A cutout set -- a foliage card atlas -- rides its mask in blue rather than
    # in the base colour's alpha, because the packed map is already imported as
    # TC_MASKS and linear, which is what a coverage value wants: an alpha beside
    # an sRGB base colour is gamma-shifted coverage, and it costs a second
    # sampler that this channel was already reserving space for.
    if entry.get("displacement"):
        height = [
            "(",
            str(maps["height"]),
            "-set",
            "colorspace",
            "sRGB",
            "-resize",
            size,
            "-channel",
            "R",
            "-separate",
            "+channel",
            ")",
        ]
    else:
        height = ["(", "-clone", "0", "-fill", "gray50", "-colorize", "100", ")"]

    if entry.get("alpha"):
        mask = [
            "(",
            str(maps["alpha"]),
            "-set",
            "colorspace",
            "sRGB",
            "-resize",
            size,
            "-channel",
            "R",
            "-separate",
            "+channel",
            ")",
        ]
    else:
        mask = ["(", "-clone", "0", "-fill", "black", "-colorize", "100", ")"]

    return magick(
        [
            "(",
            str(maps["rough"]),
            "-set",
            "colorspace",
            "sRGB",
            "-resize",
            size,
            "-channel",
            "R",
            "-separate",
            "+channel",
            ")",
            *height,
            *mask,
            "-channel",
            "RGB",
            "-combine",
            "-colorspace",
            "sRGB",
            "-depth",
            "8",
            f"PNG24:{out / f'{stem}_RH.png'}",
        ]
    )


def ingest(project: Path, config: dict, source_root: Path | None, resolution: int) -> int:
    """Convert any set whose PNGs are missing. Returns an exit code."""
    art = project.parent / config.get("art_root", "Art")
    pending = [
        entry for entry in config["sets"] if entry.get("pack") and not all(p.is_file() for p in converted(art, entry))
    ]

    if not pending:
        print("converted textures already present, skipping ingest")
        return 0

    if shutil.which("magick") is None:
        missing = ", ".join(entry["stem"] for entry in pending)
        print(f"error: converted textures are missing ({missing}) and ImageMagick is not installed", file=sys.stderr)
        print("       either 'git lfs pull' the PNGs or 'brew install imagemagick'", file=sys.stderr)
        return 127

    root = source_root or Path(os.environ.get("TERRAIN_SRC", Path.home() / "Downloads"))
    print(f"converting source textures from {root}")
    for entry in pending:
        if not convert_set(art, root, entry, resolution):
            return 1
    return 0
