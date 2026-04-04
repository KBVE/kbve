use bevy::asset::RenderAssetUsages;
use bevy::light::{
    CascadeShadowConfigBuilder, Cascades, DirectionalLightShadowMap, SimulationLightSystems,
};
use bevy::mesh::{Indices, PrimitiveTopology};
use bevy::prelude::*;

use super::camera::IsometricCamera;
use super::creatures::GameTime;
use super::net::ServerTime;
use super::tilemap::TileMaterials;
use super::trees::TreeWindSway;

// ---------------------------------------------------------------------------
// Day/night cycle
// ---------------------------------------------------------------------------

/// Marker component for the sun (directional light driven by day cycle).
#[derive(Component)]
struct Sun;

/// Tracks in-game time. 1 real minute = 1 game hour (60× speed).
/// Full day cycle = 24 real minutes.
#[derive(Resource)]
pub struct DayCycle {
    /// Current game hour (0.0–24.0). Wraps at 24.
    pub hour: f32,
    /// Game-hours per real-second (default: 1/60 → 60× speed).
    pub speed: f32,
}

impl Default for DayCycle {
    fn default() -> Self {
        Self {
            hour: 10.0,        // start mid-morning
            speed: 1.0 / 60.0, // 1 real min = 1 game hour
        }
    }
}

/// Sun arc parameters derived from game hour.
struct SunParams {
    /// Direction the light points (normalized, toward ground).
    direction: Vec3,
    /// Direct light illuminance (lux).
    illuminance: f32,
    /// Light color (sRGB linear).
    color: Color,
    /// Ambient brightness.
    ambient_brightness: f32,
    /// Ambient color.
    ambient_color: Color,
    /// 0.0 at night, 1.0 at zenith — used to tint unlit materials.
    sun_height: f32,
}

/// Compute sun parameters for a given game hour.
/// Sun rises ~6:00, peaks ~12:00, sets ~18:00. Night 20:00–4:00.
fn sun_params(hour: f32) -> SunParams {
    // Sun elevation: 0 at horizon, π/2 at zenith
    // Maps 6:00=sunrise, 12:00=zenith, 18:00=sunset
    // Outside 5:00–19:00 the sun is below horizon
    let sun_progress = ((hour - 5.0) / 14.0).clamp(0.0, 1.0); // 0 at 5:00, 1 at 19:00
    let elevation = (sun_progress * std::f32::consts::PI).sin() * 1.2; // peaks > 1.0, clamped later
    let elevation = elevation.clamp(0.0, std::f32::consts::FRAC_PI_2 - 0.05);

    // Sun azimuth: rotates from east (6:00) to west (18:00)
    let azimuth_progress = ((hour - 6.0) / 12.0).clamp(0.0, 1.0);
    let azimuth = std::f32::consts::PI * 0.25 + azimuth_progress * std::f32::consts::PI * 0.5;

    // sun_height: 0.0 at horizon/night, 1.0 at zenith.
    // This is the natural blend factor — everything follows the sun's position.
    let sun_height = if hour >= 5.0 && hour <= 19.0 {
        elevation / (std::f32::consts::FRAC_PI_2 - 0.05)
    } else {
        0.0
    };

    // Light direction: blend between sun arc and moon based on sun height.
    // As the sun dips toward the horizon, direction gradually shifts to moonlight.
    let cos_el = elevation.cos();
    let sin_el = elevation.sin();
    let sun_dir = Vec3::new(-azimuth.cos() * cos_el, -sin_el, -azimuth.sin() * cos_el).normalize();
    let moon_dir = Vec3::new(-0.15, -0.97, -0.20).normalize();
    let direction = (sun_dir * sun_height + moon_dir * (1.0 - sun_height)).normalize();

    // Illuminance: gentle accent — pixel-art style relies on ambient, not harsh shadows.
    // ~2:1 ratio with ambient keeps valleys readable.
    let illuminance = 35.0 + sun_height * 1780.0;

    // Light color: warm golden near horizon, white at zenith, cool blue at night.
    let lr = 0.4 + sun_height * 0.6;
    let lg = 0.45 + sun_height * 0.55;
    let lb = 0.65 + sun_height * 0.35;
    let color = Color::srgb(lr, lg, lb);

    // Ambient: dominant fill — the main brightness source in a stylized world.
    // Shadowed areas (valleys) should be tinted, never crushed to dark.
    let ambient_brightness = 420.0 + sun_height * 580.0;
    let ambient_color = Color::srgb(
        0.55 + sun_height * 0.35,
        0.60 + sun_height * 0.32,
        0.50 + sun_height * 0.25,
    );

    SunParams {
        direction,
        illuminance,
        color,
        ambient_brightness,
        ambient_color,
        sun_height,
    }
}

