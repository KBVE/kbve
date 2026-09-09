use bevy::prelude::*;

pub mod action;
pub mod camera;
pub mod character;
pub mod combat;
pub mod foot_ik;
pub mod player;
pub mod pose;
pub mod rig;
pub mod river;
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
            player::PlayerPlugin,
            foot_ik::FootIkPlugin,
            pose::PosePlugin,
            camera::CameraPlugin,
            target_ring::TargetRingPlugin,
            ui::UiPlugin,
        ));
    }
}
