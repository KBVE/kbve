use bevy::prelude::*;

use super::common::{CreaturePool, hash_f32, night_factor, scene_center};
use crate::game::camera::IsometricCamera;
use crate::game::weather::{DayCycle, WindState};

const FIREFLY_COUNT: usize = 40;

#[derive(Component)]
pub(super) struct Firefly {
    phase: f32,
    anchor: Vec3,
    glow_phase: f32,
    glow_period: f32,
    orbit_radius: f32,
    orbit_speed: f32,
    mat_handle: Handle<StandardMaterial>,
    light_entity: Entity,
}

pub(super) fn spawn_fireflies(
    mut commands: Commands,
    mut meshes: ResMut<Assets<Mesh>>,
    mut materials: ResMut<Assets<StandardMaterial>>,
    mut pool: ResMut<CreaturePool>,
) {
    if pool.fireflies_spawned {
        return;
    }
    pool.fireflies_spawned = true;

    let fly_mesh = meshes.add(Sphere::new(0.04).mesh().ico(1).unwrap());

    for i in 0..FIREFLY_COUNT {
        let seed = i as u32;
        let phase = hash_f32(seed * 7 + 1);
        let glow_period = 2.0 + hash_f32(seed * 13 + 3) * 3.0;
        let orbit_radius = 0.4 + hash_f32(seed * 19 + 5) * 0.8;
        let orbit_speed = 0.6 + hash_f32(seed * 23 + 7) * 0.8;

        let mat = materials.add(StandardMaterial {
            base_color: Color::srgba(0.5, 0.9, 0.3, 0.0),
            emissive: LinearRgba::new(0.0, 0.0, 0.0, 1.0),
            unlit: true,
            alpha_mode: AlphaMode::Blend,
            ..default()
        });
        let mat_clone = mat.clone();

        let light_entity = commands
            .spawn((
                PointLight {
                    color: Color::srgb(0.4, 0.85, 0.25),
                    intensity: 0.0,
                    radius: 0.05,
                    range: 5.0,
                    shadows_enabled: false,
                    ..default()
                },
                Transform::from_xyz(0.0, -100.0, 0.0),
                Visibility::Hidden,
            ))
            .id();

        commands.spawn((
            Mesh3d(fly_mesh.clone()),
            MeshMaterial3d(mat),
            Transform::from_xyz(0.0, -100.0, 0.0),
            Visibility::Hidden,
            Firefly {
                phase,
                anchor: Vec3::ZERO,
                glow_phase: phase,
                glow_period,
                orbit_radius,
                orbit_speed,
                mat_handle: mat_clone,
                light_entity,
            },
        ));
    }
}

pub(super) fn animate_fireflies(
    time: Res<Time>,
    day: Res<DayCycle>,
    wind: Res<WindState>,
    mut materials: ResMut<Assets<StandardMaterial>>,
    camera_q: Query<&Transform, With<IsometricCamera>>,
    mut fly_q: Query<(&mut Transform, &mut Firefly, &mut Visibility), Without<IsometricCamera>>,
    mut light_q: Query<
        (&mut PointLight, &mut Transform, &mut Visibility),
        (Without<IsometricCamera>, Without<Firefly>),
    >,
) {
    let Ok(cam_tf) = camera_q.single() else {
        return;
    };
    let dt = time.delta_secs();
    let t = time.elapsed_secs();
    let nf = night_factor(day.hour);

    if nf < 0.01 {
        for (_, mut fly, mut vis) in &mut fly_q {
            *vis = Visibility::Hidden;
            fly.anchor.y = -100.0;
            if let Ok((mut pl, _, mut lvis)) = light_q.get_mut(fly.light_entity) {
                pl.intensity = 0.0;
                *lvis = Visibility::Hidden;
            }
        }
        return;
    }

    let cam_pos = cam_tf.translation;
    let center = scene_center(cam_pos);
    let (wd_x, wd_z) = wind.direction;
    let wind_drift = wind.speed_mph * 0.003;

    for (mut tf, mut fly, mut vis) in &mut fly_q {
        fly.glow_phase += dt / fly.glow_period;
        if fly.glow_phase >= 1.0 {
            fly.glow_phase -= 1.0;
        }

        let dist_to_scene = Vec2::new(fly.anchor.x - center.x, fly.anchor.z - center.z).length();
        if dist_to_scene > 24.0 || fly.anchor.y < -50.0 {
            let seed = (fly.phase * 10000.0) as u32 + (t * 3.7) as u32;
            let rx = hash_f32(seed) * 2.0 - 1.0;
            let rz = hash_f32(seed + 100) * 2.0 - 1.0;
            let ry = hash_f32(seed + 200);
            fly.anchor = center + Vec3::new(rx * 18.0, 1.5 + ry * 2.5, rz * 18.0);
        }

        let p = fly.phase;
        let spd = fly.orbit_speed;
        let r = fly.orbit_radius;
        let ox = (t * spd * 0.7 + p * 6.28).sin() * r + (t * spd * 1.3 + p * 3.14).sin() * r * 0.4;
        let oy = (t * spd * 0.5 + p * 4.71).sin() * 0.3 + (t * spd * 1.1 + p * 2.09).cos() * 0.15;
        let oz = (t * spd * 0.9 + p * 5.24).cos() * r + (t * spd * 1.7 + p * 1.57).cos() * r * 0.3;

        let wind_off = Vec3::new(wd_x * wind_drift * t, 0.0, wd_z * wind_drift * t);
        let pos = fly.anchor + Vec3::new(ox, oy, oz) + wind_off;
        tf.translation = pos;
        *vis = Visibility::Visible;

        let pulse_t = fly.glow_phase;
        let glow = if pulse_t < 0.15 {
            (pulse_t / 0.15 * std::f32::consts::PI).sin()
        } else if pulse_t < 0.25 {
            0.0
        } else if pulse_t < 0.40 {
            ((pulse_t - 0.25) / 0.15 * std::f32::consts::PI).sin() * 0.6
        } else {
            0.0
        };

        let intensity = glow * nf;

        if let Some(mat) = materials.get_mut(&fly.mat_handle) {
            let emit = intensity * 12.0;
            mat.emissive = LinearRgba::new(0.3 * emit, 0.85 * emit, 0.15 * emit, 1.0);
            mat.base_color = Color::srgba(0.5, 0.9, 0.3, intensity * 0.9 + 0.15 * nf);
        }

        if let Ok((mut pl, mut ltf, mut lvis)) = light_q.get_mut(fly.light_entity) {
            pl.intensity = intensity * 2800.0;
            ltf.translation = pos;
            *lvis = if intensity > 0.01 {
                Visibility::Visible
            } else {
                Visibility::Hidden
            };
        }
    }
}