// ---------------------------------------------------------------------------
// Wind state
// ---------------------------------------------------------------------------

#[derive(Resource)]
pub struct WindState {
    pub speed_mph: f32, // 0 = calm, 5 = gentle breeze, 15 = moderate, 30 = strong
    pub direction: (f32, f32), // normalized XZ direction
}

impl Default for WindState {
    fn default() -> Self {
        Self {
            speed_mph: 8.0,            // gentle breeze
            direction: (0.707, 0.707), // NE
        }
    }
}

// ---------------------------------------------------------------------------
// Blob shadows
// ---------------------------------------------------------------------------

/// Dynamic blob shadow that follows the directional light angle.
#[derive(Component)]
pub struct BlobShadow {
    /// World position of the object base (shadow anchor).
    pub anchor: Vec3,
    /// Shadow disc radius (unscaled).
    pub radius: f32,
    /// Height of the object — taller objects cast longer shadows.
    pub object_height: f32,
}

/// Shared blob shadow mesh + material, created at startup.
#[derive(Resource)]
pub struct BlobShadowAssets {
    pub mesh: Handle<Mesh>,
    pub material: Handle<StandardMaterial>,
}

// ---------------------------------------------------------------------------
// Vegetation wind sway
// ---------------------------------------------------------------------------

/// Attached to small vegetation (flowers, grass) for gentle translation sway.
#[derive(Component)]
pub struct WindSway {
    pub base_translation: Vec3,
    pub phase: f32,
}

// ---------------------------------------------------------------------------
// Wind streaks (Wind Waker-style visual wind trails)
// ---------------------------------------------------------------------------

const WIND_STREAK_COUNT: usize = 10;
const WIND_STREAK_LIFETIME: f32 = 2.8; // seconds per streak cycle

#[derive(Component)]
struct WindStreak {
    age: f32,
    lifetime: f32,
    start_pos: Vec3,
    speed: f32,     // world units/sec along wind direction
    drift_off: f32, // cross-wind offset for variety
    mat_handle: Handle<StandardMaterial>,
}

#[derive(Resource, Default)]
struct WindStreakPool {
    initialized: bool,
}

/// Thin elongated quad mesh for a single wind streak.
fn build_streak_mesh() -> Mesh {
    // Thin line: 0.6 long × 0.012 tall, centered at origin
    let hw = 0.30;
    let hh = 0.006;
    Mesh::new(
        PrimitiveTopology::TriangleList,
        RenderAssetUsages::default(),
    )
    .with_inserted_attribute(
        Mesh::ATTRIBUTE_POSITION,
        vec![
            [-hw, -hh, 0.0],
            [hw, -hh, 0.0],
            [hw, hh, 0.0],
            [-hw, hh, 0.0],
        ],
    )
    .with_inserted_attribute(Mesh::ATTRIBUTE_NORMAL, vec![[0.0, 0.0, 1.0]; 4])
    .with_inserted_attribute(Mesh::ATTRIBUTE_COLOR, vec![[1.0_f32, 1.0, 1.0, 1.0]; 4])
    .with_inserted_indices(Indices::U32(vec![0, 1, 2, 0, 2, 3]))
}

