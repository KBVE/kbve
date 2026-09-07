"""Lay a folder of cutout scans out as one sheet the texture ingest can read.

A scanned leaf is not a foliage pack. It is one plant on a flatbed at whatever
size the plant was, with the paper around it zeroed out rather than removed, and
there are as many of them as there were leaves. What the ingest downstream wants
is a PolyHaven-shaped set -- one sheet per map, named for the pack -- so this
exists to turn the first into the second and then get out of the way.

Nothing here is specific to ivy. A scan is a scan.

The paper is the whole reason this cannot be done with a resize. Those texels
are transparent, so nothing draws them, and it is tempting to leave them -- but
`textures.convert_set` grows the colour outward under the mask with a max
filter, and a max filter run over white paper spreads white. Every leaf would
come back rimmed. So the colour outside the mask is replaced with the colour
just inside it here, before anything downstream can average it in.
"""

import argparse
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

# Padding between cells, in texels of the finished sheet. A cell is sampled with
# bilinear filtering and mipped, so two leaves that touch bleed into each other
# at the first mip that averages across the seam.
GUTTER = 8

# How far the colour is grown past the mask. Only has to cover what the mips
# actually average across: past a few texels the leaf is smaller than the
# footprint anyway and the ingest's own dilation carries the rest.
BLEED = 24

# Coverage below which a texel's colour is not believed.
#
# Undoing the premultiply divides by the coverage, so a half-covered texel has
# its colour doubled and a tenth-covered one has it multiplied by ten. What
# those texels hold is a blend of leaf and scanner bed, so amplifying them does
# not recover the leaf -- it drives the paper in them to white, and the flood
# below then spreads that ring outward because it has no way of knowing the
# colour was never measured.
#
# Set where a texel is essentially wholly leaf. The antialiased edge keeps its
# coverage and is refilled with the colour just inside it, which is what a
# masked material wants anyway: the shape comes from the alpha, and the colour
# under it should not change as the edge fades.
TRUST = 0.9

# Width of the open applied to the coverage before anything is measured off it.
#
# A flatbed picks up dust, and a speck of dust on the glass arrives as a handful
# of fully opaque white texels sitting off on their own. They survive every step
# below -- they are opaque, so their colour is trusted, and they are not near a
# leaf, so nothing floods over them -- and end up as white grit floating beside
# the plant, which against brick is the one colour that cannot hide.
#
# An open rather than a speck filter because it is two passes of something Pillow
# already does. Radius two against leaves two thousand texels across takes
# nothing off the plant, and the petioles are an order of magnitude thicker.
DESPECKLE = 5

# What counts as scanner bed rather than plant, as luminance and saturation.
#
# Some scans keep a scrap of opaque paper -- a corner the cut missed, a fibre
# lying against the leaf -- and a scrap is not a speck, so the open above leaves
# it. Opaque, it is then trusted, and the flood carries it out across the sheet
# as a pale grey stain around the leaf it came from.
#
# Told apart from the plant by saturation, not brightness, because this is a
# variegated ivy and half these leaves have a cream margin as pale as paper.
# The margin is yellow -- saturation above a tenth -- and the bed is neutral.
# Measured across the seventeen scans the split is not close: a few hundred
# neutral texels per sheet against three quarters of a million cream ones.
PAPER_LUMINANCE = 195.0 / 255.0
PAPER_SATURATION = 0.06


def load(path: Path) -> tuple[np.ndarray, np.ndarray]:
    """One scan as colour and coverage, cropped to the leaf.

    Cropped because a scan is mostly bed: the leaf occupies a quarter to a half
    of the frame, and packing the frames rather than the leaves would spend the
    sheet on paper.
    """
    image = Image.open(path).convert("RGBA")

    data = np.asarray(image, dtype=np.float32) / 255.0
    colour, alpha = data[..., :3], data[..., 3]

    high = colour.max(axis=2)
    low = colour.min(axis=2)
    saturation = np.divide(high - low, high, out=np.zeros_like(high), where=high > 0.0)
    bed = (colour.mean(axis=2) > PAPER_LUMINANCE) & (saturation < PAPER_SATURATION)

    image.putalpha(
        Image.fromarray((np.where(bed, 0.0, alpha) * 255.0).round().astype(np.uint8))
        .filter(ImageFilter.MinFilter(DESPECKLE))
        .filter(ImageFilter.MaxFilter(DESPECKLE))
    )

    box = image.getchannel("A").getbbox()
    if box is None:
        raise ValueError(f"{path.name} is entirely transparent")
    data = np.asarray(image.crop(box), dtype=np.float32)
    return data[..., :3] / 255.0, data[..., 3:4] / 255.0


