import json
import sys

import bpy

BONES = [
    "root",
    "pelvis",
    "spine_01",
    "spine_03",
    "spine_05",
    "neck_01",
    "head",
    "thigh_l",
    "calf_l",
    "foot_l",
    "ball_l",
    "thigh_r",
    "calf_r",
    "foot_r",
    "ball_r",
    "clavicle_l",
    "upperarm_l",
    "lowerarm_l",
    "hand_l",
    "clavicle_r",
    "upperarm_r",
    "lowerarm_r",
    "hand_r",
]


def main():
    args = sys.argv[sys.argv.index("--") + 1 :]
    src, dst = args
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.fbx(
        filepath=src,
        use_anim=True,
        ignore_leaf_bones=True,
        automatic_bone_orientation=False,
    )
    arm = next(o for o in bpy.data.objects if o.type == "ARMATURE")
    scene = bpy.context.scene
    action = arm.animation_data.action
    f0, f1 = (int(action.frame_range[0]), int(action.frame_range[1]))
    fps = scene.render.fps / scene.render.fps_base
    names = [b for b in BONES if b in arm.pose.bones]
    out = {
        "clip": src.split("/")[-1],
        "fps": fps,
        "frames": [],
        "bones": names,
        "rest": {},
    }
    for n in names:
        b = arm.data.bones[n]
        m = arm.matrix_world @ b.matrix_local
        out["rest"][n] = {"pos": list(m.translation), "quat": list(m.to_quaternion())}
    for f in range(f0, f1 + 1):
        scene.frame_set(f)
        row = {}
        for n in names:
            m = arm.matrix_world @ arm.pose.bones[n].matrix
            q = m.to_quaternion()
            row[n] = {
                "pos": [round(v, 5) for v in m.translation],
                "quat": [round(v, 6) for v in (q.w, q.x, q.y, q.z)],
            }
        out["frames"].append(row)
    with open(dst, "w") as fh:
        json.dump(out, fh)
    print("SAMPLED", src, f0, f1, fps, names)


main()
