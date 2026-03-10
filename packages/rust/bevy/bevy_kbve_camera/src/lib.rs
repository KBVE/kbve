//! # bevy_kbve_camera
//!
//! Isometric camera plugin for Bevy with pixel snapping, smooth zoom, and
//! a two-stage render-to-texture pipeline for crisp pixel-art rendering.
//!
//! ## Usage
//!
//! ```ignore
//! use bevy_kbve_camera::{IsometricCameraPlugin, CameraConfig};
//!
//! app.add_plugins(IsometricCameraPlugin::new(CameraConfig {
//!     offset: Vec3::new(15.0, 20.0, 15.0),
//!     viewport_height: 20.0,
//!     pixel_density: 32,
//!     ..default()
//! }));
//! ```

use bevy::camera::ScalingMode;
use bevy::camera::visibility::RenderLayers;
use bevy::core_pipeline::tonemapping::Tonemapping;
use bevy::ecs::message::MessageReader;
use bevy::image::ImageSampler;
use bevy::input::mouse::MouseWheel;
use bevy::prelude::*;
use bevy::render::render_resource::TextureFormat;
use bevy::window::PrimaryWindow;

// ── Configuration ───────────────────────────────────────────────────────

/// Camera configuration — set once at plugin creation.
#[derive(Resource, Debug, Clone)]
pub struct CameraConfig {
    /// Offset from the follow target to the camera position.
    pub offset: Vec3,
    /// Orthographic viewport height in world units.
    pub viewport_height: f32,
    /// Render pixels per world unit (controls pixel-art resolution).
    pub pixel_density: u32,
    /// RenderLayer index for the display quad (must differ from scene layer 0).
    pub display_layer: usize,
    /// Minimum zoom level (< 1.0 = zoomed in).
    pub zoom_min: f32,
    /// Maximum zoom level (> 1.0 = zoomed out).
    pub zoom_max: f32,
    /// Zoom speed multiplier per scroll tick.
    pub zoom_speed: f32,
    /// Zoom interpolation smoothing factor.
    pub zoom_smoothing: f32,
}

impl Default for CameraConfig {
    fn default() -> Self {
        Self {
            offset: Vec3::new(15.0, 20.0, 15.0),
            viewport_height: 20.0,
            pixel_density: 32,
            display_layer: 1,
            zoom_min: 0.5,
            zoom_max: 2.0,
            zoom_speed: 0.10,
            zoom_smoothing: 8.0,
        }
    }
}

// ── Components ──────────────────────────────────────────────────────────

/// Marker for the scene camera that renders the 3D world.
#[derive(Component)]
pub struct IsometricCamera;

/// Marker for the follow target entity. Attach this to the player or
/// any entity the camera should track.
#[derive(Component)]
pub struct CameraFollowTarget;

/// Marker for the display quad.
#[derive(Component)]
struct DisplayQuad;

// ── Resources ───────────────────────────────────────────────────────────

/// Runtime zoom state.
#[derive(Resource)]
pub struct CameraZoom {
    pub target: f32,
    pub current: f32,
}

impl Default for CameraZoom {
    fn default() -> Self {
        Self {
            target: 1.0,
            current: 1.0,
        }
    }
}

/// Precomputed stable camera axes to avoid frame-to-frame drift from
/// reading the mutated transform (causes pixel jitter).
struct StableCameraAxes {
    right: Vec3,
    up: Vec3,
    forward: Vec3,
}

impl StableCameraAxes {
    fn from_offset(offset: Vec3) -> Self {
        let tf = Transform::from_translation(offset).looking_at(Vec3::ZERO, Vec3::Y);
        Self {
            right: tf.right().as_vec3(),
            up: tf.up().as_vec3(),
            forward: tf.forward().as_vec3(),
        }
    }
}

// ── System set ──────────────────────────────────────────────────────────

/// System set for camera systems — use for ordering constraints.
#[derive(SystemSet, Debug, Clone, PartialEq, Eq, Hash)]
pub struct CameraUpdate;

// ── Plugin ──────────────────────────────────────────────────────────────

pub struct IsometricCameraPlugin {
    config: CameraConfig,
}

impl IsometricCameraPlugin {
    pub fn new(config: CameraConfig) -> Self {
        Self { config }
    }
}

impl Default for IsometricCameraPlugin {
    fn default() -> Self {
        Self {
            config: CameraConfig::default(),
        }
    }
}

impl Plugin for IsometricCameraPlugin {
    fn build(&self, app: &mut App) {
        let axes = StableCameraAxes::from_offset(self.config.offset);

        app.insert_resource(self.config.clone());
        app.init_resource::<CameraZoom>();
        app.insert_resource(StableAxesResource {
            right: axes.right,
            up: axes.up,
            forward: axes.forward,
        });
        app.add_systems(Startup, setup_camera);
        app.add_systems(Update, handle_zoom_input);
        app.add_systems(
            PostUpdate,
            (camera_follow_target, apply_camera_zoom)
                .chain()
                .in_set(CameraUpdate),
        );
    }
}

/// Internal resource holding precomputed axes.
#[derive(Resource)]
struct StableAxesResource {
    right: Vec3,
    up: Vec3,
    forward: Vec3,
}

// ── Systems ─────────────────────────────────────────────────────────────

