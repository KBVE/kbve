"""kbve-pose-pack <in.pose.ron> <out.pose.bin>

Packs a baked pose database into the binary form the game loads: rotations
and bone directions quantised to signed 16-bit, everything else float32,
little-endian. Same numbers as the RON to four decimals at a fifth of the size.
"""

from __future__ import annotations

import re
import struct
import sys
from pathlib import Path

MAGIC = b"KPOS"
VERSION = 1
Q = 32767.0

FRAME_RE = re.compile(
    r"\(root: \(([^)]*)\), pelvis: \(([^)]*)\), rotations: \[(.*?)\], directions: \[(.*?)\], "
    r"contact: \((true|false), (true|false)\)\)"
)
TUPLE_RE = re.compile(r"\(([^()]*)\)")


def _floats(s: str) -> list[float]:
    return [float(x) for x in s.split(",")]


def _tuples(s: str) -> list[list[float]]:
    return [_floats(m) for m in TUPLE_RE.findall(s)]


def read_ron(path: Path) -> tuple[list[str], list[dict]]:
    """Parses a pose.ron written by pose_bake, one frame per line."""
    bones: list[str] = []
    records: list[dict] = []
    clip: dict | None = None
    for line in path.read_text().splitlines():
        s = line.strip()
        if s.startswith("bones:"):
            bones = re.findall(r'"([^"]+)"', s)
        elif s.startswith("name:"):
            clip = {"frames": []}
            records.append(clip)
            clip["name"] = re.search(r'"([^"]*)"', s).group(1)
        elif clip is not None and s.startswith("source:"):
            clip["source"] = re.search(r'"([^"]*)"', s).group(1)
        elif clip is not None and s.startswith(("fps:", "leg_length:", "speed:", "direction:")):
            key, _, val = s.partition(":")
            clip[key] = float(val.strip().rstrip(","))
        elif s.startswith("(root:"):
            m = FRAME_RE.match(s)
            if not m or clip is None:
                raise SystemExit(f"unreadable frame line: {s[:80]}")
            rx, rz, ry = _floats(m.group(1))
            clip["frames"].append(
                {
                    "root": (rx, rz, ry),
                    "pelvis": tuple(_floats(m.group(2))),
                    "rotations": _tuples(m.group(3)),
                    "directions": _tuples(m.group(4)),
                    "contact": (m.group(5) == "true", m.group(6) == "true"),
                }
            )
    return bones, records


def _q(v: float) -> int:
    return max(-32767, min(32767, round(v * Q)))


def _str(out: bytearray, s: str) -> None:
    b = s.encode()
    out += struct.pack("<H", len(b)) + b


def write_bin(bones: list[str], records: list[dict], out: Path) -> None:
    """Writes the binary pose database; every clip's frames carry one rotation and direction per bone."""
    buf = bytearray(MAGIC + struct.pack("<IH", VERSION, len(bones)))
    for b in bones:
        _str(buf, b)
    buf += struct.pack("<I", len(records))
    n = len(bones)
    for r in records:
        _str(buf, r["name"])
        _str(buf, r["source"])
        buf += struct.pack("<ffffI", r["fps"], r["leg_length"], r["speed"], r["direction"], len(r["frames"]))
        for f in r["frames"]:
            rx, rz, ry = f["root"]
            px, py, pz = f["pelvis"]
            buf += struct.pack("<ffffff", rx, rz, ry, px, py, pz)
            rots = f["rotations"]
            dirs = f["directions"] or [(0.0, 0.0, 0.0)] * n
            if len(rots) != n or len(dirs) != n:
                raise SystemExit(f"{r['name']}: {len(rots)} rotations, {len(dirs)} directions for {n} bones")
            buf += struct.pack(f"<{4 * n}h", *(_q(c) for q in rots for c in q))
            buf += struct.pack(f"<{3 * n}h", *(_q(c) for d in dirs for c in d))
            cl, cr = f["contact"]
            buf += struct.pack("<B", int(cl) | (int(cr) << 1))
    out.write_bytes(bytes(buf))


def read_names(path: Path) -> list[str]:
    """Clip names in file order, for scripts that index the trace's clip column."""
    data = path.read_bytes()
    if data[:4] != MAGIC:
        raise SystemExit(f"not a pose.bin: {path}")
    pos = 4
    _version, nbones = struct.unpack_from("<IH", data, pos)
    pos += 6
    for _ in range(nbones):
        (ln,) = struct.unpack_from("<H", data, pos)
        pos += 2 + ln
    (nclips,) = struct.unpack_from("<I", data, pos)
    pos += 4
    names = []
    for _ in range(nclips):
        (ln,) = struct.unpack_from("<H", data, pos)
        names.append(data[pos + 2 : pos + 2 + ln].decode())
        pos += 2 + ln
        (ln,) = struct.unpack_from("<H", data, pos)
        pos += 2 + ln
        (nframes,) = struct.unpack_from("<I", data, pos + 16)
        pos += 20 + nframes * (24 + 14 * nbones + 1)
    return names


def main() -> None:
    args = sys.argv[1:]
    if len(args) != 2:
        raise SystemExit(__doc__)
    bones, records = read_ron(Path(args[0]))
    write_bin(bones, records, Path(args[1]))
    frames = sum(len(r["frames"]) for r in records)
    print(f"packed {len(records)} clips, {frames} frames -> {args[1]} ({Path(args[1]).stat().st_size / 1e6:.1f} MB)")


if __name__ == "__main__":
    main()
