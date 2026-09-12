use bevy::prelude::*;

pub mod action;
pub mod camera;
pub mod character;
pub mod combat;
pub mod foot_ik;
pub mod gaze;
pub mod inventory;
pub mod nav;
#[cfg(feature = "net")]
pub mod net;
pub mod npc;
pub mod player;
pub mod pose;
pub mod rig;
pub mod river;
pub mod skills;
pub mod target_ring;
pub mod terrain;
pub mod terrain_material;
pub mod theme;
pub mod ui;
pub mod water_material;
pub mod world;

pub struct MmorpgPlugin;

impl Plugin for MmorpgPlugin {
    fn build(&self, app: &mut App) {
        app.add_plugins((
            world::WorldPlugin,
            rig::RigPlugin,
            character::CharacterPlugin,
            action::ActionPlugin,
            combat::GameCombatPlugin,
            inventory::GameInventoryPlugin,
            skills::GameSkillsPlugin,
            npc::NpcPlugin,
            player::PlayerPlugin,
            foot_ik::FootIkPlugin,
            gaze::GazePlugin,
            pose::PosePlugin,
            camera::CameraPlugin,
            target_ring::TargetRingPlugin,
            ui::UiPlugin,
        ))
        .add_systems(Startup, slow_motion);

        // Multiplayer, when this build has it. Added after the game plugins so
        // a replicated player arrives in a world that already exists.
        #[cfg(feature = "net")]
        app.add_plugins(net::NetPlugin);
    }
}

/// `MMORPG_SLOW=0.2` runs the whole game at that fraction of real time for frame-by-frame capture.
fn slow_motion(mut time: ResMut<Time<Virtual>>) {
    if let Some(factor) = std::env::var("MMORPG_SLOW")
        .ok()
        .and_then(|v| v.parse::<f32>().ok())
    {
        time.set_relative_speed(factor.clamp(0.01, 1.0));
    }
}
