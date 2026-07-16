#!/usr/bin/env python3
"""Pack local source PBR sets into the game's {color,normal,har} convention.

har channels: R=height, G=AO, B=roughness (PsxMaterial decodes POM depth as
1-R, ao=G, rough=B). Rerun after swapping source maps; flip_g inverts the
normal G channel for DirectX-style sources.
"""
from pathlib import Path
from PIL import Image, ImageOps

SIZE = 1024
HOME = Path.home()
TILES = HOME / "Downloads/Free Tiled Surface Textures"
OUT = Path(__file__).resolve().parents[2] / "public/textures/door"

SETS = [
    {
        "name": "wood17",
        "dir": HOME / "Downloads/wood_planks_17_1k",
        "color": "wood_planks_17_basecolor_1k.png",
        "normal": "wood_planks_17_normal_gl_1k.png",
        "height": "wood_planks_17_height_1k.png",
        "ao": "wood_planks_17_ambientocclusion_1k.png",
        "rough": "wood_planks_17_roughness_1k.png",
        "flip_g": False,
    },
    {
        "name": "viking",
        "dir": TILES / "Viking Tile",
        "color": "Viking Tile_BaseColor.png",
        "normal": "Viking Tile_Normal.png",
        "height": "Viking Tile_Height.png",
        "ao": "Viking Tile_AmbientOcclusion.png",
        "rough": "Viking Tile_Roughness.png",
        "flip_g": False,
    },
    {
        "name": "marble1",
        "dir": TILES / "WhiteMarbleTiles  (1)",
        "color": "WhiteMarbleTiles  (1)_BaseColor.png",
        "normal": "WhiteMarbleTiles  (1)_Normal.png",
        "height": "WhiteMarbleTiles  (1)_Height.png",
        "ao": "WhiteMarbleTiles  (1)_AmbientOcclusion.png",
        "rough": "WhiteMarbleTiles  (1)_Roughness.png",
        "flip_g": False,
    },
]


def rgb(path: Path) -> Image.Image:
    return Image.open(path).convert("RGB").resize((SIZE, SIZE), Image.LANCZOS)


def gray(path: Path) -> Image.Image:
    im = Image.open(path)
    if im.mode.startswith("I"):
        im = im.point(lambda v: v / 256).convert("L")
    else:
        im = im.convert("L")
    return im.resize((SIZE, SIZE), Image.LANCZOS)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for s in SETS:
        d = s["dir"]
        rgb(d / s["color"]).save(OUT / f"{s['name']}_color.png")
        n = rgb(d / s["normal"])
        if s["flip_g"]:
            r, g, b = n.split()
            n = Image.merge("RGB", (r, ImageOps.invert(g), b))
        n.save(OUT / f"{s['name']}_normal.png")
        har = Image.merge(
            "RGB",
            (gray(d / s["height"]), gray(d / s["ao"]), gray(d / s["rough"])),
        )
        har.save(OUT / f"{s['name']}_har.png")
        print(f"packed {s['name']}")


if __name__ == "__main__":
    main()
