"""Pack the ground layer sources into the two strips the terrain material samples.

Each strip is one column of square layers, in the order the shader indexes them:
grass, rock, sand, snow. The albedo strip is sRGB, the normal strip is raw.
Run it again whenever a source changes; the strips are the committed artifact.

Lives here rather than beside the game it feeds because it was the second copy
of this idea in the repo -- :mod:`kbve.unreal.textures` is the first, and its
own note records what happened when the converting half and the importing half
drifted apart. One of them is easier to keep honest than two.

    kbve-bevy-terrain --grass ALBEDO,NORMAL ... --out <dir>
"""

import argparse
import pathlib
import subprocess
import sys

import numpy as np
from PIL import Image

LAYERS = ("grass", "rock", "sand", "snow")


def decode(source: pathlib.Path, size: int, raw: bool) -> Image.Image:
    """Read any source ImageMagick understands, including EXR, at `size` square.

    `raw` tags the values as already encoded instead of converting them, which is
    what keeps an EXR normal map's components from being pushed through gamma.
    """
    out = source.with_suffix(".decoded.png")
    argv = ["magick", str(source)]
    if raw:
        argv += ["-set", "colorspace", "sRGB"]
    argv += ["-resize", f"{size}x{size}!", "-depth", "8", str(out)]
    subprocess.run(argv, check=True, capture_output=True)
    image = Image.open(out).convert("RGB")
    image.load()
    out.unlink(missing_ok=True)
    return image


def renormalise(image: Image.Image) -> Image.Image:
    """Rescaling a normal map shortens its vectors; put them back on the unit sphere."""
    data = np.asarray(image).astype(np.float32) / 255.0 * 2.0 - 1.0
    length = np.linalg.norm(data, axis=2, keepdims=True)
    data = np.divide(data, length, out=np.zeros_like(data), where=length > 1e-6)
    return Image.fromarray((((data + 1.0) * 0.5) * 255.0).round().astype(np.uint8))


def strip(images: list[Image.Image]) -> Image.Image:
    size = images[0].width
    sheet = Image.new("RGB", (size, size * len(images)))
    for index, image in enumerate(images):
        sheet.paste(image, (0, size * index))
    return sheet


def main() -> int:
    parser = argparse.ArgumentParser()
    for layer in LAYERS:
        parser.add_argument(f"--{layer}", required=True, metavar="ALBEDO,NORMAL")
    parser.add_argument("--size", type=int, default=512)
    parser.add_argument("--out", type=pathlib.Path, required=True)
    args = parser.parse_args()

    albedos, normals = [], []
    for layer in LAYERS:
        albedo_src, normal_src = (pathlib.Path(part.strip()) for part in getattr(args, layer).split(","))
        for source in (albedo_src, normal_src):
            if not source.is_file():
                print(f"missing {layer} source: {source}", file=sys.stderr)
                return 1
        albedos.append(decode(albedo_src, args.size, raw=False))
        normals.append(renormalise(decode(normal_src, args.size, raw=True)))
        print(f"  {layer:6s} {albedo_src.name} + {normal_src.name}")

    args.out.mkdir(parents=True, exist_ok=True)
    strip(albedos).save(args.out / "ground_albedo.png")
    strip(normals).save(args.out / "ground_normal.png")
    print(f"wrote {args.out}/ground_albedo.png and ground_normal.png ({args.size}x{args.size * len(LAYERS)})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
