//! Server-seeded firefly system using the unified Creature + EmissiveData components.
//!
//! Firefly world positions are deterministically derived from `GameTime::creature_seed`,
//! divided into spatial chunks. All clients with the same seed see identical firefly
//! placements, enabling collection/capture mechanics.
//!
//! Config (pool size, chunk size, spawn chance) is read from [`CreatureRegistry`]
//! rather than hardcoded, so tuning can happen at the NpcDb level.

use super::creature::ProtoNpcId;
use bevy::prelude::*;
use std::collections::HashSet;

use super::common::{CreatureMeshes, CreaturePool, GameTime, night_factor, scene_center};
use super::creature::{self, Creature, CreatureRegistry, CreatureState, EmissiveData, RenderKind};
use crate::game::camera::IsometricCamera;
use crate::game::weather::WindState;

/// NPC ref slug for fireflies in the CreatureRegistry.
const NPC_REF: &str = "meadow-firefly";

/// How many chunks in each direction from the camera to scan.
const VIEW_RADIUS: i32 = 3;

// ---------------------------------------------------------------------------
// Resources
// ---------------------------------------------------------------------------

/// Tracks active slot assignments and the last-seen creature_seed.
#[derive(Resource, Default)]
pub(super) struct FireflyState {
    active_slots: HashSet<(i32, i32, u16)>,
    last_seed: u64,
}

// ---------------------------------------------------------------------------
// Systems
// ---------------------------------------------------------------------------

/// One-time spawn of the entity pool. All entities start hidden and unassigned.
/// Pool size is read from the CreatureRegistry.
pub(super) fn spawn_fireflies(
    mut commands: Commands,
    creature_meshes: Res<CreatureMeshes>,
    mut materials: ResMut<Assets<StandardMaterial>>,
    mut pool: ResMut<CreaturePool>,
    registry: Res<CreatureRegistry>,
) {
    pool.fireflies_spawned = true;

    let Some(config) = registry.config_by_ref(NPC_REF) else {
        warn!("[firefly] no registry config for '{NPC_REF}' — skipping spawn");
        return;
    };
    let npc_id = registry.npc_db.id_for_ref(NPC_REF).unwrap_or(ProtoNpcId(0));
    let pool_size = config.pool_size;

    let fly_mesh = creature_meshes.firefly_sphere.clone();

    for _ in 0..pool_size {
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
            Creature {
                npc_id,
                render_kind: RenderKind::Emissive,
                state: CreatureState::Pooled,
                slot_seed: 0,
                assigned_slot: None,
                anchor: Vec3::new(0.0, -100.0, 0.0),
                phase: 0.0,
                mat_handle: mat_clone,
            },
            EmissiveData {
                light_entity,
                glow_phase: 0.0,
                glow_period: 3.0,
                orbit_radius: 0.5,
                orbit_speed: 0.7,
            },
        ));
    }

    info!("[firefly] spawned {pool_size} pooled entities");
}

/// Per-frame slot assignment: determines which chunk slots are visible near the
/// camera and assigns/unassigns pool entities to match.
pub(super) fn assign_firefly_slots(
    game_time: Res<GameTime>,
    camera_q: Query<&Transform, With<IsometricCamera>>,
    registry: Res<CreatureRegistry>,
    mut state: ResMut<FireflyState>,
    mut fly_q: Query<(Entity, &mut Creature, &mut EmissiveData, &mut Visibility)>,
    mut light_vis_q: Query<&mut Visibility, (Without<Creature>, Without<IsometricCamera>)>,
) {
    let Ok(cam_tf) = camera_q.single() else {
        return;
    };
    let Some(config) = registry.config_by_ref(NPC_REF) else {
        return;
    };

    let center = scene_center(cam_tf.translation);
    let seed = game_time.creature_seed;
    let chunk_size = config.chunk_size;
    let per_chunk = config.per_chunk;
    let spawn_chance = config.spawn_chance;
    let pool_size = config.pool_size;

    // Seed change → full reset (all entities return to pool)
    if seed != state.last_seed {
        state.last_seed = seed;
        state.active_slots.clear();
        for (_, mut cr, ed, mut vis) in &mut fly_q {
            if let Ok(mut lvis) = light_vis_q.get_mut(ed.light_entity) {
                *lvis = Visibility::Hidden;
            }
            cr.assigned_slot = None;
            cr.state = CreatureState::Pooled;
            *vis = Visibility::Hidden;
        }
    }

    let cam_cx = (center.x / chunk_size).floor() as i32;
    let cam_cz = (center.z / chunk_size).floor() as i32;

    // Enumerate visible slots, sorted by distance to camera center
    let capacity = ((VIEW_RADIUS * 2 + 1) * (VIEW_RADIUS * 2 + 1)) as usize * per_chunk;
    let mut candidates: Vec<((i32, i32, u16), u32, Vec3)> = Vec::with_capacity(capacity);
    for dx in -VIEW_RADIUS..=VIEW_RADIUS {
        for dz in -VIEW_RADIUS..=VIEW_RADIUS {
            let cx = cam_cx + dx;
            let cz = cam_cz + dz;
            for idx in 0..per_chunk {
                let idx16 = idx as u16;
                let ss = creature::slot_seed(seed, cx, cz, idx16);
                if !creature::slot_active(ss, spawn_chance) {
                    continue;
                }
                let anchor = creature::slot_anchor(ss, cx, cz, chunk_size);
                candidates.push(((cx, cz, idx16), ss, anchor));
            }
        }
    }
    candidates.sort_by(|a, b| {
        let da = (a.2.x - center.x).powi(2) + (a.2.z - center.z).powi(2);
        let db = (b.2.x - center.x).powi(2) + (b.2.z - center.z).powi(2);
        da.partial_cmp(&db).unwrap_or(std::cmp::Ordering::Equal)
    });

    let target_set: HashSet<(i32, i32, u16)> =
        candidates.iter().take(pool_size).map(|c| c.0).collect();

    // Snapshot entity states (releases borrow so we can get_mut later)
    let snapshot: Vec<(Entity, Option<(i32, i32, u16)>, Entity)> = fly_q
        .iter()
        .map(|(e, cr, ed, _)| (e, cr.assigned_slot, ed.light_entity))
        .collect();

    // Unassign entities whose slots left the view; collect free entity IDs
    let mut free_entities: Vec<Entity> = Vec::new();
    for &(entity, assigned, light_entity) in &snapshot {
        if let Some(slot) = assigned {
            if !target_set.contains(&slot) {
                state.active_slots.remove(&slot);
                if let Ok((_, mut cr, _, mut vis)) = fly_q.get_mut(entity) {
                    cr.assigned_slot = None;
                    cr.state = CreatureState::Pooled;
                    *vis = Visibility::Hidden;
                }
                if let Ok(mut lvis) = light_vis_q.get_mut(light_entity) {
                    *lvis = Visibility::Hidden;
                }
                free_entities.push(entity);
            }
        } else {
            free_entities.push(entity);
        }
    }

    // Assign free entities to unoccupied target slots (closest first)
    let mut free_idx = 0;
    for &(slot, ss, anchor) in candidates.iter().take(pool_size) {
        if state.active_slots.contains(&slot) {
            continue;
        }
        if free_idx >= free_entities.len() {
            break;
        }
        let entity = free_entities[free_idx];
        free_idx += 1;
        if let Ok((_, mut cr, mut ed, mut vis)) = fly_q.get_mut(entity) {
            creature::apply_slot_base(&mut cr, ss, anchor, slot);
            creature::apply_slot_emissive(&mut ed, ss);
            state.active_slots.insert(slot);
            // Visibility set by animate based on night_factor
            *vis = Visibility::Hidden;
        }
    }
}

