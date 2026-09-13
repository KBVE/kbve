"""Convert PBR source sets to the KTX2 textures a bevy game loads.

A PNG is decoded to raw RGBA8 before it reaches the GPU, so a 2048-square map
costs 16MB of video memory whatever it cost on disk. A KTX2 carrying Basis data
is transcoded at load into whichever block format the adapter actually offers
and *stays* compressed there, which is a quarter of that for BC7 and an eighth
for BC1. The download is smaller as well, but the video memory is the reason.

Basis rather than a BC7 or ASTC file per platform, because the browser is the
target that cannot be predicted: WebGPU exposes compressed formats as optional
features, so which ones exist is not known until the adapter answers. Bevy's
KTX2 loader already transcodes against `supported_compressed_formats`; shipping
one file lets that decide.

**Which codec per map is not a quality preference.** ETC1S is a colour codec --
it stores a shared endpoint palette and reconstructs chroma from it, which is
fine for albedo and destroys a normal map, whose channels are a direction
vector rather than a colour. Normals and packed ORM maps therefore take UASTC,
at roughly five times the file size, and base colour takes ETC1S.

Requires `basisu` and `magick` on PATH. Both are native binaries, so neither
can be a dependency of this package; the committed KTX2 is the artifact and a
fresh clone needs neither, the same arrangement :mod:`kbve.unreal.textures`
has with ImageMagick.

    python -m kbve.bevy.textures <source-dir> --out <dir> --size 1024
"""

from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
from pathlib import Path

# What each map is looked for as, and how it must be encoded.
#
# `srgb` decides whether the values are a colour that should be read through
# the transfer function or a measurement that must not be; getting it wrong on
# a normal map bends every lighting calculation that samples it. `uastc` is the
# codec split described in the module note.
#
# Several naming conventions rather than one: Quaternius writes `T_<set>_ORM`,
# PolyHaven writes `<set>_nor_gl_1k`, and a pack that names its maps some third
# way is the usual case rather than the exception.
KINDS = {
    "basecolor": {
        "names": ("BaseColor", "basecolor", "Albedo", "albedo", "color", "diff"),
        "srgb": True,
        "uastc": False,
    },
    "normal": {
        # OpenGL convention first: bevy samples green-up, and a pack shipping
        # both conventions names them apart rather than leaving it to be
        # guessed.
        "names": ("Normal_gl", "normal_gl", "nor_gl", "Normal", "normal"),
        "srgb": False,
        "uastc": True,
    },
    "orm": {
        "names": ("ORM", "orm", "OcclusionRoughnessMetallic"),
        "srgb": False,
        "uastc": True,
    },
    "roughness": {
        "names": ("Roughness", "roughness", "rough"),
        "srgb": False,
        "uastc": True,
    },
}

EXTENSIONS = ("png", "jpg", "jpeg", "tga", "exr")


def tool(name: str) -> bool:
    """Whether a native binary this module shells out to is installed."""
    if shutil.which(name):
        return True
    print(f"error: {name} not on PATH", file=sys.stderr)
    return False


def find_map(source: Path, kind: str, variant: int = 1) -> Path | None:
    """The file in `source` holding `kind`, or None.

    Matched on the suffix rather than the whole name so a set can be found
    without being told what it calls itself, which is what lets a directory be
    pointed at rather than enumerated.

    `variant` picks between colourways, which a pack names by inserting a digit
    into an otherwise identical name: `T_Knight_BaseColor` is the first,
    `T_Knight_2_BaseColor` the second. Sorting those lexicographically puts the
    second one first, because `2` precedes `B` -- so the primary is chosen by
    length instead, the numbered names being strictly longer.
    """
    for name in KINDS[kind]["names"]:
        for extension in EXTENSIONS:
            hits = sorted(source.glob(f"*{name}*.{extension}"), key=lambda p: (len(p.name), p.name))
            if hits:
                return hits[variant - 1] if variant <= len(hits) else None
    return None


