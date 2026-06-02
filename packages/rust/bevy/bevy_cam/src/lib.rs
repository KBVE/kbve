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
#[cfg(feature = "zoom")]
use bevy::ecs::message::MessageReader;
use bevy::image::ImageSampler;
#[cfg(feature = "zoom")]
use bevy::input::mouse::MouseWheel;
use bevy::prelude::*;
use bevy::render::render_resource::TextureFormat;
use bevy::transform::TransformSystems;
use bevy::window::PrimaryWindow;

/// Display-quad sub-pixel offset is quantized to this many steps per quad
/// width. Imperceptible at display resolution but reduces
/// `Changed<Transform>` upload chatter from every-frame to only when the
/// offset actually moves ≥ 1/512 of a quad dimension.
const SUBPIXEL_QUANT_STEPS: f32 = 512.0;

#[doc(hidden)]
#[inline(always)]
pub fn quantize(v: f32) -> f32 {
    (v * SUBPIXEL_QUANT_STEPS).round() / SUBPIXEL_QUANT_STEPS
}

#[doc(hidden)]
#[inline(always)]
pub fn pixel_snap_along_axis(pos: Vec3, axis: Vec3, step: f32) -> (f32, f32) {
    let projected = pos.dot(axis);
    let snapped = (projected / step).round() * step;
    (snapped, projected - snapped)
}

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

/// Asset handles the resize system needs to recreate when the window
/// aspect ratio drifts beyond [`ASPECT_RESIZE_THRESHOLD`].
#[derive(Resource)]
struct RenderTargetAssets {
    image: Handle<Image>,
    mesh: Handle<Mesh>,
    /// Kept around so the material asset isn't garbage-collected if a
    /// future feature needs to rebind it (e.g. swapping the upscaler).
    #[allow(dead_code)]
    material: Handle<StandardMaterial>,
}

/// Minimum fractional change in window aspect before the resize system
/// reallocates the render target. Below this, the existing texture is
/// re-used to avoid GPU thrashing on noisy window deltas.
const ASPECT_RESIZE_THRESHOLD: f32 = 0.05;

/// Runtime zoom state — readable/writable by game code. The `settled`
/// flag flips false on new input and true when smoothing converges, so
/// `apply_camera_zoom` can no-op the whole system when the zoom is at
/// rest instead of just early-exiting after computing the delta.
#[derive(Resource)]
pub struct CameraZoom {
    pub target: f32,
    pub current: f32,
    pub settled: bool,
}

impl Default for CameraZoom {
    fn default() -> Self {
        Self {
            target: 1.0,
            current: 1.0,
            settled: true,
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

/// System set for camera systems — use for ordering constraints.
#[derive(SystemSet, Debug, Clone, PartialEq, Eq, Hash)]
pub struct CameraUpdate;

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
        let axes = StableAxes::from_offset(self.config.offset);

        app.insert_resource(self.config.clone());
        app.init_resource::<CameraZoom>();
        app.init_resource::<SubPixelOffset>();
        app.insert_resource(axes);
        app.add_systems(Startup, setup_camera);
        app.add_systems(Update, resize_render_target_on_window_change);

        // Must run BEFORE TransformPropagate so the snapped camera Transform
        // and sub-pixel quad Transform reach GlobalTransform in the same
        // frame, otherwise the renderer sees a 1-frame-old quad offset →
        // visible stutter.
        app.configure_sets(PostUpdate, CameraUpdate.before(TransformSystems::Propagate));

        // `camera_follow_target` must finish before `apply_subpixel_offset`
        // because the latter reads `SubPixelOffset`. Zoom only touches
        // `Projection`, so it can run in parallel with both.
        app.add_systems(
            PostUpdate,
            (
                camera_follow_target.before(apply_subpixel_offset),
                apply_subpixel_offset,
            )
                .in_set(CameraUpdate),
        );

        #[cfg(feature = "zoom")]
        {
            let zoom_locked = (self.config.zoom_max - self.config.zoom_min).abs() <= f32::EPSILON;
            if !zoom_locked {
                app.add_systems(Update, handle_zoom_input);
            }
            app.add_systems(
                PostUpdate,
                apply_camera_zoom
                    .in_set(CameraUpdate)
                    .run_if(|zoom: Res<CameraZoom>| !zoom.settled),
            );
        }
    }
}

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

