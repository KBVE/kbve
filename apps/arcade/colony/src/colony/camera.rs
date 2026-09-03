use bevy::camera::ScalingMode;
use bevy::input::mouse::{MouseMotion, MouseScrollUnit, MouseWheel};
use bevy::prelude::*;

use crate::colony::grid::ColonyGrid;

pub const CAMERA_YAW: f32 = std::f32::consts::FRAC_PI_4;
pub const CAMERA_PITCH: f32 = 0.9;

const CAMERA_DISTANCE: f32 = 200.0;
const PAN_SPEED: f32 = 18.0;
const ZOOM_PER_NOTCH: f32 = 1.12;
const PIXELS_PER_NOTCH: f32 = 12.0;

#[derive(Component, Debug, Clone, Copy)]
pub struct CameraRig {
    pub focus: Vec3,
    pub zoom: f32,
}

impl CameraRig {
    pub const MIN_ZOOM: f32 = 0.004;
    pub const MAX_ZOOM: f32 = 0.12;
}

impl Default for CameraRig {
    fn default() -> Self {
        Self {
            focus: Vec3::ZERO,
            zoom: 0.02,
        }
    }
}

pub struct ColonyCameraPlugin;

impl Plugin for ColonyCameraPlugin {
    fn build(&self, app: &mut App) {
        app.add_systems(Startup, spawn_camera).add_systems(
            Update,
            (pan_keyboard, pan_drag, zoom_control, apply_rig).chain(),
        );
    }
}

fn spawn_camera(mut commands: Commands, grid: Res<ColonyGrid>) {
    let size = grid.world_size();
    let focus = Vec3::new(size.x * 0.5, 0.0, size.y * 0.5);
    let zoom = std::env::var("COLONY_ZOOM")
        .ok()
        .and_then(|v| v.parse::<f32>().ok())
        .map(|z| z.clamp(CameraRig::MIN_ZOOM, CameraRig::MAX_ZOOM))
        .unwrap_or(CameraRig::default().zoom);

    commands.spawn((
        Camera3d::default(),
        Projection::from(OrthographicProjection {
            scaling_mode: ScalingMode::WindowSize,
            far: CAMERA_DISTANCE * 4.0,
            near: -CAMERA_DISTANCE * 4.0,
            ..OrthographicProjection::default_3d()
        }),
        Transform::default(),
        AmbientLight {
            color: Color::srgb(0.72, 0.78, 0.95),
            brightness: 320.0,
            ..default()
        },
        CameraRig { focus, zoom },
    ));

    commands.spawn((
        DirectionalLight {
            illuminance: 11_000.0,
            shadow_maps_enabled: true,
            ..default()
        },
        Transform::from_rotation(Quat::from_euler(EulerRot::YXZ, -0.9, -1.0, 0.0)),
    ));
}

fn pan_keyboard(keys: Res<ButtonInput<KeyCode>>, time: Res<Time>, mut rigs: Query<&mut CameraRig>) {
    let mut dir = Vec2::ZERO;
    if keys.any_pressed([KeyCode::KeyW, KeyCode::ArrowUp]) {
        dir.y -= 1.0;
    }
    if keys.any_pressed([KeyCode::KeyS, KeyCode::ArrowDown]) {
        dir.y += 1.0;
    }
    if keys.any_pressed([KeyCode::KeyA, KeyCode::ArrowLeft]) {
        dir.x -= 1.0;
    }
    if keys.any_pressed([KeyCode::KeyD, KeyCode::ArrowRight]) {
        dir.x += 1.0;
    }
    if dir == Vec2::ZERO {
        return;
    }

    let dir = dir.normalize();
    for mut rig in &mut rigs {
        let step = PAN_SPEED * time.delta_secs() * (rig.zoom / 0.02);
        rig.focus += screen_to_world(dir) * step;
    }
}

fn pan_drag(
    buttons: Res<ButtonInput<MouseButton>>,
    mut motion: MessageReader<MouseMotion>,
    mut rigs: Query<&mut CameraRig>,
) {
    if !buttons.pressed(MouseButton::Middle) && !buttons.pressed(MouseButton::Right) {
        motion.clear();
        return;
    }

    let delta: Vec2 = motion.read().map(|m| m.delta).sum();
    if delta == Vec2::ZERO {
        return;
    }

    for mut rig in &mut rigs {
        let world = screen_to_world(-delta) * rig.zoom;
        rig.focus += world;
    }
}

fn zoom_control(mut wheel: MessageReader<MouseWheel>, mut rigs: Query<&mut CameraRig>) {
    let notches: f32 = wheel
        .read()
        .map(|w| match w.unit {
            MouseScrollUnit::Line => w.y,
            MouseScrollUnit::Pixel => w.y / PIXELS_PER_NOTCH,
        })
        .sum();

    if notches == 0.0 {
        return;
    }

    for mut rig in &mut rigs {
        rig.zoom = (rig.zoom / ZOOM_PER_NOTCH.powf(notches))
            .clamp(CameraRig::MIN_ZOOM, CameraRig::MAX_ZOOM);
    }
}

fn apply_rig(mut rigs: Query<(&CameraRig, &mut Transform, &mut Projection)>) {
    for (rig, mut transform, mut projection) in &mut rigs {
        let rotation = Quat::from_euler(EulerRot::YXZ, CAMERA_YAW, -CAMERA_PITCH, 0.0);
        transform.rotation = rotation;
        transform.translation = rig.focus + rotation * Vec3::new(0.0, 0.0, CAMERA_DISTANCE);

        if let Projection::Orthographic(ortho) = &mut *projection {
            ortho.scale = rig.zoom;
        }
    }
}

fn screen_to_world(dir: Vec2) -> Vec3 {
    let yaw = Quat::from_rotation_y(CAMERA_YAW);
    yaw * Vec3::new(dir.x, 0.0, dir.y)
}
