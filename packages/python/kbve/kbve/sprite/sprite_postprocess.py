#!/usr/bin/env python3
"""Post-process baked sprite frames: bake a soft ground shadow, then stitch.

Runs in normal (non-Blender) python because it needs Pillow. `model_sprites.py`
shells out to it after rendering; it can also be run standalone on any dir of
`frame_NN.png` files.

The shadow is derived from each frame's own alpha silhouette — squashed toward the
contact line, offset along the light direction, blurred, and darkened — then the
ship is composited back on top. No 3D / engine dependency, so it works for any
model the baker can render.

Usage:
    uv run kbve-sprite-postprocess --dir render_flat --res 512 \
        [--shadow-alpha 0.38 --shadow-blur 0.05 --shadow-squash 0.55 \
         --shadow-dx 0.04 --shadow-dy 0.06 --no-shadow]
"""
import argparse
import glob
import math
import os

from PIL import Image, ImageFilter


def parse_args():
    p = argparse.ArgumentParser(prog="kbve-sprite-postprocess")
    p.add_argument("--dir", required=True, help="dir of frame_NN.png")
    p.add_argument("--res", type=int, required=True, help="px per frame (square)")
    p.add_argument("--cols", type=int, default=0,
                   help="sheet columns (0 = square auto). Set to anim-frames for a directions x frames grid")
    p.add_argument("--no-shadow", action="store_true", help="skip the baked shadow")
    # shadow knobs are fractions of frame size, so they scale with --res
    p.add_argument("--shadow-alpha", type=float, default=0.45, help="darkness 0..1")
    p.add_argument("--shadow-blur", type=float, default=0.06, help="blur radius / frame")
    p.add_argument("--shadow-squash", type=float, default=0.7, help="vertical flatten 0..1")
    p.add_argument("--shadow-shear", type=float, default=0.15, help="iso ground skew (x per y about base)")
    p.add_argument("--shadow-grow", type=float, default=0.05, help="dilate silhouette / frame (rim halo)")
    p.add_argument("--shadow-dx", type=float, default=0.0, help="x offset / frame (light dir)")
    p.add_argument("--shadow-dy", type=float, default=0.045, help="y offset / frame (toward bottom)")
    return p.parse_args()


def bake_shadow(im, res, alpha, blur, squash, shear, grow, dx, dy):
    """Composite a soft iso-ground shadow under one RGBA frame, return new RGBA.

    The silhouette is projected onto the isometric floor: squashed vertically AND
    sheared horizontally about the contact line (so it lies along the ground plane,
    not straight down), dilated so a soft rim haloes out past the hull (reads as a
    grounded contact pool, not a hovering drop shadow), then offset and blurred.
    """
    a = im.getchannel("A")
    bbox = a.getbbox()
    if not bbox:
        return im  # empty frame
    base = bbox[3]  # contact line = bottom of the silhouette
    odx = dx * res
    ody = dy * res
    # Affine maps output->input. Anchored at `base`:
    #   x' = x - odx - shear * (y - base)   (iso skew along the ground)
    #   y' = base + (y - ody - base) / squash   (flatten toward the floor)
    inv = 1.0 / max(squash, 0.01)
    coeffs = (
        1.0, -shear, -odx + shear * base,
        0.0, inv, base - ody * inv - base * inv,
    )
    mask = a.transform((res, res), Image.AFFINE, coeffs, resample=Image.BILINEAR)
    # dilate so the pool reads slightly larger than the (self-occluding flat) hull
    k = int(grow * res)
    if k > 0:
        mask = mask.filter(ImageFilter.MaxFilter(k * 2 + 1))
    rad = max(1.0, blur * res)
    mask = mask.filter(ImageFilter.GaussianBlur(rad))
    # scale darkness
    mask = mask.point(lambda v: int(v * alpha))
    shadow = Image.new("RGBA", (res, res), (0, 0, 0, 0))
    shadow.putalpha(mask)  # black, mask alpha
    out = Image.alpha_composite(shadow, im)
    return out


def main():
    a = parse_args()
    paths = sorted(glob.glob(os.path.join(a.dir, "frame_*.png")))
    if not paths:
        raise SystemExit("no frame_*.png in " + a.dir)

    frames = []
    for fp in paths:
        im = Image.open(fp).convert("RGBA")
        if not a.no_shadow:
            im = bake_shadow(
                im, a.res, a.shadow_alpha, a.shadow_blur, a.shadow_squash,
                a.shadow_shear, a.shadow_grow, a.shadow_dx, a.shadow_dy,
            )
            im.save(fp)  # frames carry the shadow too
        frames.append(im)

    n = len(frames)
    cols = a.cols if a.cols > 0 else math.ceil(math.sqrt(n))
    rows = math.ceil(n / cols)
    res = a.res
    sheet = Image.new("RGBA", (cols * res, rows * res), (0, 0, 0, 0))
    strip = Image.new("RGBA", (n * res, res), (0, 0, 0, 0))
    for i, im in enumerate(frames):
        r, c = divmod(i, cols)
        sheet.paste(im, (c * res, r * res))
        strip.paste(im, (i * res, 0))
    sheet.save(os.path.join(a.dir, "sheet.png"))
    strip.save(os.path.join(a.dir, "strip.png"))
    print(f"shadow={'off' if a.no_shadow else 'on'} sheet {cols}x{rows} @ {res}px + strip {n}x1")


if __name__ == "__main__":
    main()