    let mut render_img =
        Image::new_target_texture(render_w, render_h, TextureFormat::Bgra8UnormSrgb, None);
    render_img.sampler = ImageSampler::nearest();
    let render_handle = images.add(render_img);
    let mesh_handle = meshes.add(Rectangle::new(1.0, 1.0));
    let material_handle = materials.add(StandardMaterial {
        base_color_texture: Some(render_handle.clone()),
        unlit: true,
        ..default()
    });

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

    // Oversized by 2 texels so sub-pixel offset doesn't expose clear color at edges.
    let texel_pad = 2.0 / render_h as f32;
    let quad_w = aspect + texel_pad * aspect;
    let quad_h = 1.0 + texel_pad;
    if let Some(mesh) = meshes.get_mut(&mesh_handle) {
        *mesh = Rectangle::new(quad_w, quad_h).into();
    }
    commands.spawn((
        Mesh3d(mesh_handle.clone()),
        MeshMaterial3d(material_handle.clone()),
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
    commands.insert_resource(RenderTargetAssets {
        image: render_handle,
        mesh: mesh_handle,
        material: material_handle,
    });
}

/// Watch the primary window for size changes; reallocate the render target
/// and refit the display quad when the aspect ratio drifts past
/// [`ASPECT_RESIZE_THRESHOLD`]. The viewport-height baseline is preserved so
/// the world stays at the same vertical world-unit span.
#[allow(clippy::too_many_arguments)]
fn resize_render_target_on_window_change(
    mut resize_evr: bevy::ecs::message::MessageReader<bevy::window::WindowResized>,
    windows: Query<&Window, With<PrimaryWindow>>,
    config: Res<CameraConfig>,
    mut geom: ResMut<RenderGeometry>,
    assets: Res<RenderTargetAssets>,
    mut images: ResMut<Assets<Image>>,
    mut meshes: ResMut<Assets<Mesh>>,
    mut camera_q: Query<&mut bevy::camera::Camera, With<IsometricCamera>>,
) {
    if resize_evr.read().next().is_none() {
        return;
    }
    let Ok(window) = windows.single() else { return };
    if window.width() <= 0.0 || window.height() <= 0.0 {
        return;
    }
    let aspect = window.width() / window.height();
    let prev_aspect = geom.render_w as f32 / geom.render_h.max(1) as f32;
    if (aspect - prev_aspect).abs() / prev_aspect.max(0.001) < ASPECT_RESIZE_THRESHOLD {
        return;
    }

    let render_h = (config.viewport_height * config.pixel_density as f32) as u32;
    let render_w = (render_h as f32 * aspect) as u32;
    if render_w == geom.render_w && render_h == geom.render_h {
        return;
    }

    let mut new_img =
        Image::new_target_texture(render_w, render_h, TextureFormat::Bgra8UnormSrgb, None);
    new_img.sampler = ImageSampler::nearest();
    if let Some(slot) = images.get_mut(&assets.image) {
        *slot = new_img;
    }

    let texel_pad = 2.0 / render_h as f32;
    let quad_w = aspect + texel_pad * aspect;
    let quad_h = 1.0 + texel_pad;
    if let Some(mesh) = meshes.get_mut(&assets.mesh) {
        *mesh = Rectangle::new(quad_w, quad_h).into();
    }

    geom.render_w = render_w;
    geom.render_h = render_h;
    geom.quad_w = quad_w;
    geom.quad_h = quad_h;

    // Force the scene camera to re-acquire its render target's new size.
    if let Ok(mut cam) = camera_q.single_mut() {
        cam.set_changed();
    }
}

fn camera_follow_target(
    target_query: Query<&GlobalTransform, (With<CameraFollowTarget>, Without<IsometricCamera>)>,
    mut camera_query: Query<&mut Transform, (With<IsometricCamera>, Without<CameraFollowTarget>)>,
    config: Res<CameraConfig>,
    axes: Res<StableAxes>,
    mut subpixel: ResMut<SubPixelOffset>,
    // Last desired position cached across frames so the pixel-snap math
    // skips when the player hasn't moved a meaningful fraction of a pixel.
    mut last_desired: Local<Option<Vec3>>,
) {
    let Ok(target_tf) = target_query.single() else {
        return;
    };
    let Ok(mut camera_tf) = camera_query.single_mut() else {
        return;
    };

    let desired = target_tf.translation() + config.offset;
    let pixel_step = 1.0 / config.pixel_density as f32;
    // Skip the snap if the desired position hasn't moved at least 1% of a
    // pixel step on any axis — saves 9 multiplications + 3 rounds per idle
    // frame and avoids retriggering `Changed<Transform>` on the camera.
    let skip_threshold_sq = (pixel_step * 0.01).powi(2);
    if let Some(prev) = *last_desired {
        if (desired - prev).length_squared() < skip_threshold_sq {
            return;
        }
    }
    *last_desired = Some(desired);

    let (snapped_right, rem_right) = pixel_snap_along_axis(desired, axes.right, pixel_step);
    let (snapped_up, rem_up) = pixel_snap_along_axis(desired, axes.up, pixel_step);
    let (snapped_forward, _) = pixel_snap_along_axis(desired, axes.forward, pixel_step);

    subpixel.right = rem_right;
    subpixel.up = rem_up;

    camera_tf.translation =
        snapped_right * axes.right + snapped_up * axes.up + snapped_forward * axes.forward;
}

#[cfg(feature = "zoom")]
fn handle_zoom_input(
    mut scroll_evr: MessageReader<MouseWheel>,
    mut zoom: ResMut<CameraZoom>,
    config: Res<CameraConfig>,
) {
    let mut changed = false;
    for ev in scroll_evr.read() {
        if ev.y > 0.0 {
            zoom.target /= config.zoom_factor;
            changed = true;
        } else if ev.y < 0.0 {
            zoom.target *= config.zoom_factor;
            changed = true;
        }
    }
    if changed {
        zoom.target = zoom.target.clamp(config.zoom_min, config.zoom_max);
        zoom.settled = false;
    }
}

#[cfg(feature = "zoom")]
fn apply_camera_zoom(
    time: Res<Time>,
    mut zoom: ResMut<CameraZoom>,
    config: Res<CameraConfig>,
    mut camera_q: Query<&mut Projection, With<IsometricCamera>>,
) {
    let dt = time.delta_secs();
    zoom.current += (zoom.target - zoom.current) * (config.zoom_smoothing * dt).min(1.0);

    if (zoom.target - zoom.current).abs() < 0.0001 {
        zoom.current = zoom.target;
        zoom.settled = true;
    }

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

    let (target_x, target_y) = if subpixel.right.abs() < 0.0001 && subpixel.up.abs() < 0.0001 {
        (0.0, 0.0)
    } else {
        let pd = config.pixel_density as f32;
        let z = zoom.current;
        // Effective pixel density in world units is `pixel_density / zoom`
        // because zoom scales the orthographic projection.
        (
            quantize(-(subpixel.right * pd / z) / geom.render_w as f32 * geom.quad_w),
            quantize(-(subpixel.up * pd / z) / geom.render_h as f32 * geom.quad_h),
        )
    };

    // Avoid tickling `Changed<Transform>` (and the per-frame GPU upload)
    // when the quantized offset matches what's already there.
    if (quad_tf.translation.x - target_x).abs() > f32::EPSILON {
        quad_tf.translation.x = target_x;
    }
    if (quad_tf.translation.y - target_y).abs() > f32::EPSILON {
        quad_tf.translation.y = target_y;
    }
}

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

        let aligned = Vec3::new(1.0, 2.0, 3.0);
        let right_proj = aligned.dot(axes.right);
        let snapped = (right_proj / pixel_step).round() * pixel_step;
        let re_snapped = (snapped / pixel_step).round() * pixel_step;
        assert!(
            (snapped - re_snapped).abs() < 0.0001,
            "double-snap should be idempotent"
        );
    }

