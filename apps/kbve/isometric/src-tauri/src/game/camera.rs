use bevy::camera::visibility::RenderLayers;
use bevy::core_pipeline::tonemapping::Tonemapping;
use bevy::ecs::message::MessageReader;
use bevy::image::ImageSampler;
use bevy::input::mouse::MouseWheel;
use bevy::prelude::*;
use bevy::render::render_resource::TextureFormat;
use bevy::window::PrimaryWindow;
use bevy_rapier3d::prelude::PhysicsSet;

use super::pixelate::PixelateSettings;
use super::player::{Player, PlayerMovement};

const CAMERA_OFFSET: Vec3 = Vec3::new(15.0, 20.0, 15.0);
const VIEWPORT_HEIGHT: f32 = 20.0;
/// Pixel Density: render pixels per world unit.
/// 1 tile = 1.0 world unit = 32 render pixels.
/// Camera snap step = 1/32 = 0.03125 world units.
pub const PIXEL_DENSITY: u32 = 32;
/// World size of one render pixel (1 / PIXEL_DENSITY).
const PIXEL_STEP: f32 = 1.0 / PIXEL_DENSITY as f32;
/// RenderLayer for the display quad (separate from the 3D scene on layer 0).
const DISPLAY_LAYER: usize = 1;

const ZOOM_MIN: f32 = 0.5;
const ZOOM_MAX: f32 = 2.0;
const ZOOM_SPEED: f32 = 0.10;
const ZOOM_SMOOTHING: f32 = 8.0;

#[derive(Resource)]
struct CameraZoom {
    target: f32,
    current: f32,
}

impl Default for CameraZoom {
    fn default() -> Self {
        Self {
            target: 1.0,
            current: 1.0,
        }
    }
}

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
        app.init_resource::<CameraZoom>();
        app.add_systems(Startup, setup_camera);
        app.add_systems(Update, handle_zoom_input);
        app.add_systems(
            PostUpdate,
            (camera_follow_player, apply_camera_zoom)
                .chain()
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
    let aspect = window.width() / window.height();

    // Fixed render buffer: height locked to VIEWPORT_HEIGHT * PIXEL_DENSITY,
    // width adapts to window aspect ratio.  Exactly 32 pixels per world unit.
    let render_h = (VIEWPORT_HEIGHT * PIXEL_DENSITY as f32) as u32; // 640
    let render_w = (render_h as f32 * aspect) as u32;

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
        PixelateSettings::default(),
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
) {
    let Ok(player_tf) = player_query.single() else {
        return;
    };
    let Ok(mut camera_tf) = camera_query.single_mut() else {
        return;
    };

    let desired = player_tf.translation + CAMERA_OFFSET;

    // Use precomputed stable axes to avoid drift from reading mutated transform
    let axes = &*STABLE_AXES;
    let right = axes.right;
    let up = axes.up;
    let forward = axes.forward;

    let right_proj = desired.dot(right);
    let up_proj = desired.dot(up);
    let forward_proj = desired.dot(forward);

    // Snap camera to pixel grid on ALL axes using fixed PIXEL_STEP (1/32).
    // Right/Up snapping locks the pixel grid for geometry.
    // Forward snapping stabilizes the shadow cascade alignment.
    let snapped_right = (right_proj / PIXEL_STEP).round() * PIXEL_STEP;
    let snapped_up = (up_proj / PIXEL_STEP).round() * PIXEL_STEP;
    let snapped_forward = (forward_proj / PIXEL_STEP).round() * PIXEL_STEP;

    camera_tf.translation = snapped_right * right + snapped_up * up + snapped_forward * forward;
}

fn handle_zoom_input(mut scroll_evr: MessageReader<MouseWheel>, mut zoom: ResMut<CameraZoom>) {
    for ev in scroll_evr.read() {
        let delta = ev.y;
        // Scroll up = zoom in (smaller scale), scroll down = zoom out
        zoom.target = (zoom.target - delta * ZOOM_SPEED).clamp(ZOOM_MIN, ZOOM_MAX);
    }
}

fn apply_camera_zoom(
    time: Res<Time>,
    mut zoom: ResMut<CameraZoom>,
    mut camera_q: Query<&mut Projection, With<IsometricCamera>>,
) {
    let dt = time.delta_secs();
    // Smooth interpolation toward target
    zoom.current += (zoom.target - zoom.current) * (ZOOM_SMOOTHING * dt).min(1.0);

    let Ok(mut proj) = camera_q.single_mut() else {
        return;
    };
    if let Projection::Orthographic(ref mut ortho) = *proj {
        ortho.scale = zoom.current;
    }
}
