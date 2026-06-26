#!/usr/bin/env python3
"""Bake the ship's per-facing collision data from its sprite sheet.

The ship is a 4x4 sheet of 16 facing frames (model_sprites.py). Two outputs,
both indexed by facing == frame == the `sub`/`FurnitureRot` byte the server streams:

  SHIP_FOOTPRINTS  per-facing tile offsets the hull covers — used for coarse tile
                   blocking (NPC pathfinding, WalkableMap).
  SHIP_COLLIDERS   per-facing oriented bounding box {cx, cy, angle, hx, hy} in TILE
                   units (offsets from the base tile) — the smooth float collision
                   shape. A player circle is pushed out of this box each tick, so
                   movement slides along the hull instead of snapping to a tile grid.

Both project the sprite-hull alpha to ground tiles the same way the client draws the
env sprite (entities/env.ts + systems/entityView.ts + iso.ts): anchored at
worldToScreen(tile)+(0,+8), origin (0.5, ORIGIN_Y), scaled to DISPLAY px. The OBB is
the tightest box around the projected opaque-pixel cloud, oriented along its PCA axes.

Writes TWO generated files (one bake, two languages — never hand-edit):
  - apps/agones/arpg/web/src/game/entities/shipFootprint.generated.ts
  - apps/agones/arpg/server/src/ship_footprint_gen.rs

Regen (from anywhere in the repo): uv run kbve-ship-footprint
"""
import math
import os

from PIL import Image

from kbve.sprite._paths import arpg_web, repo_root

# Resolved in main() once the repo root is known (run from anywhere in the tree).
SHEET = None
TS_OUT = None
RS_OUT = None
PX = None
F = None

# Must match env.ts SHIP_ENV + iso.ts + entityView.ts.
TILE_W, TILE_H = 64, 32
DISPLAY = 384      # SHIP_ENV.displayWidth/Height
ORIGIN_Y = 0.52    # SHIP_ENV.originY
Y_NUDGE = 8        # entityView sprite y+8
ALPHA_T = 40       # opaque threshold
RANGE = 7          # tile search radius around base (footprint)
PIX_STEP = 4       # pixel sampling stride for the OBB cloud

GEN_BY = "kbve-ship-footprint (packages/python/kbve/kbve/sprite/ship_footprint.py)"


def open_sheet():
    im = Image.open(SHEET).convert("RGBA")
    W, _ = im.size
    f = W // 4
    return im.load(), f


def _proj():
    """Forward (tile->sprite px) and inverse (sprite px->tile) projection."""
    scale = F / DISPLAY
    tl_x = -DISPLAY * 0.5
    tl_y = Y_NUDGE - DISPLAY * ORIGIN_Y

    def tile_to_px(dx, dy):
        offx = (dx - dy) * (TILE_W / 2)
        offy = (dx + dy) * (TILE_H / 2)
        return (offx - tl_x) * scale, (offy - tl_y) * scale

    def px_to_tile(lx, ly):
        offx = lx / scale + tl_x
        offy = ly / scale + tl_y
        a = offx / (TILE_W / 2)
        b = offy / (TILE_H / 2)
        return (a + b) / 2.0, (b - a) / 2.0

    return tile_to_px, px_to_tile


