pub mod actions;
pub mod camera;
pub mod grass;
pub mod input_bridge;
pub mod object_registry;
pub mod pixelate;
pub mod player;
pub mod rocks;
pub mod scene_objects;
pub mod state;
pub mod terrain;
pub mod tilemap;
pub mod trees;
pub mod water;

use bevy::app::{PluginGroup, PluginGroupBuilder};

use actions::ActionsPlugin;
use camera::IsometricCameraPlugin;
use object_registry::ObjectRegistryPlugin;
// PixelatePlugin disabled — two-stage render-to-texture pipeline handles pixelation.
// use pixelate::PixelatePlugin;
use player::PlayerPlugin;
use scene_objects::SceneObjectsPlugin;
use state::GameStatePlugin;
use terrain::TerrainPlugin;
use tilemap::TilemapPlugin;
use trees::TreesPlugin;
use water::WaterPlugin;

/// All game-logic plugins bundled together.
/// Used by both desktop (main.rs) and WASM (lib.rs) entry points.
pub struct GamePluginGroup;

impl PluginGroup for GamePluginGroup {
    fn build(self) -> PluginGroupBuilder {
        PluginGroupBuilder::start::<Self>()
            .add(GameStatePlugin)
            .add(TerrainPlugin)
            .add(IsometricCameraPlugin)
            .add(TilemapPlugin)
            .add(PlayerPlugin)
            .add(ObjectRegistryPlugin)
            .add(SceneObjectsPlugin)
            .add(TreesPlugin)
            .add(WaterPlugin)
            .add(ActionsPlugin)
    }
}