def resize(colour: np.ndarray, alpha: np.ndarray, size: tuple[int, int]):
    """Scale a cutout down without dragging the bed into it.

    Premultiplied, because a plain resize of the colour weights every texel
    equally and most of the texels around a leaf are paper. The edge comes back
    lightened by however much paper was in the footprint, which is the pale rim
    that says "cut out in a hurry" from any distance.
    """
    premultiplied = np.concatenate([colour * alpha, alpha], axis=2)

    # Area average, not Lanczos. A scan comes down by a factor of six, and a
    # windowed-sinc filter at that ratio rings: it overshoots on either side of
    # every high-contrast edge, which here means the leaf's outline. The
    # overshoot lands in both the colour and the coverage, so a texel that is a
    # twentieth covered can come back reading as wholly covered and holding a
    # colour brighter than anything in the scan -- white flecks around the leaf,
    # and streaks wherever the flood then carried them outward.
    scaled = np.asarray(
        Image.fromarray((premultiplied * 255.0).astype(np.uint8)).resize(size, Image.BOX),
        dtype=np.float32,
    ) / 255.0

    out_alpha = scaled[..., 3:4]

    # Written into zeros rather than an empty: a masked divide leaves whatever
    # was in the buffer wherever the mask is false, and "wherever the mask is
    # false" is every texel of paper on the sheet. That arrives downstream as
    # NaN, which clips to nothing in some places and to white in others.
    straight = np.zeros_like(scaled[..., :3])
    np.divide(scaled[..., :3], out_alpha, out=straight, where=out_alpha > TRUST)
    return straight, out_alpha


def unpaper(colour: np.ndarray, alpha: np.ndarray) -> np.ndarray:
    """Grow the leaf's own colour out over the paper it was cut from.

    A flood outward one texel at a time: every uncovered texel that has a covered
    neighbour takes their mean and becomes covered itself. Slower than a blur and
    the only version that is correct at a corner, because it never averages in a
    texel that is still paper.
    """
    filled = colour.copy()
    known = alpha[..., 0] > TRUST

    for _ in range(BLEED):
        if known.all():
            break

        # Padded rather than rolled. A roll is circular, so the leaves along one
        # edge of the sheet would seed the gutter along the opposite one -- and
        # the sheet is packed to its edges, so that is not a corner case.
        source = np.pad(np.where(known[..., None], filled, 0.0), ((1, 1), (1, 1), (0, 0)))
        cover = np.pad(known.astype(np.float32), 1)

        total = source[:-2, 1:-1] + source[2:, 1:-1] + source[1:-1, :-2] + source[1:-1, 2:]
        count = cover[:-2, 1:-1] + cover[2:, 1:-1] + cover[1:-1, :-2] + cover[1:-1, 2:]

        grown = (count > 0.0) & ~known
        filled[grown] = (total[grown] / count[grown][..., None])
        known |= grown

    return filled


def normal(colour: np.ndarray, strength: float) -> np.ndarray:
    """A normal map derived from how light already fell on the leaf.

    A scan ships no normal and a leaf is not flat: the veins stand proud of the
    blade and catch a moving sun, which is most of what stops a card reading as
    a sticker. The luminance is not a height field and pretending it is would be
    wrong on a photograph of anything else -- but a leaf on a flatbed is lit flat
    and evenly, so what varies across it is very nearly relief.

    Read off the flooded colour and not the coverage, which is why the flood has
    to have happened first. Weighting the luminance by alpha instead puts a cliff
    at the silhouette -- the gradient across it is then the mask rather than the
    leaf, and every leaf comes back bevelled like a button.

    OpenGL convention, green up, because the ingest flips it by default.
    """
    luma = (colour * np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)).sum(axis=2)

    dx = np.gradient(luma, axis=1) * strength
    dy = np.gradient(luma, axis=0) * strength

    vector = np.stack([-dx, dy, np.ones_like(luma)], axis=2)
    vector /= np.linalg.norm(vector, axis=2, keepdims=True)
    return vector * 0.5 + 0.5


