"""Export a PolyHaven foliage pack's clump models to FBX, run inside Blender.

The packs ship the plants as models, not only as a sheet: bermuda carries about
twenty clumps at eight to two hundred triangles, and the meadow pack carries
size tiers with an authored three-step LOD chain each. Both reference the same
atlas the textures come from, so their UVs already say which part of the sheet
is a plant -- which is the question a card generator has to be told the answer
to, rectangle by rectangle.

Objects are filtered rather than taken wholesale. A pack's file also holds the
preview sphere its thumbnail was rendered on, and bermuda holds each clump twice
-- once as authored and once as the geometry-nodes realisation of the same mesh,
identical triangle for triangle.

Run as:
    blender --background <pack>.blend --python export_foliage.py -- <out dir>
"""

import os
import sys

import bpy

# What a pack calls the realised copy of a clump it also ships authored. Both
# spellings appear, sometimes in the same file, and the two meshes are identical
# triangle for triangle -- so importing both is the same plant under two names,
# and a field mixing "variants" that are the same model twice.
TWIN_TOKENS = ("_geometry_", "_geonodes_")


def wanted(name):
    """Everything a field would plant, and nothing a thumbnail needed."""
    if "geometry_nodes" in name:
        return False
    for token in TWIN_TOKENS:
        if token in name and name.replace(token, "_") in bpy.data.objects:
            return False
    return True


def main():
    out_dir = sys.argv[sys.argv.index("--") + 1]
    os.makedirs(out_dir, exist_ok=True)

    meshes = [ob for ob in bpy.data.objects if ob.type == "MESH" and wanted(ob.name)]
    meshes.sort(key=lambda ob: ob.name)

    for ob in meshes:
        bpy.ops.object.select_all(action="DESELECT")
        ob.select_set(True)
        bpy.context.view_layer.objects.active = ob

        # At the origin, because a clump is placed by an instance transform and
        # whatever offset it was laid out with in the pack's scene is a position
        # in a thumbnail, not an anchor.
        location = tuple(ob.location)
        ob.location = (0.0, 0.0, 0.0)

        path = os.path.join(out_dir, f"{ob.name}.fbx")
        bpy.ops.export_scene.fbx(
            filepath=path,
            use_selection=True,
            object_types={"MESH"},
            mesh_smooth_type="FACE",
            add_leaf_bones=False,
            bake_space_transform=False,
            # One, not a hundred. FBX counts in centimetres and the exporter
            # already converts the scene's metres into them, so a scale of a
            # hundred here is that conversion applied a second time -- which
            # lands a ten centimetre tuft in the world ten metres tall.
            global_scale=1.0,
            apply_unit_scale=True,
            axis_forward="-Z",
            axis_up="Y",
        )
        ob.location = location
        print(f"exported {ob.name} -> {path}")

    print(f"FOLIAGE_EXPORTED {len(meshes)}")


main()