// ---------------------------------------------------------------------------
// Systems
// ---------------------------------------------------------------------------

fn setup_weather(
    mut commands: Commands,
    mut meshes: ResMut<Assets<Mesh>>,
    mut materials: ResMut<Assets<StandardMaterial>>,
) {
    // Blob shadow: unit-radius flat disc (8 segments), scaled per-object at spawn time.
    let blob_shadow_mesh = {
        const SEGS: u32 = 8;
        let mut pos = Vec::with_capacity(SEGS as usize + 1);
        let mut nor = Vec::with_capacity(SEGS as usize + 1);
        let mut idx = Vec::with_capacity(SEGS as usize * 3);
        pos.push([0.0, 0.0, 0.0]);
        nor.push([0.0, 1.0, 0.0]);
        for i in 0..SEGS {
            let a = (i as f32 / SEGS as f32) * std::f32::consts::TAU;
            pos.push([a.cos(), 0.0, a.sin()]);
            nor.push([0.0, 1.0, 0.0]);
        }
        for i in 1..=SEGS {
            let next = if i == SEGS { 1 } else { i + 1 };
            idx.extend_from_slice(&[0, i, next]);
        }
        let uvs = vec![[0.0f32, 0.0]; pos.len()];
        meshes.add(
            Mesh::new(
                PrimitiveTopology::TriangleList,
                RenderAssetUsages::default(),
            )
            .with_inserted_attribute(Mesh::ATTRIBUTE_POSITION, pos)
            .with_inserted_attribute(Mesh::ATTRIBUTE_NORMAL, nor)
            .with_inserted_attribute(Mesh::ATTRIBUTE_UV_0, uvs)
            .with_inserted_indices(Indices::U32(idx)),
        )
    };
    let blob_shadow_mat = materials.add(StandardMaterial {
        base_color: Color::srgba(0.0, 0.0, 0.0, 0.35),
        unlit: true,
        alpha_mode: AlphaMode::Blend,
        ..default()
    });

    commands.insert_resource(BlobShadowAssets {
        mesh: blob_shadow_mesh,
        material: blob_shadow_mat,
    });
}

fn spawn_lighting(mut commands: Commands, day: Res<DayCycle>) {
    let params = sun_params(day.hour);
    commands.insert_resource(GlobalAmbientLight {
        color: params.ambient_color,
        brightness: params.ambient_brightness,
        ..default()
    });
    // Single cascade + pixelated shadow map + texel-snapping stabilisation.
    // Shadow map sized so each shadow texel ≈ 1 scene pixel (32 px/unit).
    // 1024 over 80 units = ~12.8 texels/unit → shadows are ~2.5× chunkier than
    // scene pixels, giving that crisp pixel-art shadow look that blends in.
    commands.insert_resource(DirectionalLightShadowMap { size: 1024 });
    // Position the sun far away along its direction so the transform "looks" right
    let sun_pos = -params.direction * 20.0;
    commands.spawn((
        Sun,
        DirectionalLight {
            illuminance: params.illuminance,
            color: params.color,
            shadows_enabled: true,
            ..default()
        },
        Transform::from_translation(sun_pos).looking_at(Vec3::ZERO, Vec3::Y),
        CascadeShadowConfigBuilder {
            num_cascades: 1,
            minimum_distance: 0.1,
            maximum_distance: 80.0,
            ..default()
        }
        .build(),
    ));
}

