#!/usr/bin/env python3
"""Procedural bush spritesheet baker.

Stamps real leaf-material photos into seeded foliage mounds, shades them with a
form normal (from the mound height field) plus the material's detail normal map,
and bakes 70 variants into the grid the client reads (10x7 of 192x192). Replaces
the earlier tree-canopy crop, which read as mini-trees. Inputs live in bush-src/
and keep their source pack numbering.
"""
import os
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "bush-src")
OUTPUT = os.path.join(
    HERE,
    "..",
    "public/assets/arcade/arpg/environment/bushes/bush_01.webp",
)

COLS = 10
ROWS = 7
CELL = 192
SS = 2                      # supersample, downsampled at the end
C = CELL * SS

LIGHT = np.array([-0.5, -0.62, 0.6])   # top-left, toward viewer (y is down)
LIGHT = LIGHT / np.linalg.norm(LIGHT)
AMBIENT = 0.62
DIFFUSE = 0.55
DETAIL_STRENGTH = 0.55     # how much the material normal perturbs the form normal
FORM_NZ = 0.30             # flatter form normal -> gentler dome shading
FLIP_NY = True             # normal-map green-channel convention

# Mound shape (fractions of C). Many small blobs -> a clean low dome, not lumps.
BASE_Y = 0.88
MOUND_HALF_W = 0.46
MOUND_H = 0.30
N_BLOBS = (26, 34)
BLOB_RX = (0.08, 0.14)
MASK_THRESHOLD = 0.06
EDGE_FEATHER = 0.06

CONTACT_SHADOW_ALPHA = 0.28


def mulberry32(seed):
    s = seed & 0xFFFFFFFF

    def nxt():
        nonlocal s
        s = (s + 0x6D2B79F5) & 0xFFFFFFFF
        t = s
        t = (t ^ (t >> 15)) * (t | 1) & 0xFFFFFFFF
        t ^= (t + ((t ^ (t >> 7)) * (t | 61) & 0xFFFFFFFF)) & 0xFFFFFFFF
        t &= 0xFFFFFFFF
        return ((t ^ (t >> 14)) & 0xFFFFFFFF) / 4294967296.0

    return nxt


def load_rgb(path):
    return np.asarray(Image.open(path).convert("RGB"), dtype=np.float32) / 255.0


def load_rgba(path):
    return np.asarray(Image.open(path).convert("RGBA"), dtype=np.float32) / 255.0


SMALL = load_rgba(os.path.join(SRC, "234_128x128.png"))[:, :, :3]
BIG_S = load_rgb(os.path.join(SRC, "BigLeafBushB_S.jpg"))
BIG_N = load_rgb(os.path.join(SRC, "BigLeafBushB_N.jpg"))


def sample_window(tex, h, w, rng):
    """Grab an h*w crop from a larger texture at a random offset."""
    th, tw = tex.shape[:2]
    if th <= h or tw <= w:
        scale = max(h / th, w / tw) * 1.05
        nt = np.asarray(
            Image.fromarray((tex * 255).astype(np.uint8)).resize(
                (int(tw * scale) + 1, int(th * scale) + 1), Image.LANCZOS
            ),
            dtype=np.float32,
        ) / 255.0
        tex = nt
        th, tw = tex.shape[:2]
    oy = int(rng() * (th - h))
    ox = int(rng() * (tw - w))
    return tex[oy:oy + h, ox:ox + w]


def tile_to(tex, h, w, rng):
    """Tile a seamless texture to h*w with a random phase offset."""
    th, tw = tex.shape[:2]
    oy = int(rng() * th)
    ox = int(rng() * tw)
    ys = (np.arange(h) + oy) % th
    xs = (np.arange(w) + ox) % tw
    return tex[np.ix_(ys, xs)]


