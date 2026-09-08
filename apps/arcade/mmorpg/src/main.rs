use avian3d::prelude::*;
use bevy::prelude::*;

mod mmorpg;

use kinetree::KinetreePlugin;
use mmorpg::MmorpgPlugin;

fn main() {
    App::new()
        .add_plugins(DefaultPlugins.set(WindowPlugin {
            primary_window: Some(Window {
                title: "MMORPG".into(),
                canvas: Some("#mmorpg".into()),
                fit_canvas_to_parent: true,
                prevent_default_event_handling: false,
                ..default()
            }),
            ..default()
        }))
        // Physics steps at a fixed rate while rendering does not, so without
        // easing a body teleports between ticks. It is visible as a shaking
        // camera, and because the character model is a child of the body, as
        // choppy animation -- the clip is smooth, the thing carrying it is not.
        //
        // The plugin is already in PhysicsPlugins::default(), but opted out of
        // per entity until told otherwise.
        //
        // Translation only: rotation on these bodies is locked and driven by
        // `face_travel_direction`, so easing it would have physics reset the
        // facing to the locked value every fixed step and the slerp restart
        // from scratch -- a character that leans toward its heading and never
        // arrives.
        .add_plugins(
            PhysicsPlugins::default()
                .set(PhysicsInterpolationPlugin::interpolate_translation_all()),
        )
        .insert_resource(Gravity(Vec3::NEG_Y * 24.0))
        .insert_resource(ClearColor(Color::srgb(0.52, 0.68, 0.85)))
        .add_plugins(KinetreePlugin)
        .add_plugins(MmorpgPlugin)
        .run();
}
