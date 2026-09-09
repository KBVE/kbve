use bevy::input::mouse::{AccumulatedMouseMotion, AccumulatedMouseScroll};
use bevy::prelude::*;
use bevy_egui::PrimaryEguiContext;

/// The character the camera orbits.
///
/// A component rather than `With<Player>`, so spectating, a cutscene or a
/// mounted vehicle is a matter of moving this tag rather than teaching the
/// camera about each case.
#[derive(Component)]
pub struct CameraTarget;

/// Ordering handle for the camera update, so anything that wants to influence
/// the camera -- a target lock swinging the yaw -- can be scheduled before it
/// rather than a frame late.
#[derive(SystemSet, Debug, Clone, PartialEq, Eq, Hash)]
pub struct CameraSystems;

const MIN_PITCH: f32 = -1.35;
const MAX_PITCH: f32 = 1.15;
const MIN_DISTANCE: f32 = 2.5;
const MAX_DISTANCE: f32 = 32.0;
const LOOK_SENSITIVITY: f32 = 0.0035;

pub struct CameraPlugin;

impl Plugin for CameraPlugin {
    fn build(&self, app: &mut App) {
        // Before propagation, not after. The camera is a root entity, so
        // writing its Transform once Propagate has already run leaves its
        // GlobalTransform -- the thing that actually renders -- a frame stale.
        // A camera chasing a moving target one frame late reads as shake, and
        // no amount of physics interpolation fixes it, because the body was
        // never the part that was late.
        app.add_systems(Startup, spawn_camera).add_systems(
            PostUpdate,
            follow_target
                .in_set(CameraSystems)
                .before(TransformSystems::Propagate),
        );
    }
}

/// How fast the focus chases the target vertically, per second, as the rate of
/// an exponential decay rather than a fraction per frame -- a fraction would
/// make the camera stiffer at high frame rates and looser at low ones.
///
/// Only vertical is damped. A capsule on a triangle mesh is always being nudged
/// a few millimetres out of the ground and steps up terrain in discrete bumps,
/// and following that rigidly is what reads as an unsteady camera. Horizontally
/// there is no such noise -- the motion is the player's own input, already
/// smooth -- so the focus tracks it exactly. Smoothing it instead costs a
/// steady-state offset of `speed / rate`, which is invisible along the view
/// axis but slides the character off centre when strafing.
const FOLLOW_RATE_VERTICAL: f32 = 7.0;

#[derive(Component)]
pub struct OrbitCamera {
    pub yaw: f32,
    pub pitch: f32,
    pub distance: f32,
    pub focus_height: f32,
    /// The point the camera looks at: the target's position, with the height
    /// damped. `None` until the first frame, so the camera starts on the target
    /// instead of easing in from the world origin.
    focus: Option<Vec3>,
}

impl Default for OrbitCamera {
    fn default() -> Self {
        Self {
            yaw: 0.0,
            pitch: -0.42,
            distance: 11.0,
            focus_height: 1.4,
            focus: None,
        }
    }
}

fn spawn_camera(mut commands: Commands) {
    commands.spawn((
        OrbitCamera::default(),
        Camera3d::default(),
        // egui draws through a camera, and this is the only one.
        PrimaryEguiContext,
        AmbientLight {
            color: Color::srgb(0.68, 0.76, 0.92),
            brightness: 260.0,
            ..default()
        },
        Projection::Perspective(PerspectiveProjection {
            fov: 65.0_f32.to_radians(),
            far: 2000.0,
            ..default()
        }),
        Transform::from_xyz(0.0, 12.0, 16.0).looking_at(Vec3::ZERO, Vec3::Y),
    ));
}

fn follow_target(
    time: Res<Time>,
    buttons: Res<ButtonInput<MouseButton>>,
    motion: Res<AccumulatedMouseMotion>,
    scroll: Res<AccumulatedMouseScroll>,
    target: Single<&Transform, (With<CameraTarget>, Without<OrbitCamera>)>,
    mut camera: Single<(&mut OrbitCamera, &mut Transform)>,
) {
    let (orbit, transform) = &mut *camera;

    if buttons.pressed(MouseButton::Right) || buttons.pressed(MouseButton::Left) {
        orbit.yaw -= motion.delta.x * LOOK_SENSITIVITY;
        orbit.pitch = (orbit.pitch - motion.delta.y * LOOK_SENSITIVITY).clamp(MIN_PITCH, MAX_PITCH);
    }
    if scroll.delta.y != 0.0 {
        orbit.distance = (orbit.distance - scroll.delta.y).clamp(MIN_DISTANCE, MAX_DISTANCE);
    }

    let wanted = target.translation + Vec3::Y * orbit.focus_height;

    // Exponential decay on height only, integrated over the frame's own
    // duration so the result does not change with frame rate.
    let focus = match orbit.focus {
        Some(previous) => {
            let vertical = 1.0 - (-FOLLOW_RATE_VERTICAL * time.delta_secs()).exp();
            Vec3::new(
                wanted.x,
                previous.y + (wanted.y - previous.y) * vertical,
                wanted.z,
            )
        }
        None => wanted,
    };
    orbit.focus = Some(focus);

    let rotation = Quat::from_euler(EulerRot::YXZ, orbit.yaw, orbit.pitch, 0.0);

    transform.translation = focus + rotation * Vec3::Z * orbit.distance;
    transform.look_at(focus, Vec3::Y);
}
