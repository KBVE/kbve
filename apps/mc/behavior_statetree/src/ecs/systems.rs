//! ECS systems for AI behavior planning.
//!
//! These run inside the headless Bevy App on the Tokio runtime.
//! They read ECS components, evaluate behavior trees, and produce intents.

use bevy::prelude::*;

use crate::tree::builtin::{AttackNearest, CallAllies, Flee, IsHealthLow, Wander};
use crate::tree::node::{BehaviorContext, BehaviorNode, Selector, Sequence};
use crate::types::{NpcCommand, NpcObservation};

use super::components::*;
use super::events::*;

/// System: ingest observations from the buffer, upsert ECS entities.
pub fn ingest_observations(
    mut commands: Commands,
    mut obs_buffer: ResMut<ObservationBuffer>,
    mut query: Query<(
        &McEntityId,
        &mut McPosition,
        &mut McHealth,
        &mut AiEpoch,
        &mut NearbyEntities,
    )>,
    mut server_tick: ResMut<ServerTick>,
) {
    for obs in obs_buffer.pending.drain(..) {
        server_tick.0 = obs.tick;

        // Try to find existing entity
        let mut found = false;
        for (mc_id, mut pos, mut health, mut epoch, mut nearby) in &mut query {
            if mc_id.0 == obs.entity_id {
                pos.x = obs.position[0];
                pos.y = obs.position[1];
                pos.z = obs.position[2];
                health.current = obs.health;
                epoch.next();
                nearby.entities = obs
                    .nearby_entities
                    .iter()
                    .map(|e| NearbyEntity {
                        entity_id: e.entity_id,
                        entity_type: e.entity_type.clone(),
                        position: e.position,
                        health: e.health,
                        is_hostile: e.is_hostile,
                    })
                    .collect();
                found = true;
                break;
            }
        }

        // Spawn new ECS entity if not found.
        // Today every AiManaged entity is an AI Skeleton — we tag it with
        // both markers so the population manager can query specifically for
        // skeletons. When we add other creature types, NpcObservation will
        // grow an entity_type field and ingestion will branch on it.
        if !found {
            commands.spawn((
                AiManaged,
                AiSkeleton,
                McEntityId(obs.entity_id),
                McPosition {
                    x: obs.position[0],
                    y: obs.position[1],
                    z: obs.position[2],
                },
                McHealth {
                    current: obs.health,
                    max: 20.0,
                },
                AiEpoch { value: 1 },
                CallCooldown::new(1200),
                NearbyEntities {
                    entities: obs
                        .nearby_entities
                        .iter()
                        .map(|e| NearbyEntity {
                            entity_id: e.entity_id,
                            entity_type: e.entity_type.clone(),
                            position: e.position,
                            health: e.health,
                            is_hostile: e.is_hostile,
                        })
                        .collect(),
                },
            ));
        }
    }
}

// ---------------------------------------------------------------------------
// Player snapshot ingestion
// ---------------------------------------------------------------------------

/// System: reconcile incoming `PlayerSnapshot`s with `OnlinePlayer` ECS
/// entities. Spawns new ones, updates positions/health on existing ones,
/// despawns ones that left the snapshot (player logged out).
pub fn ingest_player_snapshots(
    mut commands: Commands,
    mut player_buffer: ResMut<PlayerObservationBuffer>,
    mut existing: Query<(Entity, &mut OnlinePlayer, &mut McPosition, &mut McHealth)>,
    mut server_tick: ResMut<ServerTick>,
) {
    use std::collections::HashSet;

    for snapshot in player_buffer.pending.drain(..) {
        server_tick.0 = snapshot.tick;

        // IDs present in this snapshot — anything not in here gets despawned.
        let present: HashSet<u64> = snapshot.players.iter().map(|p| p.entity_id).collect();

        // Update existing entities + collect their IDs.
        let mut updated: HashSet<u64> = HashSet::new();
        for (_entity, player_comp, mut pos, mut health) in &mut existing {
            if present.contains(&player_comp.entity_id) {
                if let Some(info) = snapshot
                    .players
                    .iter()
                    .find(|p| p.entity_id == player_comp.entity_id)
                {
                    pos.x = info.position[0];
                    pos.y = info.position[1];
                    pos.z = info.position[2];
                    health.current = info.health;
                }
                updated.insert(player_comp.entity_id);
            }
        }

        // Despawn ECS entities for players no longer in the snapshot.
        let to_despawn: Vec<Entity> = existing
            .iter()
            .filter_map(|(e, p, _, _)| {
                if present.contains(&p.entity_id) {
                    None
                } else {
                    Some(e)
                }
            })
            .collect();
        for entity in to_despawn {
            commands.entity(entity).despawn();
        }

        // Spawn ECS entities for any player not yet tracked.
        for info in &snapshot.players {
            if updated.contains(&info.entity_id) {
                continue;
            }
            commands.spawn((
                OnlinePlayer {
                    entity_id: info.entity_id,
                    username: info.username.clone(),
                },
                McPosition {
                    x: info.position[0],
                    y: info.position[1],
                    z: info.position[2],
                },
                McHealth {
                    current: info.health,
                    max: 20.0,
                },
            ));
        }
    }
}

// ---------------------------------------------------------------------------
// Skeleton population management
// ---------------------------------------------------------------------------

