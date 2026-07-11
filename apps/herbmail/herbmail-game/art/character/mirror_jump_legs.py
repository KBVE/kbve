import bpy
import os
import sys
from mathutils import Matrix

HERE = os.path.dirname(os.path.abspath(__file__))
MODELS = os.path.normpath(os.path.join(HERE, "..", "..", "public", "models"))
GLB = os.path.join(MODELS, "character-anim.glb")
CLIPS = {"Jump_Start", "Jump_Loop", "Jump_Land"}
PAIRS = [("thigh_r", "thigh_l"), ("calf_r", "calf_l"),
         ("foot_r", "foot_l"), ("ball_r", "ball_l")]  # parent-first
MX = Matrix.Diagonal((-1, 1, 1, 1))
SX = Matrix.Diagonal((-1, 1, 1, 1))


def main():
    out = sys.argv[sys.argv.index("--") + 1] if "--" in sys.argv else GLB
    bpy.ops.wm.read_factory_settings(use_empty=True)
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=GLB)
    added = [o for o in bpy.data.objects if o not in before]
    arm = next(o for o in added if o.type == "ARMATURE")
    arm.animation_data_create()
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode="POSE")
    for name, a in {a.name: a for a in bpy.data.actions}.items():
        if not any(name.startswith(c) for c in CLIPS):
            continue
        arm.animation_data.action = a
        fr = a.frame_range
        for f in range(int(fr[0]), int(fr[1]) + 1):
            bpy.context.scene.frame_set(f)
            bpy.context.view_layer.update()
            src = {l: arm.pose.bones[l].matrix.copy() for _, l in PAIRS}
            for r, l in PAIRS:
                arm.pose.bones[r].matrix = MX @ src[l] @ SX
                bpy.context.view_layer.update()
            for r, l in PAIRS:
                arm.pose.bones[r].keyframe_insert(
                    "rotation_quaternion", frame=f)
        print("mirrored right leg <- left in", name)
    bpy.ops.object.mode_set(mode="OBJECT")
    bpy.ops.object.select_all(action="DESELECT")
    for o in added:
        o.select_set(True)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.export_scene.gltf(
        filepath=out, use_selection=True, export_yup=True,
        export_morph=False, export_animation_mode="ACTIONS",
        export_animations=True)
    print("exported", out)


if __name__ == "__main__":
    main()
