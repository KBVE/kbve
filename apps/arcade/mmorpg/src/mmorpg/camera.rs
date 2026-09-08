use bevy::input::mouse::{AccumulatedMouseMotion, AccumulatedMouseScroll};
use bevy::prelude::*;

use super::player::Player;

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
            follow_player.before(TransformSystems::Propagate),
        );
    }
}

#[derive(Component)]
pub struct OrbitCamera {
    pub yaw: f32,
    pub pitch: f32,
    pub distance: f32,
    pub focus_height: f32,
}

impl Default for OrbitCamera {
    fn default() -> Self {
        Self {
            yaw: 0.0,
            pitch: -0.42,
            distance: 11.0,
            focus_height: 1.4,
        }
    }
}

fn spawn_camera(mut commands: Commands) {
    commands.spawn((
        OrbitCamera::default(),
        Camera3d::default(),
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

fn follow_player(
    buttons: Res<ButtonInput<MouseButton>>,
    motion: Res<AccumulatedMouseMotion>,
    scroll: Res<AccumulatedMouseScroll>,
    player: Single<&Transform, (With<Player>, Without<OrbitCamera>)>,
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

    let focus = player.translation + Vec3::Y * orbit.focus_height;
    let rotation = Quat::from_euler(EulerRot::YXZ, orbit.yaw, orbit.pitch, 0.0);
    transform.translation = focus + rotation * Vec3::Z * orbit.distance;
    transform.look_at(focus, Vec3::Y);
}
