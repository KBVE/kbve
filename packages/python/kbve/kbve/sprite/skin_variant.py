#!/usr/bin/env python3
"""Make a "powered-down" skin variant by killing a glow color.

Masks a dominant glow hue (the green engine exhausts on the fighter skin),
desaturates it to luminance, darkens it, and tints it cool/metallic — so the
engines read as OFF. Feathered mask edges keep it seamless. Reusable on any skin:
point `--hue` at whichever channel glows.

The parked ship bakes from the "off" skin; hover/flight mode swaps back to the
original glowing skin (and its sheet).

Usage:
    uv run kbve-skin-variant --in idolknight.jpg --out idolknight_off.jpg
        [--hue green --darken 0.42 --dom 25 --min 60 --feather 1.5 --tint 0.72,0.82,1.0]
"""
import argparse

import numpy as np
from PIL import Image, ImageFilter

HUE_AXIS = {"red": 0, "green": 1, "blue": 2}


def parse_args():
    p = argparse.ArgumentParser(prog="kbve-skin-variant")
    p.add_argument("--in", dest="inp", required=True, help="source skin image")
    p.add_argument("--out", required=True, help="output skin image")
    p.add_argument("--hue", choices=list(HUE_AXIS), default="green", help="glow channel to kill")
    p.add_argument("--dom", type=float, default=25.0, help="how much the hue must beat the others")
    p.add_argument("--min", type=float, default=60.0, help="min glow-channel value to mask")
    p.add_argument("--darken", type=float, default=0.42, help="brightness kept by the off engine 0..1")
    p.add_argument("--feather", type=float, default=1.5, help="mask edge blur px")
    p.add_argument("--tint", default="0.72,0.82,1.0", help="cool metallic tint r,g,b for the off color")
    return p.parse_args()


def main():
    a = parse_args()
    tint = np.array([float(x) for x in a.tint.split(",")], dtype=float)
    im = Image.open(a.inp).convert("RGB")
    arr = np.asarray(im).astype(float)
    r, g, b = arr[..., 0], arr[..., 1], arr[..., 2]
    ax = HUE_AXIS[a.hue]
    others = [r, g, b]
    hue = others[ax]
    rest = [others[i] for i in range(3) if i != ax]
    # glow = picked channel dominates both others and is bright enough
    mask = (hue > rest[0] + a.dom) & (hue > rest[1] + a.dom) & (hue > a.min)
    mask = mask.astype(float)

    # off color: luminance, darkened, cool-tinted
    lum = 0.3 * r + 0.59 * g + 0.11 * b
    off = (lum[..., None] * a.darken) * tint
    off = np.clip(off, 0, 255)

    # feather the mask so the swap is seamless
    m = Image.fromarray((mask * 255).astype(np.uint8)).filter(
        ImageFilter.GaussianBlur(a.feather)
    )
    m = np.asarray(m).astype(float)[..., None] / 255.0

    out = arr * (1 - m) + off * m
    Image.fromarray(np.clip(out, 0, 255).astype(np.uint8)).save(a.out, quality=95)
    print(f"{a.hue} glow killed on {int(mask.sum())} px -> {a.out}")


if __name__ == "__main__":
    main()