/// Stabilise directional shadow maps by texel-snapping the cascade projection.
///
/// Bevy recomputes the cascade frustum from the camera every frame. When the
/// frustum centre moves by sub-texel amounts, shadow edges land on different
/// texels → visible 1-2 px "swimming" on the low-res render target.
///
/// Fix: snap the clip-space translation of each cascade's `clip_from_world`
/// matrix to shadow-texel boundaries so the shadow grid stays locked to the
/// world.
fn stabilize_shadow_cascades(
    shadow_map: Res<DirectionalLightShadowMap>,
    mut query: Query<&mut Cascades, With<DirectionalLight>>,
) {
    let texel_clip = 2.0 / shadow_map.size as f32;
    for mut cascades in query.iter_mut() {
        for cascade_list in cascades.cascades.values_mut() {
            for cascade in cascade_list.iter_mut() {
                let mut m = cascade.clip_from_world;
                m.w_axis.x = (m.w_axis.x / texel_clip).floor() * texel_clip;
                m.w_axis.y = (m.w_axis.y / texel_clip).floor() * texel_clip;
                cascade.clip_from_world = m;
            }
        }
    }
}

/// Reposition blob shadows each frame based on the directional light angle.
/// Shadow offset = light direction projected onto ground plane, scaled by object height.
/// Shadow also stretches along the light direction for a natural elongated look.
fn update_blob_shadows(
    light_query: Query<&GlobalTransform, With<DirectionalLight>>,
    mut shadow_query: Query<(&mut Transform, &BlobShadow)>,
) {
    let Ok(light_gt) = light_query.single() else {
        return;
    };
    // Light forward vector (direction light is pointing)
    let light_dir = light_gt.forward().as_vec3();
    // Project onto ground plane (XZ), normalize
    let ground_dir = Vec2::new(light_dir.x, light_dir.z);
    let ground_len = ground_dir.length();
    if ground_len < 0.001 {
        return;
    }
    let ground_norm = ground_dir / ground_len;
    // How steep the light is — steeper = shorter shadow (sun overhead),
    // shallower = longer shadow (sunrise/sunset)
    let slope = (ground_len / (-light_dir.y).max(0.01)).min(3.0);

    for (mut tf, shadow) in &mut shadow_query {
        let offset_len = shadow.object_height * slope * 0.5;
        let offset_x = ground_norm.x * offset_len;
        let offset_z = ground_norm.y * offset_len;

        tf.translation.x = shadow.anchor.x + offset_x;
        tf.translation.y = shadow.anchor.y;
        tf.translation.z = shadow.anchor.z + offset_z;

        // Stretch shadow along light direction: 1.0 cross-wise, up to 1.5 lengthwise
        let stretch = 1.0 + slope * 0.15;
        let angle = ground_norm.y.atan2(ground_norm.x);
        tf.rotation = Quat::from_rotation_y(-angle);
        tf.scale = Vec3::new(shadow.radius * stretch, 1.0, shadow.radius);
    }
}

/// Advance the game clock. When connected to a server, snap to the server's
/// authoritative time and interpolate locally between syncs. Otherwise run
/// the local clock at default speed.
fn update_day_cycle(
    time: Res<Time>,
    mut day: ResMut<DayCycle>,
    server_time: Option<Res<ServerTime>>,
) {
    if let Some(st) = server_time {
        if st.active {
            // Smoothly interpolate toward server time to avoid jarring snaps.
            // Use the server's day_speed for local extrapolation between syncs.
            day.speed = st.day_speed;
            let target = st.game_hour;
            let diff = target - day.hour;
            // Handle wrap-around (e.g. server=0.1, local=23.9 → diff should be +0.2)
            let wrapped_diff = if diff > 12.0 {
                diff - 24.0
            } else if diff < -12.0 {
                diff + 24.0
            } else {
                diff
            };
            // Blend: fast correction (10x/sec) so we converge within a few frames
            let correction = wrapped_diff * (10.0 * time.delta_secs()).min(1.0);
            day.hour += time.delta_secs() * day.speed + correction;
        } else {
            day.hour += time.delta_secs() * day.speed;
        }
    } else {
        day.hour += time.delta_secs() * day.speed;
    }
    if day.hour >= 24.0 {
        day.hour -= 24.0;
    }
    if day.hour < 0.0 {
        day.hour += 24.0;
    }
}

