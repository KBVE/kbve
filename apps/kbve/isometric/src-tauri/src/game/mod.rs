pub mod actions;
pub mod camera;
pub mod client_profile;
pub mod creatures;
pub mod grass;
pub mod hover_bvh;
pub mod input_bridge;
pub mod interaction_ui;
pub mod inventory;
pub mod inventory_ui;
pub mod mushrooms;
pub mod net;
pub mod object_registry;
pub mod orb_hud;
pub mod pause_menu;
pub mod persist;
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
pub mod toast;
pub mod trees;
pub mod ui_color;
pub mod virtual_joystick;
pub mod water;
pub mod weather;

use bevy::app::{Plugin, PluginGroup, PluginGroupBuilder};
use bevy::prelude::Startup;

use actions::ActionsPlugin;
use camera::IsometricCameraPlugin;
use creatures::CreaturesPlugin;
use input_bridge::InputBridgePlugin;
use interaction_ui::InteractionUiPlugin;
use inventory::{BevyItemsPlugin, InventoryPlugin, ItemKind};
use inventory_ui::InventoryUiPlugin;
use net::NetPlugin;
use object_registry::ObjectRegistryPlugin;
use orb_hud::OrbHudPlugin;
use pause_menu::PauseMenuPlugin;
use persist::PersistPlugin;
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

/// Loads the baked itemdb at startup so ProtoItemKind can resolve display names.
struct ItemDbLoaderPlugin;

impl Plugin for ItemDbLoaderPlugin {
    fn build(&self, app: &mut bevy::app::App) {
        app.add_systems(Startup, inventory::load_baked_itemdb);
    }
}

/// All game-logic plugins bundled together.
/// Used by both desktop (main.rs) and WASM (lib.rs) entry points.
pub struct GamePluginGroup;

impl PluginGroup for GamePluginGroup {
    fn build(self) -> PluginGroupBuilder {
        PluginGroupBuilder::start::<Self>()
            // Database must be first — persist plugin reads cached state at startup
            .add(bevy_db::BevyDbPlugin::default())
            // Phase must be early — other plugins depend on GamePhase state
            .add(PhasePlugin)
            .add(TitleScreenPlugin)
            .add(NetPlugin)
            .add(GameStatePlugin)
            .add(TerrainPlugin)
            .add(IsometricCameraPlugin)
            .add(TilemapPlugin)
            .add(PlayerPlugin)
            .add(ObjectRegistryPlugin)
            .add(InputBridgePlugin)
            .add(SceneObjectsPlugin)
            .add(TreesPlugin)
            .add(WaterPlugin)
            .add(BevyItemsPlugin)
            .add(ItemDbLoaderPlugin)
            .add(InventoryPlugin::<ItemKind>::new(16))
            .add(WeatherPlugin)
            .add(CreaturesPlugin)
            .add(VirtualJoystickPlugin)
            .add(OrbHudPlugin)
            .add(ActionsPlugin)
            .add(PixelatePlugin)
            .add(toast::ToastPlugin)
            .add(InteractionUiPlugin)
            .add(InventoryUiPlugin)
            .add(PauseMenuPlugin)
            .add(PersistPlugin)
    }
}
