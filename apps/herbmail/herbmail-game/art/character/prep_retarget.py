import bpy
import os

HERE = os.path.dirname(os.path.abspath(__file__))
MODELS = os.path.normpath(os.path.join(HERE, "..", "..", "public", "models"))
TARGET = os.path.join(MODELS, "character.glb")
SOURCE = os.path.join(MODELS, "m2m-character.glb")
OUT = os.path.join(HERE, "retarget_ready.blend")


def wipe():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def import_glb(path):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    added = [o for o in bpy.data.objects if o not in before]
    arm = next((o for o in added if o.type == "ARMATURE"), None)
    return arm, added


def rename(objs, tag):
    for o in objs:
        o.name = f"{tag}_{o.name}"


def enable_rokoko():
    for mod in ("rokoko_stable", "rokoko_beta", "rokoko_rt"):
        try:
            bpy.ops.preferences.addon_enable(module=mod)
            print(f"enabled {mod}")
            return True
        except Exception as e:  # noqa: BLE001
            print(f"{mod} enable failed: {e}")
    return False


def main():
    wipe()

    tgt, tgt_objs = import_glb(TARGET)
    rename(tgt_objs, "SIDEKICK")
    if tgt:
        tgt.name = "SIDEKICK_ARM"
        tgt.location = (0.0, 0.0, 0.0)

    src, src_objs = import_glb(SOURCE)
    rename(src_objs, "M2M")
    if src:
        src.name = "M2M_SRC"
        src.location = (2.0, 0.0, 0.0)

    enable_rokoko()

    n_clips = len(bpy.data.actions)
    print(f"SIDEKICK target: {tgt.name if tgt else 'NONE'}")
    print(f"M2M source: {src.name if src else 'NONE'} ({n_clips} actions)")

    bpy.ops.wm.save_as_mainfile(filepath=OUT)
    print(f"saved {OUT}")


if __name__ == "__main__":
    main()
