import bpy
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
MODELS = os.path.normpath(os.path.join(HERE, "..", "..", "public", "models"))
GLB = os.path.join(MODELS, "character-anim.glb")
PAIRS = {"foot_r": "foot_l", "ball_r": "ball_l"}


def all_fcurves(act):
    if hasattr(act, "fcurves") and len(act.fcurves):
        yield from act.fcurves
        return
    for layer in getattr(act, "layers", []):
        for strip in layer.strips:
            for cb in strip.channelbags:
                yield from cb.fcurves


def bone_of(dp):
    if 'pose.bones["' not in dp:
        return None
    return dp.split('pose.bones["')[1].split('"]')[0]


def main():
    out = sys.argv[sys.argv.index("--") + 1] if "--" in sys.argv else GLB
    bpy.ops.wm.read_factory_settings(use_empty=True)
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=GLB)
    added = [o for o in bpy.data.objects if o not in before]
    arm = next(o for o in added if o.type == "ARMATURE")

    n = 0
    for act in bpy.data.actions:
        by = {}
        for fc in all_fcurves(act):
            if fc.data_path.endswith("rotation_quaternion"):
                by[(bone_of(fc.data_path), fc.array_index)] = fc
        for rbone, lbone in PAIRS.items():
            for idx in range(4):
                src = by.get((lbone, idx))
                dst = by.get((rbone, idx))
                if not src or not dst:
                    continue
                sv = {round(kp.co[0]): kp.co[1]
                      for kp in src.keyframe_points}
                for kp in dst.keyframe_points:
                    f = round(kp.co[0])
                    if f in sv:
                        kp.co[1] = sv[f]
                        kp.handle_left[1] = sv[f]
                        kp.handle_right[1] = sv[f]
                n += 1
    print("mirrored left foot onto right:", n, "curves")

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
