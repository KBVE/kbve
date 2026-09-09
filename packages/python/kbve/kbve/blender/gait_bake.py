"""kbve-blender-gait --clip name=<fbx|glb> [...] --out <gait.ron>"""

from __future__ import annotations

import math
import sys
from pathlib import Path

import bpy
from mathutils import Quaternion, Vector

SAMPLES = 32
CONTACT_HEIGHT = 0.1
STILL_FRACTION = 0.4
STILL_FLOOR = 0.25
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


def contacts(height: list[float], ankle: list[Vector], fps: float, speed: float) -> list[bool]:
    n = len(ankle)
    still = max(STILL_FLOOR, STILL_FRACTION * speed)
    out = []
    for i in range(n):
        velocity = (ankle[(i + 1) % n] - ankle[i]).length * fps
        out.append(height[i] < CONTACT_HEIGHT and velocity < still)
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
    n = clip.frames
    pelvis = clip.pos["pelvis"]
    travel = pelvis[-1] - pelvis[0]
    seconds = n / clip.fps
    speed = travel.length / seconds
    up = Vector((0.0, 0.0, 1.0))
    forward = Vector((0.0, -1.0, 0.0))
    right = forward.cross(up)
    direction = math.degrees(math.atan2(travel.dot(right), travel.dot(forward))) if speed > 0.05 else 0.0
    ground = min(p.z for side in "lr" for p in clip.pos[f"foot_{side}"])

    feet = {}
    for side in "lr":
        ankle = clip.pos[f"foot_{side}"]
        height = [p.z - ground for p in ankle]
        contact = contacts(height, ankle, clip.fps, speed)
        toe = [clip.pos[f"ball_{side}"][i] - ankle[i] for i in range(n)]
        pitch = [math.degrees(math.atan2(t.z, Vector((t.x, t.y, 0.0)).length)) for t in toe]
        planted = sorted(p for p, down in zip(pitch, contact) if down) or sorted(pitch)
        flat = planted[len(planted) // 2]
        feet[side] = {
            "height": height,
            "contact": contact,
            "onsets": onsets(contact),
            "fwd": [(ankle[i] - pelvis[i]).dot(forward) / leg for i in range(n)],
            "side": [(ankle[i] - pelvis[i]).dot(right) / leg for i in range(n)],
            "pitch": [p - flat for p in pitch],
        }

    hips = [(clip.pos["thigh_l"][i].z + clip.pos["thigh_r"][i].z) / 2 - ground for i in range(n)]
    hip_height = sum(hips) / n / leg
    pelvis_yaw, pelvis_roll = [], []
    for i in range(n):
        hip_line = clip.pos["thigh_r"][i] - clip.pos["thigh_l"][i]
        pelvis_yaw.append(math.degrees(math.atan2(hip_line.dot(forward), hip_line.dot(right))))
        span = Vector((hip_line.x, hip_line.y, 0.0)).length
        pelvis_roll.append(math.degrees(math.atan2(hip_line.z, span)))
    mean_height = sum(p.z for p in pelvis) / n
    bob = [(p.z - mean_height) / leg for p in pelvis]

    knee = [flexion(clip, LEG, s) for s in "lr"]
    elbow = [flexion(clip, ARM, s) for s in "lr"]
    record = {
        "name": name,
        "source": source,
        "direction": direction,
        "leg_length": leg,
        "speed": speed,
        "hip_height": hip_height,
        "knee_flexion": (min(min(k) for k in knee), max(max(k) for k in knee)),
        "elbow_flexion": (min(min(e) for e in elbow), max(max(e) for e in elbow)),
    }

    left_onsets = feet["l"]["onsets"]
    if len(left_onsets) < 2 or speed < 0.05:
        mean = lambda values: [sum(values) / n] * SAMPLES  # noqa: E731
        record.update(
            stride_period=0.0,
            bob=[0.0] * SAMPLES,
            pelvis_yaw=mean(pelvis_yaw),
            pelvis_roll=mean(pelvis_roll),
            feet=[
                {
                    "contact": 0.0,
                    "duty": 1.0,
                    "lift": mean(feet[s]["height"]),
                    "fwd": mean(feet[s]["fwd"]),
                    "side": mean(feet[s]["side"]),
                    "pitch": mean(feet[s]["pitch"]),
                }
                for s in "lr"
            ],
        )
        return record

    gaps = [b - a for a, b in zip(left_onsets, left_onsets[1:])]
    period = sum(gaps) / len(gaps)
    record["stride_period"] = period / clip.fps
    windows = left_onsets[:-1]
    record["bob"] = average([resample(bob, start, period) for start in windows])
    record["pelvis_yaw"] = average([resample(pelvis_yaw, start, period) for start in windows])
    record["pelvis_roll"] = average([resample(pelvis_roll, start, period) for start in windows])

    out_feet = []
    for s in "lr":
        foot = feet[s]
        phases = []
        for start in windows:
            later = [o for o in foot["onsets"] if o >= start]
            if later:
                phases.append(((later[0] - start) / period) % 1.0)
        contact = sum(phases) / len(phases) if phases else 0.0
        if s == "l":
            contact = 0.0
        out_feet.append(
            {
                "contact": contact,
                "duty": sum(foot["contact"]) / n,
                "lift": average([resample([h / leg for h in foot["height"]], start, period) for start in windows]),
                "fwd": average([resample(foot["fwd"], start, period) for start in windows]),
                "side": average([resample(foot["side"], start, period) for start in windows]),
                "pitch": average([resample(foot["pitch"], start, period) for start in windows]),
            }
        )
    record["feet"] = out_feet
    return record


def ron_list(values: list[float]) -> str:
    return "[" + ", ".join(f"{v:.3f}" for v in values) + "]"


def ron(records: list[dict]) -> str:
    lines = ["(", "    gaits: ["]
    for r in records:
        lines.append("        (")
        lines.append(f'            name: "{r["name"]}",')
        lines.append(f'            source: "{r["source"]}",')
        lines.append(f"            direction: {r['direction']:.1f},")
        lines.append(f"            leg_length: {r['leg_length']:.4f},")
        lines.append(f"            speed: {r['speed']:.3f},")
        lines.append(f"            hip_height: {r['hip_height']:.3f},")
        lines.append(f"            stride_period: {r['stride_period']:.3f},")
        lines.append(f"            knee_flexion: ({r['knee_flexion'][0]:.1f}, {r['knee_flexion'][1]:.1f}),")
        lines.append(f"            elbow_flexion: ({r['elbow_flexion'][0]:.1f}, {r['elbow_flexion'][1]:.1f}),")
        lines.append(f"            bob: {ron_list(r['bob'])},")
        lines.append(f"            pelvis_yaw: {ron_list(r['pelvis_yaw'])},")
        lines.append(f"            pelvis_roll: {ron_list(r['pelvis_roll'])},")
        lines.append("            feet: [")
        for foot in r["feet"]:
            lines.append("                (")
            lines.append(f"                    contact: {foot['contact']:.3f},")
            lines.append(f"                    duty: {foot['duty']:.3f},")
            lines.append(f"                    lift: {ron_list(foot['lift'])},")
            lines.append(f"                    fwd: {ron_list(foot['fwd'])},")
            lines.append(f"                    side: {ron_list(foot['side'])},")
            lines.append(f"                    pitch: {ron_list(foot['pitch'])},")
            lines.append("                ),")
        lines.append("            ],")
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