/// Per-frame animation: orbital motion, glow pulse, wind drift, night-factor visibility.
pub(super) fn animate_fireflies(
    time: Res<Time>,
    game_time: Res<GameTime>,
    wind: Res<WindState>,
    mut materials: ResMut<Assets<StandardMaterial>>,
    mut fly_q: Query<
        (
            &mut Transform,
            &mut Creature,
            &mut EmissiveData,
            &mut Visibility,
        ),
        Without<IsometricCamera>,
    >,
    mut light_q: Query<
        (&mut PointLight, &mut Transform, &mut Visibility),
        (Without<IsometricCamera>, Without<Creature>),
    >,
) {
    let dt = time.delta_secs();
    let t = time.elapsed_secs();
    let nf = night_factor(game_time.hour);

    // Daytime: hide all active fireflies
    if nf < 0.01 {
        for (_, cr, ed, mut vis) in &mut fly_q {
            if cr.state == CreatureState::Active {
                *vis = Visibility::Hidden;
                if let Ok((mut pl, _, mut lvis)) = light_q.get_mut(ed.light_entity) {
                    pl.intensity = 0.0;
                    *lvis = Visibility::Hidden;
                }
            }
        }
        return;
    }

    let (wd_x, wd_z) = wind.direction;
    let wind_drift = wind.speed_mph * 0.003;

    for (mut tf, cr, mut ed, mut vis) in &mut fly_q {
        // Skip pooled/captured entities
        if cr.state != CreatureState::Active {
            continue;
        }

        *vis = Visibility::Visible;

        // Advance glow phase
        ed.glow_phase += dt / ed.glow_period;
        if ed.glow_phase >= 1.0 {
            ed.glow_phase -= 1.0;
        }

        // Orbital motion around anchor
        let p = cr.phase;
        let spd = ed.orbit_speed;
        let r = ed.orbit_radius;
        let ox = (t * spd * 0.7 + p * 6.28).sin() * r + (t * spd * 1.3 + p * 3.14).sin() * r * 0.4;
        let oy = (t * spd * 0.5 + p * 4.71).sin() * 0.3 + (t * spd * 1.1 + p * 2.09).cos() * 0.15;
        let oz = (t * spd * 0.9 + p * 5.24).cos() * r + (t * spd * 1.7 + p * 1.57).cos() * r * 0.3;

        let wind_off = Vec3::new(
            wd_x * wind_drift * (t % 60.0),
            0.0,
            wd_z * wind_drift * (t % 60.0),
        );
        let pos = cr.anchor + Vec3::new(ox, oy, oz) + wind_off;
        tf.translation = pos;

        // Double-pulse glow pattern
        let pulse_t = ed.glow_phase;
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

        if let Some(mat) = materials.get_mut(&cr.mat_handle) {
            let emit = intensity * 12.0;
            mat.emissive = LinearRgba::new(0.3 * emit, 0.85 * emit, 0.15 * emit, 1.0);
            mat.base_color = Color::srgba(0.5, 0.9, 0.3, intensity * 0.9 + 0.15 * nf);
        }

        if let Ok((mut pl, mut ltf, mut lvis)) = light_q.get_mut(ed.light_entity) {
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