/// Move the sun and adjust light color/intensity based on time of day.
fn update_sun_position(
    day: Res<DayCycle>,
    mut ambient: ResMut<GlobalAmbientLight>,
    mut sun_query: Query<(&mut DirectionalLight, &mut Transform), With<Sun>>,
) {
    let params = sun_params(day.hour);

    // Update ambient
    ambient.color = params.ambient_color;
    ambient.brightness = params.ambient_brightness;

    // Update sun.
    // Quantise the light *direction* to discrete angular steps so the shadow
    // cascade's basis vectors don't rotate every frame. Without this, even
    // texel-snapping the cascade translation can't prevent shadow wobble
    // because the entire shadow grid orientation shifts continuously.
    // Colour and intensity still interpolate smoothly (no shadow geometry impact).
    let snap_angle = std::f32::consts::PI / 720.0; // 0.25° steps
    let snapped_dir = Vec3::new(
        (params.direction.x / snap_angle).round() * snap_angle,
        (params.direction.y / snap_angle).round() * snap_angle,
        (params.direction.z / snap_angle).round() * snap_angle,
    )
    .normalize();
    for (mut light, mut tf) in &mut sun_query {
        light.illuminance = params.illuminance;
        light.color = params.color;
        let sun_pos = -snapped_dir * 20.0;
        *tf = Transform::from_translation(sun_pos).looking_at(Vec3::ZERO, Vec3::Y);
    }
}

/// Tint the unlit tree material based on time of day.
/// At zenith (sun_height=1): full vertex-color brightness.
/// At night (sun_height=0): darkened + cool blue tint to match the ambient.
fn tint_trees_for_daynight(
    day: Res<DayCycle>,
    tile_materials: Option<Res<TileMaterials>>,
    mut materials: ResMut<Assets<StandardMaterial>>,
) {
    let Some(tile_mats) = tile_materials else {
        return;
    };
    let params = sun_params(day.hour);
    let h = params.sun_height;

    // Night floor: dark desaturated blue-grey.
    // Day peak slightly above 1.0 so noon trees pop with warm sunlit vibrancy.
    let r = 0.18 + h * 0.92;
    let g = 0.20 + h * 0.90;
    let b = 0.28 + h * 0.75;
    if let Some(mat) = materials.get_mut(&tile_mats.tree_body_mat) {
        mat.base_color = Color::srgb(r, g, b);
    }
}

// Frog day/night tinting is now handled in animate_frogs via the
// per-instance storage buffer (SpriteInstanceData.tint). No separate
// weather system needed — the animate system applies df (day factor)
// to each frog's tint every frame.

// Wraith day/night tinting is now handled in animate_wraiths via the
// per-instance storage buffer (SpriteInstanceData.tint).

/// Copy the current DayCycle hour and server creature seed into the shared GameTime resource.
/// Creature modules read GameTime instead of DayCycle directly.
fn sync_game_time(
    day: Res<DayCycle>,
    server_time: Option<Res<ServerTime>>,
    mut game_time: ResMut<GameTime>,
) {
    game_time.hour = day.hour;
    if let Some(st) = server_time {
        if st.active {
            game_time.creature_seed = st.creature_seed;
        }
    }
}

fn animate_veg_wind(
    time: Res<Time>,
    wind: Res<WindState>,
    mut query: Query<(&mut Transform, &WindSway)>,
) {
    let t = time.elapsed_secs();
    let spd = wind.speed_mph;
    if spd < 0.5 {
        return;
    }

    // Vegetation is very flexible — moves more than trees at same wind speed
    let veg_amp = (spd / 10.0).sqrt() * 0.035;
    let gust_speed = 0.8 + spd * 0.04;
    let (dx, dz) = wind.direction;

    for (mut tf, sway) in &mut query {
        let gust = (t * gust_speed + sway.phase).sin() * veg_amp
            + (t * gust_speed * 2.1 + sway.phase * 1.8).sin() * veg_amp * 0.4;
        let flutter = (t * gust_speed * 3.0 + sway.phase * 1.3).sin() * veg_amp * 0.2;
        let pixel_snap = 1.0 / 32.0;
        let ox = ((dx * gust + (-dz) * flutter) / pixel_snap).round() * pixel_snap;
        let oz = ((dz * gust + dx * flutter) / pixel_snap).round() * pixel_snap;
        tf.translation = sway.base_translation + Vec3::new(ox, 0.0, oz);
    }
}