    // ── Behavior tests for the perf-audit changes (issue #8190) ────────

    #[test]
    fn quantize_rounds_to_step() {
        // 1/512 step ≈ 0.001953
        assert_eq!(quantize(0.0), 0.0);
        assert!((quantize(0.001) - 0.001953125).abs() < 1e-6);
        assert!((quantize(0.5) - 0.5).abs() < 1e-6);
    }

    #[test]
    fn quantize_is_idempotent() {
        for raw in [0.0f32, 0.001, 0.012345, -0.075, 0.4999].iter() {
            let once = quantize(*raw);
            let twice = quantize(once);
            assert!(
                (once - twice).abs() < 1e-7,
                "double-quantize should be idempotent (raw={raw}, once={once}, twice={twice})"
            );
        }
    }

    #[test]
    fn quantize_step_resolution() {
        // Smaller than 1/(2*512) → rounds to 0.
        assert_eq!(quantize(0.0009), 0.0);
        // Just over half a step → rounds up.
        assert!((quantize(0.001) - 1.0 / 512.0).abs() < 1e-6);
    }

    #[test]
    fn pixel_snap_along_axis_helper_matches_inline() {
        let axes = StableAxes::from_offset(Vec3::new(15.0, 20.0, 15.0));
        let step = 1.0 / 32.0;
        let pos = Vec3::new(3.7, 1.2, -2.4);

        let (snapped, remainder) = pixel_snap_along_axis(pos, axes.right, step);
        let projected = pos.dot(axes.right);
        let expected_snapped = (projected / step).round() * step;
        assert!((snapped - expected_snapped).abs() < 1e-6);
        assert!((remainder - (projected - expected_snapped)).abs() < 1e-6);
        assert!(remainder.abs() <= step / 2.0 + 1e-6);
    }

