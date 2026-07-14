"""Headless editor script: create minimal L_ArpgWorld travel-target map."""
import unreal

MAP_PACKAGE = "/Game/Map/L_ArpgWorld"

subsys = unreal.get_editor_subsystem(unreal.LevelEditorSubsystem)
subsys.new_level(MAP_PACKAGE)

world = unreal.EditorLevelLibrary.get_editor_world()

floor = unreal.EditorLevelLibrary.spawn_actor_from_class(
    unreal.StaticMeshActor, unreal.Vector(0.0, 0.0, 0.0)
)
plane = unreal.EditorAssetLibrary.load_asset("/Engine/BasicShapes/Plane.Plane")
floor.static_mesh_component.set_static_mesh(plane)
floor.set_actor_scale3d(unreal.Vector(100.0, 100.0, 1.0))

unreal.EditorLevelLibrary.spawn_actor_from_class(
    unreal.DirectionalLight, unreal.Vector(0.0, 0.0, 500.0), unreal.Rotator(-45.0, -45.0, 0.0)
)
unreal.EditorLevelLibrary.spawn_actor_from_class(
    unreal.SkyLight, unreal.Vector(0.0, 0.0, 600.0)
)
unreal.EditorLevelLibrary.spawn_actor_from_class(
    unreal.PlayerStart, unreal.Vector(0.0, 0.0, 100.0)
)

unreal.EditorLoadingAndSavingUtils.save_current_level()
unreal.log("L_ArpgWorld created")
