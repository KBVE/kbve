"""Export an already-rigged weapon .blend as an FBX for Unreal.

The sibling rig_weapon.py builds an armature for PolyHaven sources that ship as
loose rigid parts. This one is for sources that arrive rigged: it selects the
armature and the meshes bound to it, drops the rest, and exports.

Deliberately no geometry surgery. An earlier version rotated the mesh data to
put the barrel on Unreal's X and baked each object's transform in first, which
broke the skin binding -- the parts carry their own offsets, the magazine 3 cm
off the body and the chambered round 23 cm along it, and folding those into the
data left the geometry 10 cm from the bones it is weighted to. The magazine and
the round floated beside the weapon. The importer rotates on the way in instead;
see kbve.unreal.editor.import_ss2.

  blender -b <source.blend> --python export_rigged_weapon.py -- \
      --armature SS2V5 --drop bullet --out <path.fbx>
"""

import argparse
import sys

import bpy


def main():
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", required=True)
    parser.add_argument("--armature", required=True)
    parser.add_argument(
        "--drop",
        nargs="*",
        default=[],
        help="meshes to leave out, e.g. an ejecting round the rest pose parks in mid-air",
    )
    args = parser.parse_args(argv)

    view_layer = bpy.context.view_layer
    armature = bpy.data.objects[args.armature]

    # Anything not parented to the armature is a rig widget -- a bone custom
    # shape -- and would import as a loose static part.
    drop = set(args.drop)
    keep = {armature} | {
        o
        for o in bpy.data.objects
        if o.parent is armature and o.type == "MESH" and o.name not in drop
    }
    for obj in view_layer.objects:
        obj.select_set(obj in keep)
    view_layer.objects.active = armature
    print("exporting:", sorted(o.name for o in keep))

    bpy.ops.export_scene.fbx(
        filepath=args.out,
        use_selection=True,
        # Centimetres, because that is what Unreal measures in and the source
        # is metric at scale 1.0.
        global_scale=1.0,
        apply_scale_options="FBX_SCALE_UNITS",
        object_types={"ARMATURE", "MESH"},
        use_armature_deform_only=True,
        add_leaf_bones=False,
        bake_anim=False,
        axis_forward="-Z",
        axis_up="Y",
        mesh_smooth_type="FACE",
    )
    print("wrote", args.out)


main()
