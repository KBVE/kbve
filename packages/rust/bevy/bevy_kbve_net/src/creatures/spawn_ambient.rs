//! Headless spawn systems for ambient creatures (fireflies, butterflies).
//!
//! Creates ECS entities with simulation components but NO rendering.
//! Client attaches mesh/material/lights after spawn.

use bevy::prelude::*;

use super::ambient_types::*;
use super::common::hash_f32;
use super::types::{Creature, CreaturePoolIndex, CreatureState, CreatureVitals};

/// NPC ref slug for fireflies.
const FIREFLY_REF: &str = "meadow-firefly";
/// NPC ref slug for butterflies.
const BUTTERFLY_REF: &str = "woodland-butterfly";

/// Spawn firefly pool entities with simulation-only components.
pub fn spawn_fireflies_headless(
    mut commands: Commands,
    mut pool: ResMut<AmbientCreaturePool>,
    registry: Res<crate::npcdb::CreatureRegistry>,
) {
    if pool.fireflies_spawned {
        return;
    }
    pool.fireflies_spawned = true;

    let Some(config) = registry.config_by_ref(FIREFLY_REF) else {
        warn!("[firefly] no registry config for '{FIREFLY_REF}' — skipping");
        return;
    };
    let count = config.pool_size;

    for i in 0..count {
        commands.spawn((
            Transform::from_xyz(0.0, -100.0, 0.0),
            Creature {
                npc_ref: FIREFLY_REF,
                state: CreatureState::Pooled,
                slot_seed: 0,
                assigned_slot: None,
                anchor: Vec3::new(0.0, -100.0, 0.0),
                phase: 0.0,
            },
            FireflySimState {
                glow_phase: 0.0,
                glow_period: 3.0,
                orbit_radius: 0.5,
                orbit_speed: 0.7,
            },
            AmbientCreatureMarker {
                type_key: FIREFLY_REF,
            },
            CreaturePoolIndex(i),
            CreatureVitals::new(1.0, 0.0, 0.0),
        ));
    }

    info!("[firefly] spawned {count} headless entities");
}

/// Spawn butterfly pool entities with simulation-only components.
pub fn spawn_butterflies_headless(
    mut commands: Commands,
    mut pool: ResMut<AmbientCreaturePool>,
    registry: Res<crate::npcdb::CreatureRegistry>,
) {
    if pool.butterflies_spawned {
        return;
    }
    pool.butterflies_spawned = true;

    let Some(config) = registry.config_by_ref(BUTTERFLY_REF) else {
        warn!("[butterfly] no registry config for '{BUTTERFLY_REF}' — skipping");
        return;
    };
    let count = config.pool_size;

    for i in 0..count {
        let seed = (i as u32).wrapping_add(500);
        let phase = hash_f32(seed * 11 + 1);

        commands.spawn((
            Transform::from_xyz(0.0, -100.0, 0.0),
            Creature {
                npc_ref: BUTTERFLY_REF,
                state: CreatureState::Pooled,
                slot_seed: seed,
                assigned_slot: None,
                anchor: Vec3::ZERO,
                phase,
            },
            ButterflySimState::from_seed(seed),
            AmbientCreatureMarker {
                type_key: BUTTERFLY_REF,
            },
            CreaturePoolIndex(i),
            CreatureVitals::new(1.0, 0.0, 0.0),
        ));
    }

    info!("[butterfly] spawned {count} headless entities");
}
