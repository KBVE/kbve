import unreal

# Puts the road network actor into the world map and points it at the materials
# the texture import built. Re-runnable: an existing actor is reconfigured rather
# than duplicated.
#
# The seed and terrain shape are copied off the terrain streamer rather than set
# here. Roads are draped onto the heightfield, so a road network carrying a
# different seed or a different noise shape lays its surface on ground that does
# not exist -- and the failure looks like floating road rather than like a
# mismatched setting.
#
# Headless:
#   UnrealEditor-Cmd <project> -run=pythonscript -script="<abs path to this file>"

LEVEL_PATH = "/Game/Map/L_RareIconWorld"

# What stands off the ground: the crossings and the settlements. The road surface
# is painted into the terrain and its textures are sampled by the ground
# material, so there is no road material for this actor to carry.
#
# The brick is also the switch for the villages. Buildings are their own mesh
# section rather than instances, so without a material to draw them with there is
# nothing sensible to raise -- and a village in default grey is worse than none.
MATERIALS = {
    "WoodMaterial": "/Game/Textures/World/M_RareIcon_BridgeWood",
    "StoneMaterial": "/Game/Textures/World/M_RareIcon_BridgeStone",
    "BrickMaterial": "/Game/Textures/World/M_RareIcon_Brick",
    "RoofMaterial": "/Game/Textures/World/M_RareIcon_Roof",
}

WATER_MATERIAL = "/Game/Textures/World/M_RareIcon_Water"

# The piers, the abutments and the cross beams are all a box, so they are drawn
# as instances of one rather than built into every chunk that holds one. Any cube
# centred on its own origin does: the scale onto each box comes off the mesh's
# bounds, so this is not tied to the engine cube's own size.
PART_MESH = "/Engine/BasicShapes/Cube"

# Road nodes are this many terrain chunks apart. One node per terrain chunk puts
# four roads through every chunk, which from the air is a lattice rather than a
# network -- what makes roads read as roads is that most of the map has none.
CHUNKS_PER_NODE = 3

EAL = unreal.EditorAssetLibrary


def main():
    level_subsystem = unreal.get_editor_subsystem(unreal.LevelEditorSubsystem)
    actor_subsystem = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)

    if not level_subsystem.load_level(LEVEL_PATH):
        unreal.log_error(f"could not load {LEVEL_PATH}")
        return

    actors = actor_subsystem.get_all_level_actors()

    streamer = next(
        (a for a in actors if isinstance(a, unreal.KBVEWorldStreamer)), None
    )
    if streamer is None:
        unreal.log_error("no KBVEWorldStreamer in the level to take the seed from")
        return

    network = next(
        (a for a in actors if isinstance(a, unreal.KBVEWorldRoadNetwork)), None
    )
    if network is None:
        network = actor_subsystem.spawn_actor_from_class(
            unreal.KBVEWorldRoadNetwork, unreal.Vector(0.0, 0.0, 0.0)
        )
        network.set_actor_label("KBVEWorldRoadNetwork")
        unreal.log("spawned KBVEWorldRoadNetwork")

    # The road parameters live on the streamer now: the terrain is graded for the
    # roads, so the ground and the surface laid on it have to be derived from one
    # set of numbers. The road actor copies them from there at runtime.
    road = streamer.get_editor_property("road")
    cells = streamer.get_editor_property("cells_per_chunk")
    cell_size = streamer.get_editor_property("cell_size")
    road.set_editor_property(
        "tiles_per_chunk", float(cells) * cell_size / 100.0 * CHUNKS_PER_NODE
    )
    road.set_editor_property("world_units_per_tile", 100.0)
    streamer.set_editor_property("road", road)

    # Without a water surface the carved channels are dry trenches: the ground is
    # right and the world still reads as pitted rather than as watered.
    water = EAL.load_asset(WATER_MATERIAL)
    if water is None:
        unreal.log_error(f"missing material: {WATER_MATERIAL}")
        return
    streamer.set_editor_property("water_material", water)

    # The road window is wider per chunk now, so fewer of them cover the same
    # ground as the terrain window.
    network.set_editor_property("view_radius_chunks", 2)

    for prop, path in MATERIALS.items():
        material = EAL.load_asset(path)
        if material is None:
            unreal.log_error(f"missing material: {path}")
            return
        network.set_editor_property(prop, material)

    part_mesh = EAL.load_asset(PART_MESH)
    if part_mesh is None:
        unreal.log_error(f"missing mesh: {PART_MESH}")
        return
    network.set_editor_property("part_mesh", part_mesh)

    actor_subsystem.set_actor_selection_state(streamer, False)
    level_subsystem.save_current_level()
    unreal.log(f"road network configured on {LEVEL_PATH}")


main()
