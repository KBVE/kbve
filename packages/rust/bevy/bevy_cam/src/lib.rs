//! # bevy_cam
//!
//! Isometric camera plugin for Bevy with pixel snapping, multiplicative zoom,
//! and a two-stage render-to-texture pipeline for crisp pixel-art rendering.
//!
//! ## Quick start
//!
//! ```ignore
//! use bevy_cam::{IsometricCameraPlugin, CameraConfig, CameraFollowTarget};
//!
//! app.add_plugins(IsometricCameraPlugin::new(CameraConfig {
//!     offset: Vec3::new(15.0, 20.0, 15.0),
//!     viewport_height: 20.0,
//!     pixel_density: 32,
//!     ..default()
//! }));
//!
//! // Attach CameraFollowTarget to whatever entity the camera should track:
//! commands.spawn((Transform::default(), CameraFollowTarget));
//! ```
//!
//! ## Architecture
//!
//! The plugin creates a two-stage render pipeline:
//!
//! 1. **Scene camera** — renders the 3D world to a low-resolution texture at
//!    `pixel_density` pixels per world unit (nearest-neighbor sampled).
//! 2. **Display camera** — a 2D camera that renders a fullscreen sprite
//!    textured with stage 1 output to the window, producing crisp upscaled
//!    pixel art without the overhead of a 3D material pipeline.
//!
//! The scene camera follows entities marked with [`CameraFollowTarget`],
//! snapping to the pixel grid on all three camera-space axes to eliminate
//! sub-pixel jitter.
//!
//! ## Zoom
//!
//! Scroll-wheel zoom is **multiplicative** — each notch scales by a fixed
//! percentage (`zoom_factor`), so it feels uniform at all zoom levels.
//! Zoom interpolates smoothly toward the target via configurable smoothing.
//!
//! ## Display camera hooks
//!
//! The display camera entity is accessible via the [`DisplayCamera`] marker
//! component. Games can query for it and insert additional components (e.g.
//! post-processing settings) after startup.

use bevy::camera::ScalingMode;
use bevy::camera::visibility::RenderLayers;
use bevy::core_pipeline::tonemapping::Tonemapping;
use bevy::ecs::message::MessageReader;
use bevy::image::ImageSampler;
use bevy::input::mouse::MouseWheel;
use bevy::prelude::*;
use bevy::render::render_resource::TextureFormat;
use bevy::transform::TransformSystems;
use bevy::window::PrimaryWindow;

// ── Configuration ───────────────────────────────────────────────────────

/// Camera configuration — set once at plugin creation, readable as a `Res`.
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
    /// Multiplicative zoom factor per scroll tick (e.g. 1.05 = 5% per notch).
    pub zoom_factor: f32,
    /// Zoom interpolation smoothing factor (lower = smoother).
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
            zoom_factor: 1.05,
            zoom_smoothing: 4.0,
        }
    }
}

// ── Components ──────────────────────────────────────────────────────────

/// Marker for the scene camera that renders the 3D world to the low-res texture.
#[derive(Component)]
pub struct IsometricCamera;

/// Marker for the follow target entity. Attach this to the player or
/// any entity the camera should track.
#[derive(Component)]
pub struct CameraFollowTarget;

/// Marker for the display camera that renders the upscaled quad to the window.
/// Use this to query and attach post-processing components.
#[derive(Component)]
pub struct DisplayCamera;

/// Marker for the display quad.
#[derive(Component)]
struct DisplayQuad;

// ── Resources ───────────────────────────────────────────────────────────

/// Runtime zoom state — readable/writable by game code.
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

/// Sub-pixel remainder from camera snapping.
/// Applied to the display quad each frame for smooth scrolling without pixel swim.
#[derive(Resource, Default)]
struct SubPixelOffset {
    /// Remainder along the camera's right axis (screen X), in world units.
    right: f32,
    /// Remainder along the camera's up axis (screen Y), in world units.
    up: f32,
}