fn setup_camera(
    mut commands: Commands,
    mut images: ResMut<Assets<Image>>,
    mut meshes: ResMut<Assets<Mesh>>,
    mut materials: ResMut<Assets<StandardMaterial>>,
    windows: Query<&Window, With<PrimaryWindow>>,
    config: Res<CameraConfig>,
) {
    let Ok(window) = windows.single() else { return };
    let aspect = window.width() / window.height();

    let render_h = (config.viewport_height * config.pixel_density as f32) as u32;
    let render_w = (render_h as f32 * aspect) as u32;

    // Low-res render target with nearest-neighbor sampling
    let mut render_img =
        Image::new_target_texture(render_w, render_h, TextureFormat::Bgra8UnormSrgb, None);
    render_img.sampler = ImageSampler::nearest();
    let render_handle = images.add(render_img);

    // Stage 1: Scene camera → low-res texture
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
            scaling_mode: ScalingMode::FixedVertical {
                viewport_height: config.viewport_height,
            },
            ..OrthographicProjection::default_3d()
        }),
        Transform::from_translation(config.offset).looking_at(Vec3::ZERO, Vec3::Y),
        IsometricCamera,
    ));

    // Stage 2: Display camera → window
    commands.spawn((
        Camera3d::default(),
        Camera {
            order: 0,
            ..default()
        },
        Msaa::Off,
        Tonemapping::None,
        Projection::from(OrthographicProjection {
            scaling_mode: ScalingMode::FixedVertical {
                viewport_height: 1.0,
            },
            ..OrthographicProjection::default_3d()
        }),
        Transform::from_xyz(0.0, 0.0, 10.0).looking_at(Vec3::ZERO, Vec3::Y),
        RenderLayers::layer(config.display_layer),
    ));

    // Fullscreen quad with render texture (slightly oversized to avoid edge artifacts)
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
        RenderLayers::layer(config.display_layer),
        DisplayQuad,
    ));
}

fn camera_follow_target(
    target_query: Query<&Transform, (With<CameraFollowTarget>, Without<IsometricCamera>)>,
    mut camera_query: Query<&mut Transform, (With<IsometricCamera>, Without<CameraFollowTarget>)>,
    config: Res<CameraConfig>,
    axes: Res<StableAxesResource>,
) {
    let Ok(target_tf) = target_query.single() else {
        return;
    };
    let Ok(mut camera_tf) = camera_query.single_mut() else {
        return;
    };

    let desired = target_tf.translation + config.offset;
    let pixel_step = 1.0 / config.pixel_density as f32;

    // Snap to pixel grid on all axes
    let right_proj = desired.dot(axes.right);
    let up_proj = desired.dot(axes.up);
    let forward_proj = desired.dot(axes.forward);

    let snapped_right = (right_proj / pixel_step).round() * pixel_step;
    let snapped_up = (up_proj / pixel_step).round() * pixel_step;
    let snapped_forward = (forward_proj / pixel_step).round() * pixel_step;

    camera_tf.translation =
        snapped_right * axes.right + snapped_up * axes.up + snapped_forward * axes.forward;
}

fn handle_zoom_input(
    mut scroll_evr: MessageReader<MouseWheel>,
    mut zoom: ResMut<CameraZoom>,
    config: Res<CameraConfig>,
) {
    for ev in scroll_evr.read() {
        zoom.target =
            (zoom.target - ev.y * config.zoom_speed).clamp(config.zoom_min, config.zoom_max);
    }
}

fn apply_camera_zoom(
    time: Res<Time>,
    mut zoom: ResMut<CameraZoom>,
    config: Res<CameraConfig>,
    mut camera_q: Query<&mut Projection, With<IsometricCamera>>,
) {
    let dt = time.delta_secs();
    zoom.current += (zoom.target - zoom.current) * (config.zoom_smoothing * dt).min(1.0);

    let Ok(mut proj) = camera_q.single_mut() else {
        return;
    };
    if let Projection::Orthographic(ref mut ortho) = *proj {
        ortho.scale = zoom.current;
    }
}

// ── Tests ───────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_config() {
        let config = CameraConfig::default();
        assert_eq!(config.pixel_density, 32);
        assert_eq!(config.viewport_height, 20.0);
        assert!(config.zoom_min < config.zoom_max);
    }

    #[test]
    fn stable_axes_are_orthogonal() {
        let axes = StableCameraAxes::from_offset(Vec3::new(15.0, 20.0, 15.0));
        let dot_ru = axes.right.dot(axes.up).abs();
        let dot_rf = axes.right.dot(axes.forward).abs();
        assert!(dot_ru < 0.001, "right and up should be orthogonal");
        assert!(dot_rf < 0.001, "right and forward should be orthogonal");
    }

    #[test]
    fn pixel_step_calculation() {
        let config = CameraConfig::default();
        let step = 1.0 / config.pixel_density as f32;
        assert!((step - 0.03125).abs() < 0.0001);
    }

    #[test]
    fn zoom_clamp() {
        let config = CameraConfig::default();
        let clamped = 0.1_f32.clamp(config.zoom_min, config.zoom_max);
        assert_eq!(clamped, config.zoom_min);
        let clamped = 5.0_f32.clamp(config.zoom_min, config.zoom_max);
        assert_eq!(clamped, config.zoom_max);
    }
}
