//! Headless firefly simulation — slot assignment + orbital motion + glow phase.
//!
//! Runs identically on client and server. NO rendering code (no material,
//! no PointLight, no Visibility component).

use bevy::prelude::*;
use std::collections::HashSet;

use super::ambient_types::*;
use super::common::{GameTime, hash_f32, night_factor};
use super::simulate::SimulationCenter;
use super::types::{Creature, CreatureState};
use crate::npcdb::{self, CreatureRegistry};

/// NPC ref slug.
const NPC_REF: &str = "meadow-firefly";
/// How many chunks in each direction from center to scan.
const VIEW_RADIUS: i32 = 3;

/// Chunk-based slot assignment for fireflies. Uses `SimulationCenter` instead
/// of camera query so it works on both client and server.
pub fn assign_firefly_slots(
    game_time: Res<GameTime>,
    sim_center: Res<SimulationCenter>,
    registry: Res<CreatureRegistry>,
    mut slot_state: ResMut<FireflySlotState>,
    mut fly_q: Query<(&mut Creature, &mut FireflySimState), With<AmbientCreatureMarker>>,
) {
    let Some(config) = registry.config_by_ref(NPC_REF) else {
        return;
    };

    let center = sim_center.0;
    let seed = game_time.creature_seed;
    let chunk_size = config.chunk_size;
    let per_chunk = config.per_chunk;
    let spawn_chance = config.spawn_chance;
    let pool_size = config.pool_size;

    // Seed change → full reset
    if seed != slot_state.last_seed {
        slot_state.last_seed = seed;
        slot_state.active_slots.clear();
        for (mut cr, _) in &mut fly_q {
            if cr.npc_ref != NPC_REF {
                continue;
            }
            cr.assigned_slot = None;
            cr.state = CreatureState::Pooled;
        }
    }

    let cam_cx = (center.x / chunk_size).floor() as i32;
    let cam_cz = (center.z / chunk_size).floor() as i32;

    // Enumerate visible slots sorted by distance
    let capacity = ((VIEW_RADIUS * 2 + 1) * (VIEW_RADIUS * 2 + 1)) as usize * per_chunk;
    let mut candidates: Vec<((i32, i32, u16), u32, Vec3)> = Vec::with_capacity(capacity);
    for dx in -VIEW_RADIUS..=VIEW_RADIUS {
        for dz in -VIEW_RADIUS..=VIEW_RADIUS {
            let cx = cam_cx + dx;
            let cz = cam_cz + dz;
            for idx in 0..per_chunk {
                let idx16 = idx as u16;
                let ss = npcdb::slot_seed(seed, cx, cz, idx16);
                if !npcdb::slot_active(ss, spawn_chance) {
                    continue;
                }
                let anchor = npcdb::slot_anchor(ss, cx, cz, chunk_size);
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

    // Snapshot entities — collect (Entity-free) to avoid borrow issues
    let snapshot: Vec<(usize, Option<(i32, i32, u16)>)> = fly_q
        .iter()
        .enumerate()
        .filter(|(_, (cr, _))| cr.npc_ref == NPC_REF)
        .map(|(i, (cr, _))| (i, cr.assigned_slot))
        .collect();

    // Unassign entities whose slots left the view
    let mut free_indices: Vec<usize> = Vec::new();
    for &(idx, assigned) in &snapshot {
        if let Some(slot) = assigned {
            if !target_set.contains(&slot) {
                slot_state.active_slots.remove(&slot);
                if let Some((mut cr, _)) = fly_q.iter_mut().nth(idx) {
                    if cr.npc_ref == NPC_REF {
                        cr.assigned_slot = None;
                        cr.state = CreatureState::Pooled;
                    }
                }
                free_indices.push(idx);
            }
        } else {
            free_indices.push(idx);
        }
    }

    // Assign free entities to new slots
    let mut free_idx = 0;
    for &(slot, ss, anchor) in candidates.iter().take(pool_size) {
        if slot_state.active_slots.contains(&slot) {
            continue;
        }
        if free_idx >= free_indices.len() {
            break;
        }
        let entity_idx = free_indices[free_idx];
        free_idx += 1;
        if let Some((mut cr, mut fs)) = fly_q.iter_mut().nth(entity_idx) {
            if cr.npc_ref == NPC_REF {
                cr.slot_seed = ss;
                cr.anchor = anchor;
                cr.phase = hash_f32(ss.wrapping_mul(7).wrapping_add(1));
                cr.assigned_slot = Some(slot);
                cr.state = CreatureState::Active;
                *fs = FireflySimState::from_seed(ss);
                slot_state.active_slots.insert(slot);
            }
        }
    }
}

/// Advance firefly simulation: orbital motion + glow phase.
/// Writes to `Transform::translation` and `Creature::anchor` (y for hiding).
/// NO material, PointLight, or Visibility updates.
pub fn simulate_fireflies(
    time: Res<Time>,
    game_time: Res<GameTime>,
    mut fly_q: Query<
        (&mut Transform, &mut Creature, &mut FireflySimState),
        With<AmbientCreatureMarker>,
    >,
) {
    let dt = time.delta_secs();
    let t = time.elapsed_secs();
    let nf = night_factor(game_time.hour);

    for (mut tf, cr, mut fs) in &mut fly_q {
        if cr.npc_ref != NPC_REF {
            continue;
        }
        if cr.state != CreatureState::Active {
            continue;
        }

        // Daytime: hide by pushing below ground
        if nf < 0.01 {
            tf.translation.y = -100.0;
            continue;
        }

        // Advance glow phase
        fs.glow_phase += dt / fs.glow_period;
        if fs.glow_phase >= 1.0 {
            fs.glow_phase -= 1.0;
        }

        // Orbital motion around anchor
        let p = cr.phase;
        let spd = fs.orbit_speed;
        let r = fs.orbit_radius;
        let ox = (t * spd * 0.7 + p * 6.28).sin() * r + (t * spd * 1.3 + p * 3.14).sin() * r * 0.4;
        let oy = (t * spd * 0.5 + p * 4.71).sin() * 0.3 + (t * spd * 1.1 + p * 2.09).cos() * 0.15;
        let oz = (t * spd * 0.9 + p * 5.24).cos() * r + (t * spd * 1.7 + p * 1.57).cos() * r * 0.3;

        tf.translation = cr.anchor + Vec3::new(ox, oy, oz);
    }
}