/// Render-target and display-quad geometry computed at setup.
/// Used to convert world-unit remainders to per-axis display offsets.
#[derive(Resource)]
struct RenderGeometry {
    /// Render target width in pixels (integer-truncated from render_h * aspect).
    render_w: u32,
    /// Render target height in pixels (viewport_height * pixel_density, exact).
    render_h: u32,
    /// Display quad width in display-camera units (includes texel padding).
    quad_w: f32,
    /// Display quad height in display-camera units (includes texel padding).
    quad_h: f32,
}

/// Precomputed stable camera axes derived from the initial look-at orientation.
/// Using these instead of reading from the mutated transform avoids
/// frame-to-frame drift that causes visible pixel jitter.
#[derive(Resource)]
struct StableAxes {
    right: Vec3,
    up: Vec3,
    forward: Vec3,
}

impl StableAxes {
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

#[derive(Default)]
pub struct IsometricCameraPlugin {
    config: CameraConfig,
}

impl IsometricCameraPlugin {
    pub fn new(config: CameraConfig) -> Self {
        Self { config }
    }
}

impl Plugin for IsometricCameraPlugin {
    fn build(&self, app: &mut App) {
        let zoom_locked = (self.config.zoom_max - self.config.zoom_min).abs() <= f32::EPSILON;
        let axes = StableAxes::from_offset(self.config.offset);

        app.insert_resource(self.config.clone());
        app.init_resource::<CameraZoom>();
        app.init_resource::<SubPixelOffset>();
        app.insert_resource(axes);
        app.add_systems(Startup, setup_camera);

        // Skip zoom input processing entirely when zoom range is locked.
        if !zoom_locked {
            app.add_systems(Update, handle_zoom_input);
        }

        // CameraUpdate must run BEFORE TransformPropagate so that both the
        // snapped camera Transform and the sub-pixel quad Transform are
        // propagated to GlobalTransform in the same frame. Without this,
        // the renderer sees a 1-frame-old quad offset → visible stutter.
        app.configure_sets(PostUpdate, CameraUpdate.before(TransformSystems::Propagate));
        app.add_systems(
            PostUpdate,
            (
                camera_follow_target,
                apply_camera_zoom,
                apply_subpixel_offset,
            )
                .chain()
                .in_set(CameraUpdate),
        );
    }
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

    // Low-res render target with nearest-neighbor sampling for crisp pixel art
    let mut render_img =
        Image::new_target_texture(render_w, render_h, TextureFormat::Bgra8UnormSrgb, None);
    render_img.sampler = ImageSampler::nearest();
    let render_handle = images.add(render_img);

    // Stage 1: Scene camera renders 3D world to the low-res texture.
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
            scaling_mode: ScalingMode::FixedVertical {
                viewport_height: config.viewport_height,
            },
            ..OrthographicProjection::default_3d()
        }),
        Transform::from_translation(config.offset).looking_at(Vec3::ZERO, Vec3::Y),
        IsometricCamera,
    ));

    // Stage 2: Display camera — uses a 2D camera + fullscreen quad with
    // StandardMaterial(unlit) for the upscaled output. The quad sits on a
    // separate render layer so it doesn't interfere with the 3D scene.
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
        DisplayCamera,
    ));

    // Fullscreen quad with the render texture (unlit = display pixels as-is).
    // Slightly oversized (+2 texels) so sub-pixel offset doesn't expose clear color at edges.
    let texel_pad = 2.0 / render_h as f32;
    let quad_w = aspect + texel_pad * aspect;
    let quad_h = 1.0 + texel_pad;
    let quad_material = materials.add(StandardMaterial {
        base_color_texture: Some(render_handle),
        unlit: true,
        ..default()
    });
    commands.spawn((
        Mesh3d(meshes.add(Rectangle::new(quad_w, quad_h))),
        MeshMaterial3d(quad_material),
        Transform::default(),
        RenderLayers::layer(config.display_layer),
        DisplayQuad,
    ));

    commands.insert_resource(RenderGeometry {
        render_w,
        render_h,
        quad_w,
        quad_h,
    });
}

