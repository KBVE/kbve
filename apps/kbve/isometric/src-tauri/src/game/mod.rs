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
use bevy::prelude::*;

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

// ---------------------------------------------------------------------------
// Performance tier — detected at startup, read by throttled systems
// ---------------------------------------------------------------------------

/// Performance tier used to scale system budgets per platform.
///
/// `High`   — desktop native (all effects at full rate).
/// `Medium` — desktop WASM / powerful tablets.
/// `Low`    — mobile phones (throttled wind, fewer colliders, coarser pixelate).
#[derive(Resource, Clone, Copy, PartialEq, Eq, Debug)]
pub enum PerfTier {
    High,
    Medium,
    Low,
}

impl Default for PerfTier {
    fn default() -> Self {
        detect_perf_tier()
    }
}

#[cfg(not(target_arch = "wasm32"))]
fn detect_perf_tier() -> PerfTier {
    PerfTier::High
}

#[cfg(target_arch = "wasm32")]
fn detect_perf_tier() -> PerfTier {
    let ua = web_sys::window()
        .and_then(|w| w.navigator().user_agent().ok())
        .unwrap_or_default()
        .to_lowercase();
    if ua.contains("android") || ua.contains("iphone") || ua.contains("ipad") {
        PerfTier::Low
    } else {
        PerfTier::Medium
    }
}

struct PerfTierPlugin;

impl Plugin for PerfTierPlugin {
    fn build(&self, app: &mut bevy::app::App) {
        let tier = PerfTier::default();
        info!("[perf] detected tier: {:?}", tier);
        app.insert_resource(tier);
    }
}

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
            // Performance tier detection — must be first so other plugins can read it
            .add(PerfTierPlugin)
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