    #[test]
    fn camera_zoom_default_is_settled() {
        let zoom = CameraZoom::default();
        assert!(zoom.settled, "fresh zoom should report settled");
        assert_eq!(zoom.target, zoom.current);
    }

    #[test]
    fn aspect_resize_threshold_is_sane() {
        // Sub-pixel jitter in window dragging shouldn't trigger a
        // reallocation, but a real device-rotation / split-screen change
        // (e.g. 16:9 → 4:3) should.
        let prev: f32 = 1920.0 / 1080.0;
        let micro: f32 = 1921.0 / 1080.0;
        let major: f32 = 1440.0 / 1080.0;
        assert!((micro - prev).abs() / prev.max(0.001) < ASPECT_RESIZE_THRESHOLD);
        assert!((major - prev).abs() / prev.max(0.001) > ASPECT_RESIZE_THRESHOLD);
    }

    #[test]
    fn stationary_skip_threshold_is_sub_pixel() {
        // The `camera_follow_target` early-exit uses (pixel_step * 0.01)^2.
        // Verify the threshold sits well under a single snap step so the
        // camera never silently misses a real movement.
        let step: f32 = 1.0 / 32.0;
        let threshold = (step * 0.01).powi(2).sqrt();
        assert!(
            threshold < step / 10.0,
            "threshold {threshold} must be << one pixel step {step}"
        );
        assert!(threshold > 0.0);
    }

    // ── Resize behaviour tests (issue #8190 — finding #5) ──────────────

    /// Recreate the exact math the resize system uses to derive
    /// render_w/render_h/quad_w/quad_h so a future refactor can't drift
    /// the dimensions without flipping this test red.
    fn recompute_geometry(
        aspect: f32,
        viewport_height: f32,
        pixel_density: u32,
    ) -> (u32, u32, f32, f32) {
        let render_h = (viewport_height * pixel_density as f32) as u32;
        let render_w = (render_h as f32 * aspect) as u32;
        let texel_pad = 2.0 / render_h as f32;
        let quad_w = aspect + texel_pad * aspect;
        let quad_h = 1.0 + texel_pad;
        (render_w, render_h, quad_w, quad_h)
    }

