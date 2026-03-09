use bevy::camera::visibility::RenderLayers;
use bevy::core_pipeline::tonemapping::Tonemapping;
use bevy::image::ImageSampler;
use bevy::prelude::*;
use bevy::render::render_resource::TextureFormat;
use bevy::window::PrimaryWindow;
use bevy_rapier3d::prelude::PhysicsSet;

use super::player::{Player, PlayerMovement};

const CAMERA_OFFSET: Vec3 = Vec3::new(15.0, 20.0, 15.0);
const VIEWPORT_HEIGHT: f32 = 20.0;
/// Downscale factor: render at 1/PIXEL_SCALE resolution, nearest-neighbor upscale.
const PIXEL_SCALE: u32 = 2;
/// RenderLayer for the display quad (separate from the 3D scene on layer 0).
const DISPLAY_LAYER: usize = 1;

/// Precomputed stable camera axes derived from the initial look-at orientation.
/// Using these instead of reading from the mutated transform avoids frame-to-frame
/// drift that causes visible pixel jitter (especially along LEFT/RIGHT movement).
struct StableCameraAxes {
    right: Vec3,
    up: Vec3,
    forward: Vec3,
}

impl StableCameraAxes {
    fn new() -> Self {
        let tf = Transform::from_translation(CAMERA_OFFSET).looking_at(Vec3::ZERO, Vec3::Y);
        Self {
            right: tf.right().as_vec3(),
            up: tf.up().as_vec3(),
            forward: tf.forward().as_vec3(),
        }
    }
}

static STABLE_AXES: std::sync::LazyLock<StableCameraAxes> =
    std::sync::LazyLock::new(StableCameraAxes::new);

#[derive(Component)]
pub struct IsometricCamera;

#[derive(Component)]
struct DisplayQuad;

pub struct IsometricCameraPlugin;

impl Plugin for IsometricCameraPlugin {
    fn build(&self, app: &mut App) {
        app.add_systems(Startup, setup_camera);
        app.add_systems(
            PostUpdate,
            camera_follow_player
                .after(PhysicsSet::Writeback)
                .in_set(PlayerMovement),
        );
    }
}

fn setup_camera(
    mut commands: Commands,
    mut images: ResMut<Assets<Image>>,
    mut meshes: ResMut<Assets<Mesh>>,
    mut materials: ResMut<Assets<StandardMaterial>>,
    windows: Query<&Window, With<PrimaryWindow>>,
) {
    let Ok(window) = windows.single() else { return };
    let render_w = ((window.width() / PIXEL_SCALE as f32) as u32).max(1);
    let render_h = ((window.height() / PIXEL_SCALE as f32) as u32).max(1);

    // Low-res render target with nearest-neighbor sampling for crisp pixel art
    let mut render_img =
        Image::new_target_texture(render_w, render_h, TextureFormat::Bgra8UnormSrgb, None);
    render_img.sampler = ImageSampler::nearest();
    let render_handle = images.add(render_img);

    // --- Stage 1: Scene camera renders 3D world to the low-res texture ---
    // Default RenderLayers (layer 0) — sees all scene entities.
    commands.spawn((
        Camera3d::default(),
        Camera {
            order: -1,
            ..default()
        },
        Msaa::Off,
        Tonemapping::None,
        bevy::camera::RenderTarget::Image(render_handle.clone().into()),
        Projection::from(OrthographicProjection {
            scaling_mode: bevy::camera::ScalingMode::FixedVertical {
                viewport_height: VIEWPORT_HEIGHT,
            },
            ..OrthographicProjection::default_3d()
        }),
        Transform::from_translation(CAMERA_OFFSET).looking_at(Vec3::ZERO, Vec3::Y),
        IsometricCamera,
    ));

    // --- Stage 2: Display camera renders a textured quad to the window ---
    // Uses RenderLayers(DISPLAY_LAYER) so it only sees the display quad.
    let aspect = window.width() / window.height();
    commands.spawn((
        Camera3d::default(),
        Camera {
            order: 0,
            ..default()
        },
        Msaa::Off,
        Tonemapping::None,
        Projection::from(OrthographicProjection {
            scaling_mode: bevy::camera::ScalingMode::FixedVertical {
                viewport_height: 1.0,
            },
            ..OrthographicProjection::default_3d()
        }),
        Transform::from_xyz(0.0, 0.0, 10.0).looking_at(Vec3::ZERO, Vec3::Y),
        RenderLayers::layer(DISPLAY_LAYER),
    ));

    // Fullscreen quad with the render texture (unlit = display pixels as-is).
    // Slightly oversized (+2 texels) so sub-pixel offset doesn't expose clear color at edges.
    let texel_pad = 2.0 / render_h as f32;
    let quad_material = materials.add(StandardMaterial {
        base_color_texture: Some(render_handle),
        unlit: true,
        ..default()
    });
    commands.spawn((
        Mesh3d(meshes.add(Rectangle::new(aspect + texel_pad * aspect, 1.0 + texel_pad))),
        MeshMaterial3d(quad_material),
        Transform::default(),
        RenderLayers::layer(DISPLAY_LAYER),
        DisplayQuad,
    ));
}

fn camera_follow_player(
    player_query: Query<&Transform, (With<Player>, Without<IsometricCamera>)>,
    mut camera_query: Query<&mut Transform, (With<IsometricCamera>, Without<Player>)>,
    windows: Query<&Window, With<PrimaryWindow>>,
) {
    let Ok(player_tf) = player_query.single() else {
        return;
    };
    let Ok(mut camera_tf) = camera_query.single_mut() else {
        return;
    };

    let desired = player_tf.translation + CAMERA_OFFSET;

    let Ok(window) = windows.single() else {
        camera_tf.translation = desired;
        return;
    };

    let render_h = (window.height() / PIXEL_SCALE as f32).floor();
    if render_h < 1.0 {
        camera_tf.translation = desired;
        return;
    }

    let pixel_world_size = VIEWPORT_HEIGHT / render_h;

    // Use precomputed stable axes to avoid drift from reading mutated transform
    let axes = &*STABLE_AXES;
    let right = axes.right;
    let up = axes.up;
    let forward = axes.forward;

    let right_proj = desired.dot(right);
    let up_proj = desired.dot(up);
    let forward_proj = desired.dot(forward);

    // Snap camera to texel grid on ALL axes — prevents texel swimming.
    // Right/Up snapping locks the pixel grid for geometry.
    // Forward snapping stabilizes the shadow cascade alignment (shadow maps
    // recompute from the camera frustum — unsnapped depth causes shadow edges
    // to swim by 1-2 pixels as the camera glides smoothly along the view axis).
    let snapped_right = (right_proj / pixel_world_size).round() * pixel_world_size;
    let snapped_up = (up_proj / pixel_world_size).round() * pixel_world_size;
    let snapped_forward = (forward_proj / pixel_world_size).round() * pixel_world_size;

    camera_tf.translation = snapped_right * right + snapped_up * up + snapped_forward * forward;
}