fn animate_tree_wind(
    time: Res<Time>,
    wind: Res<WindState>,
    mut query: Query<(&mut Transform, &TreeWindSway)>,
) {
    let t = time.elapsed_secs();
    let spd = wind.speed_mph;
    if spd < 0.5 {
        return;
    }

    let base_amp = (spd / 10.0).sqrt() * 0.025;
    let lean = (spd / 10.0).min(3.0) * 0.005;
    let gust_speed = 0.5 + spd * 0.03;
    let (dx, dz) = wind.direction;

    for (mut tf, tree) in &mut query {
        let amp = base_amp / tree.stiffness;
        let gust = (t * gust_speed + tree.phase).sin() * amp
            + (t * gust_speed * 2.1 + tree.phase * 2.3).sin() * amp * 0.3;
        let flutter = (t * gust_speed * 2.7 + tree.phase * 1.6).sin() * amp * 0.12;
        let rx = dx * (lean + gust) + (-dz) * flutter;
        let rz = dz * (lean + gust) + dx * flutter;
        let wind_rot = Quat::from_euler(EulerRot::XYZ, rz, 0.0, -rx);
        tf.rotation = tree.base_rotation * wind_rot;
    }
}

fn spawn_wind_streaks(
    mut commands: Commands,
    mut meshes: ResMut<Assets<Mesh>>,
    mut materials: ResMut<Assets<StandardMaterial>>,
    mut pool: ResMut<WindStreakPool>,
) {
    if pool.initialized {
        return;
    }
    pool.initialized = true;

    let streak_mesh = meshes.add(build_streak_mesh());

    for i in 0..WIND_STREAK_COUNT {
        let phase = i as f32 / WIND_STREAK_COUNT as f32;
        // Each streak gets its own material so we can fade alpha independently
        let mat = materials.add(StandardMaterial {
            base_color: Color::srgba(1.0, 1.0, 1.0, 0.0),
            unlit: true,
            alpha_mode: AlphaMode::Blend,
            ..default()
        });
        let mat_clone = mat.clone();
        commands.spawn((
            Mesh3d(streak_mesh.clone()),
            MeshMaterial3d(mat),
            Transform::from_xyz(0.0, -100.0, 0.0),
            Visibility::Hidden,
            WindStreak {
                age: phase * WIND_STREAK_LIFETIME,
                lifetime: WIND_STREAK_LIFETIME + (phase - 0.5) * 0.6,
                start_pos: Vec3::ZERO,
                speed: 2.5 + phase * 1.5,
                drift_off: (phase * 7.3).sin() * 0.3,
                mat_handle: mat_clone,
            },
        ));
    }
}

