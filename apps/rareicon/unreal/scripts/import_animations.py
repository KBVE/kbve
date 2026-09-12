import os

import unreal

# Imports the staged rifle locomotion clips onto Manny's skeleton.
#
# They come from Epic's Game Animation Sample, authored on the UE5 mannequin
# rig. That rig and SKM_Manny_Simple's share 86 of 87 bone names, so the clips
# bind directly and no retarget step exists to go wrong. Every clip already
# holds the rifle -- the stance, the grip and the finger pose are animated, not
# solved -- which is why importing these replaces the procedural weapon hold
# rather than adding to it.
#
# Re-runnable: importing over an existing asset reimports it.
#
# Headless:
#   UnrealEditor-Cmd <project> -run=pythonscript -script="<abs path to this file>"

ASSET_TOOLS = unreal.AssetToolsHelpers.get_asset_tools()
EAL = unreal.EditorAssetLibrary

ANIM_DIR = "/Game/Animations/Rifle"
MESH = "/MoverExamples/Characters/Mannequins/Meshes/SKM_Manny_Simple"

STEMS = [
    "A_Rifle_Idle",
    "A_Rifle_Walk_F",
    "A_Rifle_Run_F",
    "A_Rifle_Sprint_F",
    "A_Rifle_Jump_Start",
    "A_Rifle_Jump_Land",
]


def source_dir():
    project = unreal.Paths.convert_relative_path_to_full(
        unreal.Paths.project_content_dir()
    )
    return os.path.join(project, os.pardir, "Art", "Animations")


def resolve_skeleton():
    # Asked of the mesh rather than loaded by path. The skeleton asset sits
    # beside the mesh but is not named after it -- it is SK_Mannequin -- and
    # guessing the path logs a load failure that makes a clean import look like
    # a failed one.
    mesh = EAL.load_asset(MESH)
    return mesh.get_editor_property("skeleton") if mesh else None


def import_clip(stem, skeleton):
    fbx = os.path.join(source_dir(), stem + ".fbx")
    if not os.path.isfile(fbx):
        unreal.log_error(f"missing staged clip: {fbx}")
        return None

    options = unreal.FbxImportUI()
    options.set_editor_property("import_mesh", False)
    options.set_editor_property("import_as_skeletal", True)
    options.set_editor_property("import_animations", True)
    options.set_editor_property("import_materials", False)
    options.set_editor_property("import_textures", False)
    options.set_editor_property("skeleton", skeleton)
    options.set_editor_property(
        "mesh_type_to_import", unreal.FBXImportType.FBXIT_ANIMATION
    )

    anim_data = options.anim_sequence_import_data
    anim_data.set_editor_property("import_bone_tracks", True)
    anim_data.set_editor_property("remove_redundant_keys", False)
    anim_data.set_editor_property(
        "animation_length", unreal.FBXAnimationLengthImportType.FBXALIT_EXPORTED_TIME
    )
    # The clips carry root motion, and the mover owns movement here, so it is
    # imported but not applied: the capsule decides where the character is and
    # the clip decides what it looks like doing it.
    anim_data.set_editor_property("import_meshes_in_bone_hierarchy", False)
    anim_data.set_editor_property("convert_scene", True)

    task = unreal.AssetImportTask()
    task.filename = fbx
    task.destination_path = ANIM_DIR
    task.destination_name = stem
    task.automated = True
    task.replace_existing = True
    task.save = True
    task.options = options
    ASSET_TOOLS.import_asset_tasks([task])

    anim = EAL.load_asset(f"{ANIM_DIR}/{stem}")
    if not isinstance(anim, unreal.AnimSequence):
        unreal.log_error(f"import produced no AnimSequence for {stem}")
        return None

    # Locked in place, and this is not optional. These clips travel: the walk
    # moves its root 786 cm over 3.9 seconds. The mover owns where the character
    # is, so that translation must not also be applied to the pose -- left alone
    # it slides the mesh eight metres away from the capsule it belongs to while
    # the capsule stays where it was. Root motion is off for the same reason,
    # and locking the root is what makes the clip play on the spot instead.
    anim.set_editor_property("enable_root_motion", False)
    anim.set_editor_property("force_root_lock", True)
    EAL.save_asset(f"{ANIM_DIR}/{stem}")
    unreal.log_warning(
        f"imported {stem}: {anim.get_editor_property('sequence_length'):.3f}s "
        f"{anim.get_editor_property('number_of_sampled_keys')} keys"
    )
    return anim


def main():
    skeleton = resolve_skeleton()
    if skeleton is None:
        raise RuntimeError("could not resolve Manny's skeleton")
    unreal.log_warning(f"importing onto {skeleton.get_name()}")

    failed = [stem for stem in STEMS if import_clip(stem, skeleton) is None]
    if failed:
        raise RuntimeError(f"clips failed to import: {failed}")
    unreal.log_warning("animation import complete")


main()