    #[test]
    fn resize_keeps_viewport_height_constant_across_aspects() {
        let config = CameraConfig::default();
        let (_, h_169, _, _) =
            recompute_geometry(16.0 / 9.0, config.viewport_height, config.pixel_density);
        let (_, h_43, _, _) =
            recompute_geometry(4.0 / 3.0, config.viewport_height, config.pixel_density);
        let (_, h_219, _, _) =
            recompute_geometry(21.0 / 9.0, config.viewport_height, config.pixel_density);
        assert_eq!(h_169, h_43, "render_h must not depend on aspect");
        assert_eq!(h_43, h_219);
    }

    #[test]
    fn resize_render_width_scales_with_aspect() {
        let config = CameraConfig::default();
        let (w_169, _, _, _) =
            recompute_geometry(16.0 / 9.0, config.viewport_height, config.pixel_density);
        let (w_43, _, _, _) =
            recompute_geometry(4.0 / 3.0, config.viewport_height, config.pixel_density);
        let (w_219, _, _, _) =
            recompute_geometry(21.0 / 9.0, config.viewport_height, config.pixel_density);
        assert!(w_43 < w_169, "narrower aspect must shrink render width");
        assert!(w_169 < w_219, "wider aspect must expand render width");
    }

    #[test]
    fn quad_dimensions_include_texel_padding() {
        let config = CameraConfig::default();
        let aspect = 16.0_f32 / 9.0;
        let (_, h, qw, qh) =
            recompute_geometry(aspect, config.viewport_height, config.pixel_density);
        // The padding must be strictly positive so the sub-pixel offset
        // can move the quad without exposing the clear color at edges.
        assert!(qw > aspect, "quad_w should overshoot raw aspect");
        assert!(qh > 1.0, "quad_h should overshoot raw unit height");
        // And it must equal exactly two render pixels — the system relies
        // on this when computing the offset budget in `apply_subpixel`.
        let expected_pad = 2.0 / h as f32;
        assert!((qh - (1.0 + expected_pad)).abs() < 1e-6);
    }

    #[test]
    fn aspect_threshold_round_trip_is_idempotent() {
        // Resizing back to the original aspect after a major shift should
        // re-cross the threshold (so the render target follows the user
        // around even when they rotate, undo, rotate again).
        let prev: f32 = 16.0 / 9.0;
        let rotated: f32 = 9.0 / 16.0;
        assert!((rotated - prev).abs() / prev > ASPECT_RESIZE_THRESHOLD);
        assert!((prev - rotated).abs() / rotated > ASPECT_RESIZE_THRESHOLD);
    }

    #[test]
    fn quantize_handles_negative_and_large_inputs() {
        // Hot-path math must stay symmetric around zero and not blow up
        // on values larger than the quad — both are reachable when the
        // camera is on the world boundary or under a huge zoom-out.
        assert_eq!(quantize(-0.0), 0.0);
        assert!((quantize(-0.5) + 0.5).abs() < 1e-6);
        assert!((quantize(-1234.5) - (-1234.5)).abs() < 1.0 / SUBPIXEL_QUANT_STEPS);
        assert!((quantize(987.654) - 987.654).abs() < 1.0 / SUBPIXEL_QUANT_STEPS);
    }

    #[test]
    fn pixel_snap_remainder_always_within_half_step() {
        let axes = StableAxes::from_offset(Vec3::new(15.0, 20.0, 15.0));
        let step = 1.0_f32 / 32.0;
        for seed in 0..256 {
            let t = seed as f32 * 0.0137;
            let pos = Vec3::new(t.cos() * 50.0, t.sin() * 10.0, t * 0.91 - 17.0);
            let (_, rem) = pixel_snap_along_axis(pos, axes.right, step);
            assert!(
                rem.abs() <= step / 2.0 + 1e-6,
                "remainder {rem} exceeds half pixel step {:.6} for pos {pos:?}",
                step / 2.0
            );
        }
    }
}
