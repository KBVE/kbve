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
    player_query: Query<&Transform, (With<Player>, Without<IsometricCamera>, Without<DisplayQuad>)>,
    mut camera_query: Query<
        &mut Transform,
        (With<IsometricCamera>, Without<Player>, Without<DisplayQuad>),
    >,
    mut quad_query: Query<
        &mut Transform,
        (With<DisplayQuad>, Without<IsometricCamera>, Without<Player>),
    >,
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

    // Decompose desired position along camera axes
    let right = camera_tf.right().as_vec3();
    let up = camera_tf.up().as_vec3();
    let forward = camera_tf.forward().as_vec3();

    let right_proj = desired.dot(right);
    let up_proj = desired.dot(up);
    let forward_proj = desired.dot(forward);

    // Snap camera to texel grid — pixels stay locked to fixed world positions (no swimming).
    let snapped_right = (right_proj / pixel_world_size).round() * pixel_world_size;
    let snapped_up = (up_proj / pixel_world_size).round() * pixel_world_size;

    camera_tf.translation = snapped_right * right + snapped_up * up + forward_proj * forward;

    // Sub-pixel offset: shift display quad by the fractional remainder.
    // This makes movement appear smooth despite the camera snapping to a grid.
    // The display camera has viewport_height=1.0, so divide by VIEWPORT_HEIGHT.
    if let Ok(mut quad_tf) = quad_query.single_mut() {
        let remainder_right = right_proj - snapped_right;
        let remainder_up = up_proj - snapped_up;
        quad_tf.translation.x = -remainder_right / VIEWPORT_HEIGHT;
        quad_tf.translation.y = -remainder_up / VIEWPORT_HEIGHT;
    }
}