fn camera_follow_target(
    target_query: Query<&GlobalTransform, (With<CameraFollowTarget>, Without<IsometricCamera>)>,
    mut camera_query: Query<&mut Transform, (With<IsometricCamera>, Without<CameraFollowTarget>)>,
    config: Res<CameraConfig>,
    axes: Res<StableAxes>,
    mut subpixel: ResMut<SubPixelOffset>,
) {
    let Ok(target_tf) = target_query.single() else {
        return;
    };
    let Ok(mut camera_tf) = camera_query.single_mut() else {
        return;
    };

    let desired = target_tf.translation() + config.offset;
    let pixel_step = 1.0 / config.pixel_density as f32;

    // Snap camera to pixel grid on ALL axes using the precomputed stable axes.
    // Right/Up snapping locks the pixel grid for geometry.
    // Forward snapping stabilizes the shadow cascade alignment.
    let right_proj = desired.dot(axes.right);
    let up_proj = desired.dot(axes.up);
    let forward_proj = desired.dot(axes.forward);

    let snapped_right = (right_proj / pixel_step).round() * pixel_step;
    let snapped_up = (up_proj / pixel_step).round() * pixel_step;
    let snapped_forward = (forward_proj / pixel_step).round() * pixel_step;

    // Store the sub-pixel remainder for display quad compensation.
    // This is what makes scrolling smooth — the scene camera snaps to the grid,
    // but we shift the display quad by the fractional part so the player perceives
    // continuous motion instead of 1-pixel jumps.
    subpixel.right = right_proj - snapped_right;
    subpixel.up = up_proj - snapped_up;

    camera_tf.translation =
        snapped_right * axes.right + snapped_up * axes.up + snapped_forward * axes.forward;
}

fn handle_zoom_input(
    mut scroll_evr: MessageReader<MouseWheel>,
    mut zoom: ResMut<CameraZoom>,
    config: Res<CameraConfig>,
) {
    for ev in scroll_evr.read() {
        // Multiplicative: each scroll notch scales by a fixed %, feels uniform at all zoom levels.
        // Scroll up (positive y) = zoom in (smaller ortho scale), scroll down = zoom out.
        if ev.y > 0.0 {
            zoom.target /= config.zoom_factor;
        } else if ev.y < 0.0 {
            zoom.target *= config.zoom_factor;
        }
        zoom.target = zoom.target.clamp(config.zoom_min, config.zoom_max);
    }
}

fn apply_camera_zoom(
    time: Res<Time>,
    mut zoom: ResMut<CameraZoom>,
    config: Res<CameraConfig>,
    mut camera_q: Query<&mut Projection, With<IsometricCamera>>,
) {
    // Skip zoom work entirely when zoom is locked or already settled.
    if (config.zoom_max - config.zoom_min).abs() <= f32::EPSILON {
        return;
    }
    if (zoom.target - zoom.current).abs() < 0.0001 {
        return;
    }

    let dt = time.delta_secs();
    // Smooth interpolation toward target
    zoom.current += (zoom.target - zoom.current) * (config.zoom_smoothing * dt).min(1.0);

    let Ok(mut proj) = camera_q.single_mut() else {
        return;
    };
    if let Projection::Orthographic(ref mut ortho) = *proj {
        ortho.scale = zoom.current;
    }
}

