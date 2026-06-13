#!/usr/bin/env python3
"""Procedural grid dungeon -> mapdb GridTilemap JSON.

Seed-driven rooms + L-corridors, guaranteed connected. Emits the same
proto-canonical GridTilemap shape as gen-tilemaps.mjs, so simgrid
(WalkableMap::from_grid_tilemap_json) and the game client consume it
unchanged. This is the procedural foundation: dungeons are just a
GridTilemap with generation=FINITE_PROCEDURAL + a seed.

Usage: python3 gen_dungeon.py [--seed N] [--out PATH] [--ref slug] [--name "..."]
"""
import argparse
import json
import os
import random

# Real cloud_tileset gids sampled from cloud_city (floor=common ground,
# wall=common edge tile) so the dungeon renders with the live atlas.
FLOOR_GID = 368
WALL_GID = 363
TILE_SIZE = 16
TILESET_IMAGE = "cloud_tileset.png"
TILESET_COLUMNS = 45


def gen(seed, width=48, height=48, max_rooms=14, rmin=4, rmax=9):
    rng = random.Random(seed)
    blocked = [True] * (width * height)  # start solid
    rooms = []  # (x, y, w, h)

    def carve(x, y):
        if 0 <= x < width and 0 <= y < height:
            blocked[y * width + x] = False

    def carve_room(rx, ry, rw, rh):
        for yy in range(ry, ry + rh):
            for xx in range(rx, rx + rw):
                carve(xx, yy)

    def h_corridor(x1, x2, y):
        for x in range(min(x1, x2), max(x1, x2) + 1):
            carve(x, y)

    def v_corridor(y1, y2, x):
        for y in range(min(y1, y2), max(y1, y2) + 1):
            carve(x, y)

    for _ in range(max_rooms):
        rw = rng.randint(rmin, rmax)
        rh = rng.randint(rmin, rmax)
        rx = rng.randint(1, width - rw - 1)
        ry = rng.randint(1, height - rh - 1)
        # reject heavy overlap (allow light overlap for organic shapes)
        new = (rx, ry, rw, rh)
        overlap = any(
            rx < ox + ow + 1 and rx + rw + 1 > ox and ry < oy + oh + 1 and ry + rh + 1 > oy
            for (ox, oy, ow, oh) in rooms
        )
        if overlap and rooms:
            continue
        carve_room(rx, ry, rw, rh)
        cx, cy = rx + rw // 2, ry + rh // 2
        if rooms:
            # connect to previous room centre with an L corridor (keeps the
            # whole dungeon reachable)
            px, py = rooms[-1][0] + \
                rooms[-1][2] // 2, rooms[-1][1] + rooms[-1][3] // 2
            if rng.random() < 0.5:
                h_corridor(px, cx, py)
                v_corridor(py, cy, cx)
            else:
                v_corridor(py, cy, px)
                h_corridor(px, cx, cy)
        rooms.append(new)

    first = rooms[0]
    spawn = {"x": first[0] + first[2] // 2, "y": first[1] + first[3] // 2}

    base = [WALL_GID if blocked[i]
            else FLOOR_GID for i in range(width * height)]
    regions = [
        {"name": f"Chamber {i + 1}",
            "x": r[0], "y": r[1], "w": r[2], "h": r[3]}
        for i, r in enumerate(rooms)
    ]
    return {
        "ref": None,
        "name": None,
        "width": width,
        "height": height,
        "tileSize": TILE_SIZE,
        "spawn": spawn,
        "blocked": blocked,
        "layers": [{"name": "floor", "data": base}],
        "regions": regions,
        "tilesetImage": TILESET_IMAGE,
        "tilesetColumns": TILESET_COLUMNS,
        "generation": "GENERATION_FINITE_PROCEDURAL",
        "seed": seed,
        "drafted": False,
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--seed", type=int, default=1337)
    ap.add_argument("--ref", default="crypt-depths")
    ap.add_argument("--name", default="Crypt Depths")
    ap.add_argument(
        "--out",
        default="packages/data/codegen/generated/tilemaps/crypt_depths.tilemap.json",
    )
    args = ap.parse_args()

    tm = gen(args.seed)
    tm["ref"] = args.ref
    tm["name"] = args.name

    rooms = len(tm["regions"])
    floors = sum(1 for b in tm["blocked"] if not b)
    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    with open(args.out, "w") as f:
        f.write(json.dumps(tm) + "\n")
    print(
        f"Wrote {args.out} ({tm['width']}x{tm['height']}, seed={args.seed}, "
        f"{rooms} rooms, {floors} floor tiles, spawn={tm['spawn']})"
    )


if __name__ == "__main__":
    main()
