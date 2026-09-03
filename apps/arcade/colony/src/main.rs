use bevy::prelude::*;

mod colony;
#[cfg(feature = "tuning")]
mod private;

use colony::ColonyPlugin;
use colony::debug::screenshot_path;
#[cfg(feature = "tuning")]
use private::TuningPlugin;

struct PrivatePlugins;

impl Plugin for PrivatePlugins {
    fn build(&self, app: &mut App) {
        #[cfg(feature = "tuning")]
        app.add_plugins(TuningPlugin);
        let _ = app;
    }
}

fn main() {
    App::new()
        .add_plugins(
            DefaultPlugins
                .set(ImagePlugin::default_nearest())
                .set(WindowPlugin {
                    primary_window: Some(Window {
                        title: "Colony".into(),
                        window_level: if screenshot_path().is_some() {
                            bevy::window::WindowLevel::AlwaysOnTop
                        } else {
                            bevy::window::WindowLevel::Normal
                        },
                        ..default()
                    }),
                    ..default()
                }),
        )
        .insert_resource(ClearColor(Color::srgb(0.08, 0.10, 0.14)))
        .add_plugins(ColonyPlugin)
        .add_plugins(PrivatePlugins)
        .run();
}
