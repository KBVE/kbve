"""kbve-blender-gait --clip name=<fbx|glb> [...] --out <gait.ron>"""

from __future__ import annotations

import math
import sys
from pathlib import Path

import bpy
from mathutils import Quaternion, Vector

SAMPLES = 32
CONTACT_ENTER = 0.03
CONTACT_LEAVE = 0.07
BENT_DEGREES = 25.0

LEG = ("thigh", "calf", "foot")
ARM = ("upperarm", "lowerarm", "hand")


def argv() -> list[str]:
    return sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []


def load(path: Path) -> bpy.types.Object:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    suffix = path.suffix.lower()
    if suffix == ".fbx":
        bpy.ops.import_scene.fbx(filepath=str(path), use_anim=True, ignore_leaf_bones=True)
    elif suffix in (".glb", ".gltf"):
        bpy.ops.import_scene.gltf(filepath=str(path))
    else:
        raise SystemExit(f"unsupported source: {path}")
    arms = [o for o in bpy.data.objects if o.type == "ARMATURE"]
    if not arms:
        raise SystemExit(f"no armature in {path}")
    return arms[0]


class Clip:
    def __init__(self, arm: bpy.types.Object) -> None:
        scene = bpy.context.scene
        action = arm.animation_data.action
        first, last = (int(action.frame_range[0]), int(action.frame_range[1]))
        self.fps = scene.render.fps / scene.render.fps_base
        self.frames = last - first + 1
        self.pos: dict[str, list[Vector]] = {}
        self.rot: dict[str, list[Quaternion]] = {}
        names = [b.name for b in arm.pose.bones]
        for name in names:
            self.pos[name] = []
            self.rot[name] = []
        for frame in range(first, last + 1):
            scene.frame_set(frame)
            for name in names:
                world = arm.matrix_world @ arm.pose.bones[name].matrix
                self.pos[name].append(world.translation.copy())
                self.rot[name].append(world.to_quaternion())

    def bone(self, stem: str, side: str) -> str:
        name = f"{stem}_{side}"
        if name not in self.pos:
            raise SystemExit(f"bone {name} missing")
        return name


def flexion(clip: Clip, chain: tuple[str, str, str], side: str) -> list[float]:
    root, mid, tip = (clip.bone(stem, side) for stem in chain)
    out = []
    for i in range(clip.frames):
        a = clip.pos[root][i] - clip.pos[mid][i]
        b = clip.pos[tip][i] - clip.pos[mid][i]
        interior = a.angle(b)
        out.append(math.degrees(math.pi - interior))
    return out


def contacts(height: list[float]) -> list[bool]:
    down = height[0] < CONTACT_ENTER
    first = []
    for h in height:
        if down and h > CONTACT_LEAVE:
            down = False
        elif not down and h < CONTACT_ENTER:
            down = True
        first.append(down)
    down = first[-1]
    out = []
    for h in height:
        if down and h > CONTACT_LEAVE:
            down = False
        elif not down and h < CONTACT_ENTER:
            down = True
        out.append(down)
    return out


def onsets(contact: list[bool]) -> list[int]:
    n = len(contact)
    return [i for i in range(n) if contact[i] and not contact[i - 1]]


def resample(values: list[float], start: int, period: float) -> list[float]:
    n = len(values)
    out = []
    for k in range(SAMPLES):
        t = start + period * k / SAMPLES
        i = int(math.floor(t)) % n
        f = t - math.floor(t)
        out.append(values[i] * (1 - f) + values[(i + 1) % n] * f)
    return out


def average(curves: list[list[float]]) -> list[float]:
    return [sum(c[k] for c in curves) / len(curves) for k in range(SAMPLES)]


