"""Asset conversion for the bevy lanes.

The engine-facing half of the pipeline, the way :mod:`kbve.unreal` is for
Unreal. What lands here is anything a bevy game needs its source art turned
into before it can load it: GPU-compressed textures, and the packed layer
strips the terrain material samples.

Nothing in here imports ``bpy``. Blender-side work -- assembling a character
out of modular parts, baking a gait -- lives in :mod:`kbve.blender`, and the
split is the one :mod:`kbve.blender.pack_orm` already drew: image work is
easier to trust when it can be run and checked without an editor around it.
"""