def shelve(sizes: list[tuple[int, int]], edge: int) -> list[tuple[int, int]] | None:
    """Place cells in rows, tallest first, or say they do not fit.

    Shelf packing rather than anything cleverer because the shapes are all one
    leaf: a teardrop is about as tall as the row it sits in, so the space a
    tighter algorithm would win back is space no other leaf could use.
    """
    order = sorted(range(len(sizes)), key=lambda i: -sizes[i][1])
    placed: list[tuple[int, int]] = [(0, 0)] * len(sizes)
    x = y = row = 0

    for index in order:
        width, height = sizes[index]
        if x + width + GUTTER > edge:
            x = 0
            y += row + GUTTER
            row = 0
        if y + height + GUTTER > edge:
            return None
        placed[index] = (x, y)
        x += width + GUTTER
        row = max(row, height)

    return placed


def fit(shapes: list[tuple[int, int]], edge: int) -> tuple[float, list, list]:
    """The largest the leaves can be drawn and still all fit on one sheet.

    Searched rather than solved: the packing is a step function of the scale --
    one leaf gains a texel, a row no longer fits, and everything after it moves
    -- so there is nothing to differentiate. Twenty bisections lands well inside
    a texel.
    """
    low, high = 0.01, 1.0

    for _ in range(20):
        mid = (low + high) / 2.0
        sizes = [(max(1, round(w * mid)), max(1, round(h * mid))) for w, h in shapes]
        if shelve(sizes, edge) is None:
            high = mid
        else:
            low = mid

    sizes = [(max(1, round(w * low)), max(1, round(h * low))) for w, h in shapes]
    return low, sizes, shelve(sizes, edge)


def build(source: Path, out: Path, name: str, edge: int, strength: float) -> int:
    scans = sorted(source.glob("*.png"), key=lambda p: p.name.lower())
    if not scans:
        print(f"error: no PNG scans in {source}", file=sys.stderr)
        return 1

    print(f"packing {len(scans)} scans into {edge}x{edge}")
    leaves = [load(path) for path in scans]
    shapes = [(colour.shape[1], colour.shape[0]) for colour, _ in leaves]

    scale, sizes, origins = fit(shapes, edge)
    print(f"  scale {scale:.4f}")

    sheet_colour = np.zeros((edge, edge, 3), dtype=np.float32)
    sheet_alpha = np.zeros((edge, edge, 1), dtype=np.float32)
    cells = []

    for path, (colour, alpha), size, (x, y) in zip(scans, leaves, sizes, origins):
        small_colour, small_alpha = resize(colour, alpha, size)
        small_colour = unpaper(small_colour, small_alpha)

        width, height = size
        sheet_colour[y : y + height, x : x + width] = small_colour
        sheet_alpha[y : y + height, x : x + width] = small_alpha
        cells.append([x, y, x + width, y + height])
        print(f"  {path.stem:8s} {width:4d}x{height:4d} at {x:4d},{y:4d}")

    # The gutters are still paper-free black, and the ingest's max-filter dilate
    # would happily spread the leaves over them. That is what it is for -- but it
    # works from the colour it is given, so the colour it is given has to already
    # be the leaves' rather than the bed's.
    sheet_colour = unpaper(sheet_colour, sheet_alpha)

    out.mkdir(parents=True, exist_ok=True)
    token = f"{edge // 1024}k" if edge >= 1024 else f"{edge}"

    def save(suffix: str, data: np.ndarray):
        path = out / f"{name}_{suffix}_{token}.png"
        Image.fromarray((np.clip(data, 0.0, 1.0) * 255.0).round().astype(np.uint8)).save(path)
        print(f"  wrote {path.name}")

    save("diff", sheet_colour)
    save("alpha", np.repeat(sheet_alpha, 3, axis=2))
    save("nor_gl", normal(sheet_colour, strength))

    # Flat, and deliberately. A leaf's gloss varies with how wet it is rather
    # than with where you are on it, and a map that says otherwise is a map of
    # the scanner's lighting.
    save("rough", np.full((edge, edge, 3), 0.42, dtype=np.float32))

    cells_path = out.parent / "cells.json"
    cells_path.write_text(json.dumps(cells, indent=2) + "\n")
    print(f"  wrote {cells_path.name} ({len(cells)} cells)")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("source", type=Path, help="folder of cutout PNG scans")
    parser.add_argument("out", type=Path, help="pack textures/ directory to write")
    parser.add_argument("--name", required=True, help="pack base name, e.g. english_ivy")
    parser.add_argument("--edge", type=int, default=2048)
    parser.add_argument("--normal-strength", type=float, default=6.0)
    args = parser.parse_args(argv)

    return build(args.source, args.out, args.name, args.edge, args.normal_strength)


if __name__ == "__main__":
    raise SystemExit(main())
