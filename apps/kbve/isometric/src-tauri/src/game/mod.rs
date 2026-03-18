pub mod actions;
pub mod camera;
pub mod creatures;
pub mod grass;
pub mod hover_bvh;
pub mod input_bridge;
pub mod inventory;
pub mod mushrooms;
pub mod net;
pub mod object_registry;
pub mod orb_hud;
pub mod phase;
pub mod pixelate;
pub mod player;
pub mod rocks;
pub mod scene_objects;
pub mod state;
pub mod telemetry;
pub mod terrain;
pub mod tilemap;
pub mod title_screen;
pub mod trees;
pub mod ui_color;
pub mod virtual_joystick;
pub mod water;
pub mod weather;

use bevy::app::{PluginGroup, PluginGroupBuilder};

use actions::ActionsPlugin;
use camera::IsometricCameraPlugin;
use creatures::CreaturesPlugin;
use inventory::{InventoryPlugin, ItemKind};
use net::NetPlugin;
use object_registry::ObjectRegistryPlugin;
use orb_hud::OrbHudPlugin;
use phase::PhasePlugin;
use pixelate::PixelatePlugin;
use player::PlayerPlugin;
use scene_objects::SceneObjectsPlugin;
use state::GameStatePlugin;
use terrain::TerrainPlugin;
use tilemap::TilemapPlugin;
use title_screen::TitleScreenPlugin;
use trees::TreesPlugin;
use virtual_joystick::VirtualJoystickPlugin;
use water::WaterPlugin;
use weather::WeatherPlugin;

/// All game-logic plugins bundled together.
/// Used by both desktop (main.rs) and WASM (lib.rs) entry points.
pub struct GamePluginGroup;

impl PluginGroup for GamePluginGroup {
    fn build(self) -> PluginGroupBuilder {
        PluginGroupBuilder::start::<Self>()
            // Phase must be first — other plugins depend on GamePhase state
            .add(PhasePlugin)
            .add(TitleScreenPlugin)
            .add(NetPlugin)
            .add(GameStatePlugin)
            .add(TerrainPlugin)
            .add(IsometricCameraPlugin)
            .add(TilemapPlugin)
            .add(PlayerPlugin)
            .add(ObjectRegistryPlugin)
            .add(SceneObjectsPlugin)
            .add(TreesPlugin)
            .add(WaterPlugin)
            .add(InventoryPlugin::<ItemKind>::new(16))
            .add(WeatherPlugin)
            .add(CreaturesPlugin)
            .add(VirtualJoystickPlugin)
            .add(OrbHudPlugin)
            .add(ActionsPlugin)
            .add(PixelatePlugin)
    }
}