/// Shift the display quad by the sub-pixel remainder so scrolling appears smooth.
/// The scene camera snaps to the pixel grid (preventing pixel swim), while this
/// offset gives the illusion of continuous motion on the upscaled output.
///
/// Conversion chain (each axis uses its own render dimension):
///   1. world remainder → render pixels:  `rem_px = remainder * pixel_density`
///   2. render pixels → normalised [0,1]:  `uv = rem_px / render_dim`
///   3. normalised → display-quad units:   `offset = uv * quad_dim`
///
/// Negated: camera snapped RIGHT of desired → objects shifted LEFT in render
///          → shift display quad RIGHT to compensate.
fn apply_subpixel_offset(
    subpixel: Res<SubPixelOffset>,
    config: Res<CameraConfig>,
    geom: Res<RenderGeometry>,
    zoom: Res<CameraZoom>,
    mut quad_query: Query<&mut Transform, With<DisplayQuad>>,
) {
    let Ok(mut quad_tf) = quad_query.single_mut() else {
        return;
    };

    // Skip quad writes when offset is effectively zero.
    if subpixel.right.abs() < 0.0001 && subpixel.up.abs() < 0.0001 {
        quad_tf.translation.x = 0.0;
        quad_tf.translation.y = 0.0;
        return;
    }

    let pd = config.pixel_density as f32;
    let z = zoom.current;

    // Per-axis: world units → render pixels → UV fraction → quad-space offset.
    // Zoom scales the orthographic projection, so the effective pixel density
    // in world units is `pixel_density / zoom`.
    quad_tf.translation.x = -(subpixel.right * pd / z) / geom.render_w as f32 * geom.quad_w;
    quad_tf.translation.y = -(subpixel.up * pd / z) / geom.render_h as f32 * geom.quad_h;
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
        assert!(config.zoom_factor > 1.0);
    }

    #[test]
    fn stable_axes_are_orthogonal() {
        let axes = StableAxes::from_offset(Vec3::new(15.0, 20.0, 15.0));
        let dot_ru = axes.right.dot(axes.up).abs();
        let dot_rf = axes.right.dot(axes.forward).abs();
        let dot_uf = axes.up.dot(axes.forward).abs();
        assert!(dot_ru < 0.001, "right and up should be orthogonal");
        assert!(dot_rf < 0.001, "right and forward should be orthogonal");
        assert!(dot_uf < 0.001, "up and forward should be orthogonal");
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

    #[test]
    fn multiplicative_zoom_is_symmetric() {
        let config = CameraConfig::default();
        let base = 1.0_f32;
        let zoomed_in = base / config.zoom_factor;
        let back = zoomed_in * config.zoom_factor;
        assert!((back - base).abs() < 0.0001);
    }

    #[test]
    fn axes_from_different_offsets() {
        // Verify axes are valid for non-default offsets
        let axes = StableAxes::from_offset(Vec3::new(10.0, 30.0, 5.0));
        assert!(axes.right.length() > 0.99);
        assert!(axes.up.length() > 0.99);
        assert!(axes.forward.length() > 0.99);
    }

    #[test]
    fn subpixel_remainder_is_bounded() {
        let config = CameraConfig::default();
        let axes = StableAxes::from_offset(config.offset);
        let pixel_step = 1.0 / config.pixel_density as f32;

        // For any position, the remainder must be within [-pixel_step/2, pixel_step/2]
        for i in 0..100 {
            let pos = Vec3::new(i as f32 * 0.037, i as f32 * 0.019, i as f32 * 0.053);
            let right_proj = pos.dot(axes.right);
            let snapped = (right_proj / pixel_step).round() * pixel_step;
            let remainder = right_proj - snapped;
            assert!(
                remainder.abs() <= pixel_step / 2.0 + 0.0001,
                "remainder {remainder} exceeds half pixel step {:.5}",
                pixel_step / 2.0
            );
        }
    }

    #[test]
    fn pixel_snap_is_stable() {
        let config = CameraConfig::default();
        let axes = StableAxes::from_offset(config.offset);
        let pixel_step = 1.0 / config.pixel_density as f32;

        // A position that's already on the pixel grid should not move
        let aligned = Vec3::new(1.0, 2.0, 3.0);
        let right_proj = aligned.dot(axes.right);
        let snapped = (right_proj / pixel_step).round() * pixel_step;
        let re_snapped = (snapped / pixel_step).round() * pixel_step;
        assert!(
            (snapped - re_snapped).abs() < 0.0001,
            "double-snap should be idempotent"
        );
    }
}
