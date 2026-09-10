"""kbve-blender-pose --clip name=<fbx|glb> [...] --out <pose.ron>

Bakes body joint rotations per frame into a rig-independent pose database:
each bone's rotation as a delta from its own rest orientation, in a canonical
character frame (Y up, facing +Z), so the same numbers retarget onto any humanoid
whose rest pose stands straight.
"""

from __future__ import annotations

import math
import sys
from pathlib import Path

import bpy
from mathutils import Matrix, Quaternion, Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
from gait_bake import Clip, argv, contacts, load, stance_level  # noqa: E402

ROLES = [
    "pelvis",
    "thigh_l",
    "calf_l",
    "foot_l",
    "ball_l",
    "thigh_r",
    "calf_r",
    "foot_r",
    "ball_r",
    "chest",
    "neck",
    "head",
    "clavicle_l",
    "upperarm_l",
    "lowerarm_l",
    "hand_l",
    "clavicle_r",
    "upperarm_r",
    "lowerarm_r",
    "hand_r",
]
CHILD = {
    "thigh_l": "calf_l",
    "calf_l": "foot_l",
    "foot_l": "ball_l",
    "thigh_r": "calf_r",
    "calf_r": "foot_r",
    "foot_r": "ball_r",
    "upperarm_l": "lowerarm_l",
    "lowerarm_l": "hand_l",
    "upperarm_r": "lowerarm_r",
    "lowerarm_r": "hand_r",
}
TURN_DEG = 30.0
HEADING_WINDOW = 0.5
BONE_FOR = {"chest": ["spine_05", "spine_04", "spine_03"], "neck": ["neck_01"], "head": ["head", "neck_02"]}


def bone_for(role: str, clip: Clip) -> str:
    """The skeleton bone a role reads from: the highest spine present is the chest."""
    for name in BONE_FOR.get(role, [role]):
        for actual in clip.pos:
            if actual.lower() == name.lower():
                return actual
    raise SystemExit(f"no bone for {role}")


CANON = Matrix(((1.0, 0.0, 0.0), (0.0, 0.0, 1.0), (0.0, -1.0, 0.0)))
CANON_T = CANON.transposed()


def to_canon_vec(v: Vector) -> Vector:
    return CANON @ v


def to_canon_quat(q: Quaternion) -> Quaternion:
    return (CANON @ q.to_matrix() @ CANON_T).to_quaternion()


def rest_world(arm: bpy.types.Object) -> dict[str, Quaternion]:
    """Bind orientation per bone in armature space; the object transform is left out because some captures rotate it."""
    out = {}
    for bone in arm.data.bones:
        out[bone.name] = bone.matrix_local.to_quaternion()
    return out


def bake(name: str, source: str, arm: bpy.types.Object) -> dict:
    clip = Clip(arm)
    rest = rest_world(arm)
    bone = {role: bone_for(role, clip) for role in ROLES}
    n = clip.frames
    thigh = (clip.pos["thigh_l"][0] - clip.pos["calf_l"][0]).length
    shin = (clip.pos["calf_l"][0] - clip.pos["foot_l"][0]).length
    leg = thigh + shin
    root = clip.pos["root"] if "root" in clip.pos else clip.pos["pelvis"]
    travel = root[-1] - root[0]
    seconds = n / clip.fps
    speed = travel.length / seconds
    forward = Vector((0.0, -1.0, 0.0))
    up = Vector((0.0, 0.0, 1.0))
    right = forward.cross(up)
    direction = math.degrees(math.atan2(travel.dot(right), travel.dot(forward))) if speed > 0.05 else 0.0
    ground = stance_level(clip, speed)

    feet = {}
    for side in "lr":
        ankle = clip.pos[f"foot_{side}"]
        ball = clip.pos[f"ball_{side}"]
        lowest = min(p.z for p in ankle)
        ball_lowest = min(p.z for p in ball)
        feet[side] = contacts(
            [([p.z - lowest for p in ankle], ankle), ([p.z - ball_lowest for p in ball], ball)],
            clip.fps,
            speed,
        )

    segments = {role: (bone[role], bone[child]) for role, child in CHILD.items()}
    segments["chest"] = (bone_for("spine_01", clip), bone["neck"])
    segments["neck"] = (bone["neck"], bone["head"])
    headings = body_headings(clip, rest, forward, right)
    turning = abs(headings[-1] - headings[0]) > TURN_DEG
    facing = sum(headings) / n if speed < 0.05 and not turning else 0.0
    frames = []
    for i in range(n):
        r = root[i]
        heading = headings[i] - facing
        unturn = Matrix.Rotation(math.radians(heading if turning else facing), 3, up)
        hips = (clip.pos["thigh_l"][i] + clip.pos["thigh_r"][i]) / 2
        rel = to_canon_vec(unturn @ Vector((hips.x - r.x, hips.y - r.y, hips.z - ground))) / leg
        rots = []
        dirs = []
        for role in ROLES:
            delta = unturn @ (clip.rot[bone[role]][i] @ rest[bone[role]].inverted()).to_matrix()
            q = to_canon_quat(delta.to_quaternion()).normalized()
            rots.append((q.w, q.x, q.y, q.z))
            seg = segments.get(role)
            if seg:
                d = to_canon_vec(unturn @ (clip.pos[seg[1]][i] - clip.pos[seg[0]][i])).normalized()
            else:
                d = Vector((0.0, 0.0, 0.0))
            dirs.append((d.x, d.y, d.z))
        pos = to_canon_vec(Vector((r.x - root[0].x, r.y - root[0].y, 0.0)))
        frames.append(
            {
                "root": (pos.x, pos.z, heading),
                "pelvis": (rel.x, rel.y, rel.z),
                "rotations": rots,
                "directions": dirs,
                "contact": (feet["l"][i], feet["r"][i]),
            }
        )
    return {
        "name": name,
        "source": source,
        "fps": clip.fps,
        "leg_length": leg,
        "speed": speed,
        "direction": direction,
        "frames": frames,
    }