def bake_footprints():
    tile_to_px, _ = _proj()

    def covered(f, dx, dy):
        lx, ly = tile_to_px(dx, dy)
        if lx < 0 or ly < 0 or lx >= F or ly >= F:
            return False
        ox, oy = (f % 4) * F, (f // 4) * F
        return PX[ox + int(lx), oy + int(ly)][3] >= ALPHA_T

    facings = []
    for f in range(16):
        tiles = [
            (dx, dy)
            for dy in range(-RANGE, RANGE + 1)
            for dx in range(-RANGE, RANGE + 1)
            if covered(f, dx, dy)
        ]
        if not tiles:
            tiles = [(0, 0)]
        facings.append(tiles)
    return facings


def bake_colliders():
    """Per-facing tightest oriented box around the hull's ground-projected pixels."""
    _, px_to_tile = _proj()
    out = []
    for f in range(16):
        ox, oy = (f % 4) * F, (f // 4) * F
        pts = []
        for ly in range(0, F, PIX_STEP):
            for lx in range(0, F, PIX_STEP):
                if PX[ox + lx, oy + ly][3] >= ALPHA_T:
                    pts.append(px_to_tile(lx, ly))
        if not pts:
            out.append((0.0, 0.0, 0.0, 0.5, 0.5))
            continue
        n = len(pts)
        mx = sum(p[0] for p in pts) / n
        my = sum(p[1] for p in pts) / n
        sxx = sum((p[0] - mx) ** 2 for p in pts) / n
        syy = sum((p[1] - my) ** 2 for p in pts) / n
        sxy = sum((p[0] - mx) * (p[1] - my) for p in pts) / n
        # Principal-axis angle of the 2x2 covariance.
        angle = 0.5 * math.atan2(2 * sxy, sxx - syy)
        ca, sa = math.cos(angle), math.sin(angle)
        # Tight half-extents = max abs projection onto each principal axis.
        hx = max(abs((p[0] - mx) * ca + (p[1] - my) * sa) for p in pts)
        hy = max(abs(-(p[0] - mx) * sa + (p[1] - my) * ca) for p in pts)
        out.append((mx, my, angle, hx, hy))
    return out


def _cloud(f):
    """Hull's ground-projected opaque-pixel points (tile space) for facing `f`."""
    _, px_to_tile = _proj()
    ox, oy = (f % 4) * F, (f // 4) * F
    pts = []
    for ly in range(0, F, PIX_STEP):
        for lx in range(0, F, PIX_STEP):
            if PX[ox + lx, oy + ly][3] >= ALPHA_T:
                pts.append(px_to_tile(lx, ly))
    return pts


def _convex_hull(pts):
    """CCW convex hull (monotone chain), with positive signed area in tile coords."""
    pts = sorted(set((round(x, 3), round(y, 3)) for x, y in pts))
    if len(pts) < 3:
        return pts

    def cross(o, a, b):
        return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])

    lower = []
    for p in pts:
        while len(lower) >= 2 and cross(lower[-2], lower[-1], p) <= 0:
            lower.pop()
        lower.append(p)
    upper = []
    for p in reversed(pts):
        while len(upper) >= 2 and cross(upper[-2], upper[-1], p) <= 0:
            upper.pop()
        upper.append(p)
    hull = lower[:-1] + upper[:-1]
    # Ensure positive signed area (CCW in (x,y) tile coords) so the runtime can assume
    # interior-is-left and outward-normal = right-of-edge.
    area = 0.0
    for i in range(len(hull)):
        x1, y1 = hull[i]
        x2, y2 = hull[(i + 1) % len(hull)]
        area += x1 * y2 - x2 * y1
    if area < 0:
        hull.reverse()
    return hull


def bake_hulls():
    """Per-facing convex hull of the hull silhouette (tile units, offset from base)."""
    out = []
    for f in range(16):
        hull = _convex_hull(_cloud(f))
        if len(hull) < 3:
            hull = [(-0.5, -0.5), (0.5, -0.5), (0.0, 0.5)]
        out.append(hull)
    return out


def _fmt(v):
    return f"{v:.4f}"


def write_ts(footprints, colliders, hulls):
    fp = "\n".join(
        "\t[" + ", ".join(f"[{dx}, {dy}]" for dx, dy in t) + f"], // facing {f}"
        for f, t in enumerate(footprints)
    )
    co = "\n".join(
        "\t{ cx: %s, cy: %s, angle: %s, hx: %s, hy: %s }, // facing %d"
        % (_fmt(c[0]), _fmt(c[1]), _fmt(c[2]), _fmt(c[3]), _fmt(c[4]), f)
        for f, c in enumerate(colliders)
    )
    out = (
        f"// <auto-generated/> by {GEN_BY}\n"
        "// Per-facing ship collision data, indexed by facing (sub/FurnitureRot 0..15).\n"
        "// MUST stay byte-identical to ship_footprint_gen.rs — one bake, two languages.\n\n"
        "// Tile offsets (dx,dy) the hull covers — coarse tile blocking (NPC pathing).\n"
        "export const SHIP_FOOTPRINTS: ReadonlyArray<\n"
        "\tReadonlyArray<readonly [number, number]>\n"
        "> = [\n"
        f"{fp}\n"
        "];\n\n"
        "// Oriented bounding box per facing (tile units, offset from base) — the smooth\n"
        "// float collision shape. cx,cy = center; angle = radians; hx,hy = half-extents.\n"
        "export interface ShipObb {\n"
        "\treadonly cx: number;\n"
        "\treadonly cy: number;\n"
        "\treadonly angle: number;\n"
        "\treadonly hx: number;\n"
        "\treadonly hy: number;\n"
        "}\n"
        "export const SHIP_COLLIDERS: ReadonlyArray<ShipObb> = [\n"
        f"{co}\n"
        "];\n\n"
        "// Convex hull polygon per facing (tile units, offset from base, CCW) — the\n"
        "// accurate float collision shape that hugs the silhouette (nose/wings/tail).\n"
        "export const SHIP_HULLS: ReadonlyArray<\n"
        "\tReadonlyArray<readonly [number, number]>\n"
        "> = [\n"
        f"{_hulls_ts(hulls)}\n"
        "];\n"
    )
    with open(TS_OUT, "w") as fh:
        fh.write(out)
    print("wrote", TS_OUT)


def _hulls_ts(hulls):
    return "\n".join(
        "\t["
        + ", ".join(f"[{_fmt(x)}, {_fmt(y)}]" for x, y in h)
        + f"], // facing {f}"
        for f, h in enumerate(hulls)
    )


def _hulls_rs(hulls):
    return "\n".join(
        "    &["
        + ", ".join(f"({_fmt(x)}, {_fmt(y)})" for x, y in h)
        + f"], // facing {f}"
        for f, h in enumerate(hulls)
    )


def write_rs(footprints, colliders, hulls):
    fp = "\n".join(
        "    &[" + ", ".join(f"({dx}, {dy})" for dx, dy in t) + f"], // facing {f}"
        for f, t in enumerate(footprints)
    )
    co = "\n".join(
        "    ShipObb { cx: %s, cy: %s, angle: %s, hx: %s, hy: %s }, // facing %d"
        % (_fmt(c[0]), _fmt(c[1]), _fmt(c[2]), _fmt(c[3]), _fmt(c[4]), f)
        for f, c in enumerate(colliders)
    )
    out = (
        f"// <auto-generated/> by {GEN_BY}\n"
        "// Per-facing ship collision data, indexed by facing (sub/FurnitureRot 0..15).\n"
        "// MUST stay byte-identical to shipFootprint.generated.ts — one bake, two langs.\n\n"
        "// Tile offsets (dx,dy) the hull covers — coarse tile blocking (NPC pathing).\n"
        "pub static SHIP_FOOTPRINTS: [&[(i32, i32)]; 16] = [\n"
        f"{fp}\n"
        "];\n\n"
        "// Oriented bounding box per facing (tile units, offset from base) — the smooth\n"
        "// float collision shape. cx,cy = center; angle = radians; hx,hy = half-extents.\n"
        "#[derive(Clone, Copy)]\n"
        "pub struct ShipObb {\n"
        "    pub cx: f32,\n"
        "    pub cy: f32,\n"
        "    pub angle: f32,\n"
        "    pub hx: f32,\n"
        "    pub hy: f32,\n"
        "}\n"
        "pub static SHIP_COLLIDERS: [ShipObb; 16] = [\n"
        f"{co}\n"
        "];\n\n"
        "// Convex hull polygon per facing (tile units, offset from base, CCW) — the\n"
        "// accurate float collision shape that hugs the silhouette (nose/wings/tail).\n"
        "pub static SHIP_HULLS: [&[(f32, f32)]; 16] = [\n"
        f"{_hulls_rs(hulls)}\n"
        "];\n"
    )
    with open(RS_OUT, "w") as fh:
        fh.write(out)
    print("wrote", RS_OUT)


def main():
    global SHEET, TS_OUT, RS_OUT, PX, F
    root = repo_root()
    web = arpg_web()
    SHEET = os.path.join(web, "public/assets/arcade/arpg/environment/structures/ship/ship.png")
    TS_OUT = os.path.join(web, "src/game/entities/shipFootprint.generated.ts")
    RS_OUT = os.path.join(root, "apps/agones/arpg/server/src/ship_footprint_gen.rs")

    PX, F = open_sheet()
    footprints = bake_footprints()
    colliders = bake_colliders()
    hulls = bake_hulls()
    print("footprint tiles/facing:", ", ".join(str(len(t)) for t in footprints))
    print("hull verts/facing:    ", ", ".join(str(len(h)) for h in hulls))
    write_ts(footprints, colliders, hulls)
    write_rs(footprints, colliders, hulls)


if __name__ == "__main__":
    main()