def encode(source: Path, out: Path, kind: str, size: int, flip: bool) -> bool:
    """Downscale one map and encode it to KTX2."""
    spec = KINDS[kind]
    scaled = out.with_suffix(".scaled.png")

    # Resized before encoding rather than by basisu, so the filter is the same
    # one the rest of the repo's texture conversion uses and a bad resize is
    # visible as a PNG rather than only after transcoding.
    resize = ["magick", str(source), "-resize", f"{size}x{size}!", "-depth", "8", str(scaled)]
    if subprocess.run(resize, capture_output=True, text=True).returncode != 0:
        print(f"error: magick failed on {source.name}", file=sys.stderr)
        return False

    argv = ["basisu", "-ktx2", "-mipmap", "-file", str(scaled), "-output_file", str(out)]
    if spec["uastc"]:
        argv.append("-uastc")
    if not spec["srgb"]:
        # Tells the encoder the values are not a colour, so it neither applies
        # nor assumes a transfer function on them.
        argv.append("-linear")
    if flip:
        argv.append("-y_flip")

    proc = subprocess.run(argv, capture_output=True, text=True)
    scaled.unlink(missing_ok=True)
    if proc.returncode != 0:
        print(f"error: basisu failed on {source.name}: {(proc.stdout or '').strip()[-300:]}", file=sys.stderr)
        return False
    return True


def convert(source: Path, out: Path, prefix: str, size: int, flip: bool, kinds: list[str], variant: int) -> int:
    """Convert every requested map found in `source`."""
    out.mkdir(parents=True, exist_ok=True)
    written = 0

    for kind in kinds:
        # Only base colour has colourways; a pack ships one normal and one ORM
        # that every recolour shares, so asking for the third of those is
        # asking for a file that does not exist.
        found = find_map(source, kind, variant if kind == "basecolor" else 1)
        if not found:
            print(f"  {kind:<10} -- not found, skipped")
            continue
        target = out / f"{prefix}_{kind}.ktx2"
        if not encode(found, target, kind, size, flip):
            return -1
        codec = "UASTC" if KINDS[kind]["uastc"] else "ETC1S"
        before = found.stat().st_size
        after = target.stat().st_size
        print(f"  {kind:<10} {found.name} -> {target.name}  {codec:<5} {before / 1e6:6.1f}MB -> {after / 1e6:5.2f}MB")
        written += 1

    return written


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(
        prog="kbve-bevy-textures",
        description="Convert a PBR source set to KTX2 for a bevy game.",
    )
    ap.add_argument("source", type=Path, help="directory holding the source maps")
    ap.add_argument("--out", type=Path, required=True)
    ap.add_argument("--prefix", required=True, help="name the outputs are written under")
    ap.add_argument("--size", type=int, default=1024)
    ap.add_argument(
        "--kinds",
        nargs="+",
        default=["basecolor", "normal", "orm"],
        choices=sorted(KINDS),
    )
    # Off by default: glTF puts the UV origin at the top left, which is where a
    # PNG's first row already is. Turn it on only if a texture arrives upside
    # down, which means the source was authored the other way up.
    ap.add_argument("--flip", action="store_true", help="flip vertically while encoding")
    ap.add_argument(
        "--variant",
        type=int,
        default=1,
        help="which base-colour colourway to take, 1 being the pack's primary",
    )
    args = ap.parse_args(argv)

    if not args.source.is_dir():
        print(f"error: no such directory: {args.source}", file=sys.stderr)
        return 1
    if not (tool("magick") and tool("basisu")):
        return 1

    print(f"[bevy-textures] {args.source} -> {args.out} at {args.size}px")
    written = convert(args.source, args.out, args.prefix, args.size, args.flip, args.kinds, args.variant)
    if written < 0:
        return 1
    if written == 0:
        print("error: no maps matched; is this the right directory?", file=sys.stderr)
        return 1
    print(f"[bevy-textures] wrote {written} texture(s)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