fn animate_wind_streaks(
    time: Res<Time>,
    wind: Res<WindState>,
    mut materials: ResMut<Assets<StandardMaterial>>,
    camera_q: Query<&Transform, With<IsometricCamera>>,
    mut streak_q: Query<
        (&mut Transform, &mut WindStreak, &mut Visibility),
        Without<IsometricCamera>,
    >,
) {
    let Ok(cam_tf) = camera_q.single() else {
        return;
    };
    let dt = time.delta_secs();
    let spd = wind.speed_mph;
    if spd < 1.0 {
        for (_, _, mut vis) in &mut streak_q {
            *vis = Visibility::Hidden;
        }
        return;
    }

    let (wd_x, wd_z) = wind.direction;
    let wind_dir = Vec3::new(wd_x, 0.0, wd_z);
    let cross = Vec3::new(-wd_z, 0.0, wd_x);
    let cam_pos = cam_tf.translation;
    // Scene center: camera looks down at an offset, streaks spawn around the viewed area
    let scene_center = Vec3::new(cam_pos.x - 15.0, 0.0, cam_pos.z - 15.0);

    // Subtle opacity: barely-there wisps, not cartoon lines
    let opacity_scale = ((spd - 2.0) / 15.0).clamp(0.0, 1.0) * 0.16;

    for (mut tf, mut streak, mut vis) in &mut streak_q {
        streak.age += dt;
        if streak.age >= streak.lifetime {
            streak.age = 0.0;
            let seed = streak.drift_off * 17.3 + time.elapsed_secs() * 3.1;
            let spread_along = seed.sin() * 8.0;
            let spread_cross = (seed * 2.7).cos() * 6.0;
            let height = 1.8 + ((seed * 1.3).sin() * 0.5 + 0.5) * 3.0;
            streak.start_pos = scene_center
                + wind_dir * spread_along
                + cross * (spread_cross + streak.drift_off * 4.0)
                + Vec3::Y * height;
            streak.speed = 2.0 + ((seed * 0.7).cos() * 0.5 + 0.5) * 2.0;
            streak.lifetime = WIND_STREAK_LIFETIME + (seed * 0.4).sin() * 0.5;
        }

        let t_frac = streak.age / streak.lifetime;
        // Gentle fade in/out — long tails, soft appearance
        let alpha = if t_frac < 0.25 {
            t_frac / 0.25
        } else if t_frac > 0.75 {
            (1.0 - t_frac) / 0.25
        } else {
            1.0
        } * opacity_scale;

        if alpha < 0.003 {
            *vis = Visibility::Hidden;
            if let Some(mat) = materials.get_mut(&streak.mat_handle) {
                mat.base_color = Color::srgba(1.0, 1.0, 1.0, 0.0);
            }
            continue;
        }
        *vis = Visibility::Visible;

        // Set per-streak alpha
        if let Some(mat) = materials.get_mut(&streak.mat_handle) {
            mat.base_color = Color::srgba(1.0, 1.0, 1.0, alpha);
        }

        // Drift along wind direction
        let travel = wind_dir * streak.speed * streak.age * (spd / 8.0);
        let pos = streak.start_pos + travel;
        // Billboard: face camera, long axis aligned with wind
        let to_cam = (cam_pos - pos).normalize_or_zero();
        tf.translation = pos;
        tf.look_to(to_cam, Vec3::Y);
        // Stretch with wind speed — longer wisps at higher speed
        let length_scale = 0.7 + spd * 0.05;
        tf.scale = Vec3::new(length_scale, 1.0, 1.0);
    }
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

pub struct WeatherPlugin;

impl Plugin for WeatherPlugin {
    fn build(&self, app: &mut App) {
        app.init_resource::<DayCycle>();
        app.init_resource::<WindState>();
        app.init_resource::<WindStreakPool>();
        app.add_systems(Startup, (setup_weather, spawn_lighting));
        app.add_systems(
            Update,
            (
                update_day_cycle,
                sync_game_time.after(update_day_cycle),
                update_sun_position,
                tint_trees_for_daynight.run_if(resource_changed::<DayCycle>),
                // Frog tinting now in animate_frogs via storage buffer
                // Wraith tinting now in animate_wraiths via storage buffer
                update_blob_shadows.run_if(any_with_component::<BlobShadow>),
                animate_veg_wind.run_if(any_with_component::<WindSway>),
                animate_tree_wind.run_if(any_with_component::<TreeWindSway>),
                spawn_wind_streaks.run_if(|pool: Res<WindStreakPool>| !pool.initialized),
                animate_wind_streaks.run_if(any_with_component::<WindStreak>),
            ),
        );
        app.add_systems(
            PostUpdate,
            stabilize_shadow_cascades.after(SimulationLightSystems::UpdateDirectionalLightCascades),
        );
    }
}