def body_headings(clip: Clip, rest: dict[str, Quaternion], forward: Vector, right: Vector) -> list[float]:
    """Pelvis facing per frame, degrees right positive, unwrapped and low-passed so sway stays in the pose.

    The window shrinks toward the ends so the first and last frames are exact.
    """
    n = clip.frames
    raw = []
    for i in range(n):
        f = (clip.rot["pelvis"][i] @ rest["pelvis"].inverted()) @ forward
        raw.append(math.degrees(math.atan2(f.dot(right), f.dot(forward))))
    unwrapped = [raw[0]]
    for h in raw[1:]:
        d = (h - unwrapped[-1] + 180.0) % 360.0 - 180.0
        unwrapped.append(unwrapped[-1] + d)
    half = int(clip.fps * HEADING_WINDOW)
    out = []
    for i in range(n):
        k = min(half, i, n - 1 - i)
        lo, hi = i - k, i + k + 1
        out.append(sum(unwrapped[lo:hi]) / (hi - lo))
    return out


def fmt(v: float) -> str:
    return f"{v:.4f}"


def write(records: list[dict], out: Path) -> None:
    lines = ["(", f"    bones: [{', '.join(chr(34) + r + chr(34) for r in ROLES)}],", "    clips: ["]
    for r in records:
        lines.append("        (")
        lines.append(f'            name: "{r["name"]}",')
        lines.append(f'            source: "{r["source"]}",')
        lines.append(f"            fps: {r['fps']:.1f},")
        lines.append(f"            leg_length: {r['leg_length']:.4f},")
        lines.append(f"            speed: {r['speed']:.3f},")
        lines.append(f"            direction: {r['direction']:.1f},")
        lines.append("            frames: [")
        for f in r["frames"]:
            rx, rz, ry = f["root"]
            px, py, pz = f["pelvis"]
            rots = ", ".join(f"({fmt(w)}, {fmt(x)}, {fmt(y)}, {fmt(z)})" for w, x, y, z in f["rotations"])
            dirs = ", ".join(f"({fmt(x)}, {fmt(y)}, {fmt(z)})" for x, y, z in f["directions"])
            cl, cr = f["contact"]
            lines.append(
                f"                (root: ({fmt(rx)}, {fmt(rz)}, {ry:.1f}), pelvis: ({fmt(px)}, {fmt(py)}, {fmt(pz)}), "
                f"rotations: [{rots}], directions: [{dirs}], contact: ({str(cl).lower()}, {str(cr).lower()})),"
            )
        lines.append("            ],")
        lines.append("        ),")
    lines.append("    ],")
    lines.append(")")
    out.write_text("\n".join(lines) + "\n")


def main() -> None:
    args = argv()
    if len(args) < 2:
        raise SystemExit(__doc__)
    out = Path(args[-1])
    records = []
    for spec in args[:-1]:
        name, _, path = spec.partition("=")
        if not path:
            raise SystemExit(f"expected name=<path>, got {spec}")
        arm = load(Path(path))
        records.append(bake(name, Path(path).stem, arm))
        print(f"baked {name}: {records[-1]['frames'].__len__()} frames, {records[-1]['speed']:.2f} m/s")
    write(records, out)
    print(f"wrote {out}")


main()
