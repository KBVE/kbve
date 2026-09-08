use bevy::prelude::*;

pub mod camera;
pub mod character;
pub mod foot_ik;
pub mod player;
pub mod world;

pub struct MmorpgPlugin;

impl Plugin for MmorpgPlugin {
    fn build(&self, app: &mut App) {
        app.add_plugins((
            world::WorldPlugin,
            character::CharacterPlugin,
            player::PlayerPlugin,
            foot_ik::FootIkPlugin,
            camera::CameraPlugin,
        ));
    }
}
