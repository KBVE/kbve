#!/usr/bin/env python3
"""Index pixel-art UI sheets into a frame-rect manifest.

Reads every PNG in public/ui-sheets/, finds connected non-transparent regions
(8-connected alpha islands, then gap-merged so a multi-part element collapses
into one), and writes public/ui-sheets/manifest.json mapping each sheet to its
frame rects {x, y, w, h}. The React PixelSprite renders a frame by index via
CSS background-position on the sheet — no per-frame PNGs. Tune MERGE_GAP if the
slicing over/under-merges a given sheet.

Usage: python3 scripts/crop_ui.py   (needs Pillow)
"""

import json
import sys
from collections import deque
from pathlib import Path

from PIL import Image

HERE = Path(__file__).resolve().parent.parent
SHEETS = HERE / "public" / "ui-sheets"
MANIFEST = HERE / "src" / "components" / "game" / "ui" / "pixelUiManifest.json"
ALPHA_MIN = 8
MIN_AREA = 16  # drop stray specks
MERGE_GAP = 3  # union fragments within this gap into one element

NEIGHBORS = [(-1, -1), (-1, 0), (-1, 1), (0, -1),
             (0, 1), (1, -1), (1, 0), (1, 1)]


def islands(alpha, w, h):
    seen = bytearray(w * h)
    boxes = []
    for sy in range(h):
        for sx in range(w):
            i = sy * w + sx
            if seen[i] or alpha[i] < ALPHA_MIN:
                continue
            minx = maxx = sx
            miny = maxy = sy
            area = 0
            q = deque([(sx, sy)])
            seen[i] = 1
            while q:
                x, y = q.popleft()
                area += 1
                if x < minx:
                    minx = x
                if x > maxx:
                    maxx = x
                if y < miny:
                    miny = y
                if y > maxy:
                    maxy = y
                for dx, dy in NEIGHBORS:
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < w and 0 <= ny < h:
                        j = ny * w + nx
                        if not seen[j] and alpha[j] >= ALPHA_MIN:
                            seen[j] = 1
                            q.append((nx, ny))
            if area >= MIN_AREA:
                boxes.append((minx, miny, maxx + 1, maxy + 1))
    boxes = merge_boxes(boxes, MERGE_GAP)
    # reading order: top-to-bottom, then left-to-right within a row band
    boxes.sort(key=lambda b: (b[1] // 8, b[0]))
    return boxes


def merge_boxes(boxes, pad):
    """Union boxes whose bounds (expanded by pad) overlap, so a multi-part
    element (border + fill + glyph) collapses into one frame."""
    boxes = [list(b) for b in boxes]
    changed = True
    while changed:
        changed = False
        out = []
        used = [False] * len(boxes)
        for i in range(len(boxes)):
            if used[i]:
                continue
            ax0, ay0, ax1, ay1 = boxes[i]
            for j in range(i + 1, len(boxes)):
                if used[j]:
                    continue
                bx0, by0, bx1, by1 = boxes[j]
                if (ax0 - pad < bx1 and bx0 - pad < ax1
                        and ay0 - pad < by1 and by0 - pad < ay1):
                    ax0, ay0 = min(ax0, bx0), min(ay0, by0)
                    ax1, ay1 = max(ax1, bx1), max(ay1, by1)
                    used[j] = True
                    changed = True
            used[i] = True
            out.append([ax0, ay0, ax1, ay1])
        boxes = out
    return [tuple(b) for b in boxes]


def main():
    if not SHEETS.is_dir():
        print(f"no sheets dir: {SHEETS}", file=sys.stderr)
        return 1
    manifest = {}
    for sheet in sorted(SHEETS.glob("*.png")):
        name = sheet.stem
        img = Image.open(sheet).convert("RGBA")
        w, h = img.size
        alpha = img.getchannel("A").tobytes()
        boxes = islands(alpha, w, h)
        manifest[name] = {
            "sheet": f"ui-sheets/{name}.png",
            "w": w,
            "h": h,
            "frames": [
                {"x": x0, "y": y0, "w": x1 - x0, "h": y1 - y0}
                for (x0, y0, x1, y1) in boxes
            ],
        }
        print(f"{name}: {len(boxes)} frames")
    MANIFEST.write_text(json.dumps(manifest, indent=2) + "\n")
    print(f"manifest -> {MANIFEST}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