/// System: maintain the AI Skeleton population.
///
/// Throttles itself via `LastPopulationManagedTick` so it only runs every
/// `manage_interval_ticks`. Each pass:
/// 1. Despawns any AI Skeleton further than `despawn_range` from every player.
/// 2. Spawns new skeletons (one per player) until `max_skeletons` is reached.
///
/// Java sees the resulting `Despawn` / `SpawnSkeleton` commands and just
/// applies them — zero policy on the Java side.
pub fn manage_skeleton_population(
    skeletons: Query<(&McEntityId, &McPosition), With<AiSkeleton>>,
    players: Query<(&OnlinePlayer, &McPosition)>,
    config: Res<SkeletonPopulationConfig>,
    server_tick: Res<ServerTick>,
    mut last_managed: ResMut<LastPopulationManagedTick>,
    mut world_intents: ResMut<WorldIntentBuffer>,
) {
    let current_tick = server_tick.0;
    if current_tick.saturating_sub(last_managed.0) < config.manage_interval_ticks {
        return;
    }
    last_managed.0 = current_tick;

    let player_positions: Vec<(u64, [f64; 3])> = players
        .iter()
        .map(|(p, pos)| (p.entity_id, [pos.x, pos.y, pos.z]))
        .collect();

    // ---- Despawn pass ------------------------------------------------------
    // For each skeleton, find the closest player. If beyond despawn range
    // (or no players online), emit a Despawn intent.
    let despawn_sq = config.despawn_range * config.despawn_range;
    let mut despawn_count: usize = 0;
    let mut total_skeletons: usize = 0;
    for (mc_id, sk_pos) in &skeletons {
        total_skeletons += 1;
        let too_far = if player_positions.is_empty() {
            true
        } else {
            player_positions
                .iter()
                .map(|(_, p)| dist_sq([sk_pos.x, sk_pos.y, sk_pos.z], *p))
                .fold(f64::INFINITY, f64::min)
                > despawn_sq
        };
        if too_far {
            world_intents.ready.push(IntentReady {
                entity_id: 0,
                epoch: 0,
                commands: vec![NpcCommand::Despawn {
                    target_entity: mc_id.0,
                }],
            });
            despawn_count += 1;
        }
    }

    // Effective alive count (subtract any we just queued for despawn so we
    // don't over-spawn while the despawns are still in flight).
    let alive = total_skeletons.saturating_sub(despawn_count);

    // ---- Spawn pass --------------------------------------------------------
    if alive >= config.max_skeletons || player_positions.is_empty() {
        return;
    }
    let needed = config.max_skeletons - alive;
    for (i, (player_id, _)) in player_positions.iter().enumerate() {
        if i >= needed {
            break;
        }
        world_intents.ready.push(IntentReady {
            entity_id: 0,
            epoch: 0,
            commands: vec![NpcCommand::SpawnSkeleton {
                near_player: *player_id,
                radius: config.spawn_radius,
            }],
        });
    }
}

fn dist_sq(a: [f64; 3], b: [f64; 3]) -> f64 {
    let dx = a[0] - b[0];
    let dy = a[1] - b[1];
    let dz = a[2] - b[2];
    dx * dx + dy * dy + dz * dz
}

/// System: evaluate behavior trees for all AI-managed entities, write intents.
///
/// Per-NPC and global cooldowns are mutable resources/components — the
/// behavior tree reads + writes them through `BehaviorContext`. Java sees
/// only the resulting commands and applies them blindly, so all rate
/// limiting / spam prevention lives here in Rust.
pub fn plan_behavior(
    mut query: Query<
        (
            &McEntityId,
            &McPosition,
            &McHealth,
            &AiEpoch,
            &NearbyEntities,
            &mut CallCooldown,
        ),
        With<AiManaged>,
    >,
    server_tick: Res<ServerTick>,
    mut global_cooldown: ResMut<GlobalCallCooldown>,
    mut intent_buffer: ResMut<IntentBuffer>,
) {
    let tree = build_behavior_tree();
    let current_tick = server_tick.0;

    for (mc_id, pos, health, epoch, nearby, mut cooldown) in &mut query {
        let observation = NpcObservation {
            entity_id: mc_id.0,
            epoch: epoch.value,
            position: [pos.x, pos.y, pos.z],
            health: health.current,
            nearby_entities: nearby
                .entities
                .iter()
                .map(|e| crate::types::EntitySnapshot {
                    entity_id: e.entity_id,
                    entity_type: e.entity_type.clone(),
                    position: e.position,
                    health: e.health,
                    is_hostile: e.is_hostile,
                })
                .collect(),
            nearby_blocks: vec![],
            current_goal: None,
            tick: current_tick,
        };

        let mut ctx = BehaviorContext {
            current_tick,
            per_npc: cooldown.as_mut(),
            global: global_cooldown.as_mut(),
        };
        let (_status, commands) = tree.evaluate(&observation, &mut ctx);

        intent_buffer.ready.push(IntentReady {
            entity_id: mc_id.0,
            epoch: epoch.value,
            commands,
        });
    }
}

fn build_behavior_tree() -> Selector {
    Selector {
        children: vec![
            Box::new(Sequence {
                children: vec![
                    Box::new(IsHealthLow { threshold: 5.0 }),
                    Box::new(Flee {
                        flee_distance: 16.0,
                    }),
                ],
            }),
            Box::new(Sequence {
                children: vec![
                    Box::new(IsHealthLow { threshold: 6.0 }),
                    Box::new(CallAllies {
                        health_threshold: 6.0,
                        reinforcement_count: 1,
                    }),
                ],
            }),
            Box::new(AttackNearest { range: 2.5 }),
            Box::new(Wander { radius: 8.0 }),
        ],
    }
}