def fit(name: str, source: str, clip: Clip) -> dict:
    thigh = (clip.pos["thigh_l"][0] - clip.pos["calf_l"][0]).length
    shin = (clip.pos["calf_l"][0] - clip.pos["foot_l"][0]).length
    leg = thigh + shin
    pelvis = clip.pos["pelvis"]
    travel = pelvis[-1] - pelvis[0]
    seconds = clip.frames / clip.fps
    speed = travel.length / seconds
    forward = travel.normalized() if travel.length > 0.05 else Vector((0.0, -1.0, 0.0))
    ground = min(p.z for side in "lr" for p in clip.pos[f"foot_{side}"])

    feet = {}
    for side in "lr":
        ankle = clip.pos[f"foot_{side}"]
        height = [p.z - ground for p in ankle]
        contact = contacts(height)
        feet[side] = (height, contact, onsets(contact))

    knee = [flexion(clip, LEG, s) for s in "lr"]
    elbow = [flexion(clip, ARM, s) for s in "lr"]
    record = {
        "name": name,
        "source": source,
        "leg_length": leg,
        "speed": speed,
        "knee_flexion": (min(min(k) for k in knee), max(max(k) for k in knee)),
        "elbow_flexion": (min(min(e) for e in elbow), max(max(e) for e in elbow)),
    }

    left_onsets = feet["l"][2]
    if len(left_onsets) < 2 or speed < 0.05:
        flat = [0.0] * SAMPLES
        record.update(stride_period=0.0, duty=1.0, offset_r=0.5, lift=flat, swing=flat, bob=flat)
        return record

    gaps = [b - a for a, b in zip(left_onsets, left_onsets[1:])]
    period = sum(gaps) / len(gaps)
    record["stride_period"] = period / clip.fps
    record["duty"] = sum(feet["l"][1]) / clip.frames

    right_onsets = feet["r"][2]
    offsets = []
    for start in left_onsets:
        later = [r for r in right_onsets if r > start]
        if later:
            offsets.append(((later[0] - start) / period) % 1.0)
    record["offset_r"] = sum(offsets) / len(offsets) if offsets else 0.5

    mean_height = sum(p.z for p in pelvis) / clip.frames
    lift, swing, bob = [], [], []
    ankle = clip.pos["foot_l"]
    for start in left_onsets[:-1]:
        lift.append(resample([h / leg for h in feet["l"][0]], start, period))
        swing.append(resample([(ankle[i] - pelvis[i]).dot(forward) / leg for i in range(clip.frames)], start, period))
        bob.append(resample([(p.z - mean_height) / leg for p in pelvis], start, period))
    record["lift"] = average(lift)
    record["swing"] = average(swing)
    record["bob"] = average(bob)
    return record


def ron_list(values: list[float]) -> str:
    return "[" + ", ".join(f"{v:.3f}" for v in values) + "]"


def ron(records: list[dict]) -> str:
    lines = ["("]
    lines.append("    gaits: [")
    for r in records:
        lines.append("        (")
        lines.append(f'            name: "{r["name"]}",')
        lines.append(f'            source: "{r["source"]}",')
        lines.append(f"            leg_length: {r['leg_length']:.4f},")
        lines.append(f"            speed: {r['speed']:.3f},")
        lines.append(f"            stride_period: {r['stride_period']:.3f},")
        lines.append(f"            duty: {r['duty']:.3f},")
        lines.append(f"            offset_r: {r['offset_r']:.3f},")
        lines.append(f"            knee_flexion: ({r['knee_flexion'][0]:.1f}, {r['knee_flexion'][1]:.1f}),")
        lines.append(f"            elbow_flexion: ({r['elbow_flexion'][0]:.1f}, {r['elbow_flexion'][1]:.1f}),")
        lines.append(f"            lift: {ron_list(r['lift'])},")
        lines.append(f"            swing: {ron_list(r['swing'])},")
        lines.append(f"            bob: {ron_list(r['bob'])},")
        lines.append("        ),")
    lines.append("    ],")
    lines.append(")")
    return "\n".join(lines) + "\n"


def main() -> None:
    args = argv()
    out = Path(args[-1])
    records = []
    for spec in args[:-1]:
        name, _, path = spec.partition("=")
        source = Path(path)
        clip = Clip(load(source))
        records.append(fit(name, source.stem, clip))
        print(f"gait {name}: {source.name} {clip.frames} frames")
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(ron(records))
    print(f"wrote {out}")


if __name__ == "__main__":
    main()