def build_height(rng):
    """A wide low dome (the bush body) with an organic wobbly outline plus a few
    raised surface clumps so it reads as foliage, not a smooth ellipse."""
    yy, xx = np.mgrid[0:C, 0:C].astype(np.float32)
    cx = C * 0.5 + (rng() - 0.5) * C * 0.04
    half = C * MOUND_HALF_W * (0.90 + rng() * 0.18)
    mh = C * MOUND_H * (0.88 + rng() * 0.22)
    cy = C * BASE_Y - mh * 0.55

    ang = np.arctan2(yy - cy, xx - cx)
    p1, p2, p3 = rng() * 6.28, rng() * 6.28, rng() * 6.28
    wob = (1.0 + 0.12 * np.sin(ang * 4 + p1)
           + 0.08 * np.sin(ang * 7 + p2)
           + 0.05 * np.sin(ang * 11 + p3))
    rx = (xx - cx) / half
    ry = (yy - cy) / mh
    r = np.sqrt(rx * rx + ry * ry) / wob
    h = np.clip(1.0 - r, 0.0, 1.0)

    n = int(rng() * (N_BLOBS[1] - N_BLOBS[0]) + N_BLOBS[0])
    for _ in range(n):
        a = rng() * 6.28318
        rad = rng() ** 0.5
        bx = cx + np.cos(a) * rad * half * 0.8
        by = cy - abs(np.sin(a)) * rad * mh * 0.7
        br = C * (BLOB_RX[0] + rng() * (BLOB_RX[1] - BLOB_RX[0]))
        dx = (xx - bx) / br
        dy = (yy - by) / (br * 0.85)
        h += 0.22 * np.exp(-(dx * dx + dy * dy))

    h[yy > C * BASE_Y] = 0.0
    if h.max() > 0:
        h /= h.max()
    return h


def form_normal(h):
    gy, gx = np.gradient(h)
    nx = -gx
    ny = -gy
    nz = np.full_like(h, FORM_NZ)
    ln = np.sqrt(nx * nx + ny * ny + nz * nz) + 1e-6
    return np.dstack([nx / ln, ny / ln, nz / ln])


def detail_normal(nmap):
    n = nmap * 2.0 - 1.0
    if FLIP_NY:
        n[:, :, 1] *= -1.0
    ln = np.sqrt((n * n).sum(axis=2, keepdims=True)) + 1e-6
    return n / ln


def shade(albedo, normal, h):
    diff = np.clip((normal * LIGHT).sum(axis=2), 0.0, 1.0)
    bright = AMBIENT + DIFFUSE * diff
    ramp = 0.85 + 0.28 * h
    bright = bright * ramp
    out = albedo * bright[:, :, None]
    return np.clip(out, 0.0, 1.0)


def make_cell(seed):
    rng = mulberry32(seed)
    h = build_height(rng)
    fn = form_normal(h)

    k = int(rng() * 4)
    albedo = np.rot90(tile_to(SMALL, C, C, rng), k)
    dn = detail_normal(np.rot90(sample_window(BIG_N, C, C, rng), k))
    nrm = fn.copy()
    nrm[:, :, 0] += DETAIL_STRENGTH * dn[:, :, 0]
    nrm[:, :, 1] += DETAIL_STRENGTH * dn[:, :, 1]
    ln = np.sqrt((nrm * nrm).sum(axis=2, keepdims=True)) + 1e-6
    nrm = nrm / ln

    tint = np.array([
        0.60 + rng() * 0.18,
        0.92 + rng() * 0.20,
        0.55 + rng() * 0.18,
    ], dtype=np.float32)
    albedo = np.clip(albedo * tint, 0.0, 1.0)

    rgb = shade(albedo, nrm, h)

    a = np.clip((h - MASK_THRESHOLD) / EDGE_FEATHER, 0.0, 1.0)
    edge = (a > 0.0) & (a < 0.6)
    rgb[edge] *= 0.82

    cell = np.zeros((C, C, 4), dtype=np.float32)

    sy, sx = np.mgrid[0:C, 0:C].astype(np.float32)
    scx = C * 0.5
    scy = C * (BASE_Y + 0.03)
    sh = np.exp(-(((sx - scx) / (C * 0.26)) ** 2 +
                ((sy - scy) / (C * 0.045)) ** 2))
    cell[:, :, 3] = sh * CONTACT_SHADOW_ALPHA

    cell[:, :, :3] = cell[:, :, :3] * (1 - a[:, :, None]) + rgb * a[:, :, None]
    cell[:, :, 3] = cell[:, :, 3] * (1 - a) + a

    img = Image.fromarray((np.clip(cell, 0, 1) * 255).astype(np.uint8), "RGBA")
    return img.resize((CELL, CELL), Image.LANCZOS)


def main():
    os.makedirs(os.path.dirname(OUTPUT), exist_ok=True)
    sheet = Image.new("RGBA", (COLS * CELL, ROWS * CELL), (0, 0, 0, 0))
    for row in range(ROWS):
        for col in range(COLS):
            seed = row * COLS + col
            sheet.alpha_composite(make_cell(seed), (col * CELL, row * CELL))
    sheet.save(OUTPUT, "WEBP", lossless=True)
    print(f"output size: {sheet.size[0]}x{sheet.size[1]}")


if __name__ == "__main__":
    main()
