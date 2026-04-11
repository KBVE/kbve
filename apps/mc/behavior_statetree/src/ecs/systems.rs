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

        // Spawn new ECS entity if not found — branch on entity_kind so
        // skeletons and pet dogs get the right marker + component set.
        if !found {
            let nearby = NearbyEntities {
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
            };
            let position = McPosition {
                x: obs.position[0],
                y: obs.position[1],
                z: obs.position[2],
            };
            let health = McHealth {
                current: obs.health,
                max: 20.0,
            };
            match obs.entity_kind.as_str() {
                "dog" => {
                    let Some(owner_id) = obs.owner_entity else {
                        // Dog with no owner is meaningless — skip until
                        // Java resends a well-formed observation.
                        continue;
                    };
                    commands.spawn((
                        AiPetDog,
                        PetOwner {
                            player_id: owner_id,
                        },
                        McEntityId(obs.entity_id),
                        position,
                        health,
                        AiEpoch { value: 1 },
                        nearby,
                    ));
                }
                "parrot" => {
                    let Some(owner_id) = obs.owner_entity else {
                        // Parrot with no owner — same story as dog.
                        continue;
                    };
                    commands.spawn((
                        AiPetParrot,
                        PetOwner {
                            player_id: owner_id,
                        },
                        McEntityId(obs.entity_id),
                        position,
                        health,
                        AiEpoch { value: 1 },
                        PoopCooldown::default(),
                        nearby,
                    ));
                }
                _ => {
                    commands.spawn((
                        AiManaged,
                        AiSkeleton,
                        McEntityId(obs.entity_id),
                        position,
                        health,
                        AiEpoch { value: 1 },
                        CallCooldown::new(1200),
                        nearby,
                    ));
                }
            }
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
            entity_kind: "skeleton".to_string(),
            owner_entity: None,
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

// ---------------------------------------------------------------------------
// Pet dog population + behavior
//
// Each player gets one tamed-wolf pet when they come online. The dog
// despawns when the player logs out. While alive, the dog proactively
// attacks any hostile within `aggro_range` of itself or its owner — this
// is the piece vanilla tamed wolves don't do (they only revenge-target
// after the owner has already been hit). When no hostiles are nearby,
// the dog's vanilla follow-owner AI carries it back to the player, and
// Rust only nudges it with an explicit MoveTo if the player has walked
// past `follow_distance`.
// ---------------------------------------------------------------------------

/// System: maintain pet-dog population, one dog per online player.
///
/// Emits `SpawnPetDog` world intents for players without a dog and
/// `Despawn` world intents for dogs whose owner has left the snapshot.
pub fn manage_pet_dog_population(
    dogs: Query<(&McEntityId, &PetOwner), With<AiPetDog>>,
    players: Query<&OnlinePlayer>,
    config: Res<PetDogPopulationConfig>,
    server_tick: Res<ServerTick>,
    mut last_managed: ResMut<LastPetDogManagedTick>,
    mut world_intents: ResMut<WorldIntentBuffer>,
) {
    use std::collections::HashSet;

    let current_tick = server_tick.0;
    if current_tick.saturating_sub(last_managed.0) < config.manage_interval_ticks {
        return;
    }
    last_managed.0 = current_tick;

    let online_ids: HashSet<u64> = players.iter().map(|p| p.entity_id).collect();

    // Despawn pass: dogs whose owner is no longer online.
    let mut owned_by_online: HashSet<u64> = HashSet::new();
    for (dog_mc_id, owner) in &dogs {
        if online_ids.contains(&owner.player_id) {
            owned_by_online.insert(owner.player_id);
        } else {
            world_intents.ready.push(IntentReady {
                entity_id: 0,
                epoch: 0,
                commands: vec![NpcCommand::Despawn {
                    target_entity: dog_mc_id.0,
                }],
            });
        }
    }

    // Spawn pass: players online without a dog.
    if config.dogs_per_player == 0 {
        return;
    }
    for player in &players {
        if !owned_by_online.contains(&player.entity_id) {
            world_intents.ready.push(IntentReady {
                entity_id: 0,
                epoch: 0,
                commands: vec![NpcCommand::SpawnPetDog {
                    near_player: player.entity_id,
                    radius: config.spawn_radius,
                }],
            });
        }
    }
}

/// System: evaluate the pet-dog behavior for every tracked dog.
///
/// Decision order per dog:
/// 1. If any hostile in `NearbyEntities` is within `aggro_range` of the
///    dog *or* the owner, target the nearest one → emit MoveTo + Attack.
/// 2. Otherwise, if the dog has drifted past `follow_distance` from the
///    owner, nudge it back with a MoveTo. Vanilla follow-owner handles
///    the closer range — we stay out of its way to avoid path thrashing.
/// 3. Otherwise, emit no commands and let vanilla AI idle/wander.
pub fn plan_pet_dog_behavior(
    dogs: Query<
        (
            &McEntityId,
            &McPosition,
            &AiEpoch,
            &NearbyEntities,
            &PetOwner,
        ),
        With<AiPetDog>,
    >,
    players: Query<(&OnlinePlayer, &McPosition)>,
    config: Res<PetDogPopulationConfig>,
    mut intent_buffer: ResMut<IntentBuffer>,
) {
    let aggro_sq = config.aggro_range * config.aggro_range;
    let melee_sq = config.melee_range * config.melee_range;
    let follow_sq = config.follow_distance * config.follow_distance;

    for (dog_id, dog_pos, epoch, nearby, owner) in &dogs {
        let Some(owner_pos) = players
            .iter()
            .find_map(|(p, pos)| (p.entity_id == owner.player_id).then_some([pos.x, pos.y, pos.z]))
        else {
            // Owner snapshot hasn't arrived yet or player just logged out
            // — the population manager will clean up on its next pass.
            continue;
        };
        let dog_xyz = [dog_pos.x, dog_pos.y, dog_pos.z];

        let best_target = nearby
            .entities
            .iter()
            .filter(|e| e.is_hostile)
            .filter(|e| {
                dist_sq(dog_xyz, e.position) <= aggro_sq
                    || dist_sq(owner_pos, e.position) <= aggro_sq
            })
            .min_by(|a, b| {
                let da = dist_sq(dog_xyz, a.position);
                let db = dist_sq(dog_xyz, b.position);
                da.partial_cmp(&db).unwrap_or(std::cmp::Ordering::Equal)
            });

        let commands = if let Some(target) = best_target {
            // Always chase the target. Only emit Attack once the dog has
            // closed to within its actual bite reach — otherwise Java's
            // `mob.tryAttack(target)` lands damage from across the aggro
            // radius, which doesn't make sense for a melee pet.
            let mut cmds = vec![NpcCommand::MoveTo {
                target: target.position,
            }];
            if dist_sq(dog_xyz, target.position) <= melee_sq {
                cmds.push(NpcCommand::Attack {
                    target_entity: target.entity_id,
                });
            }
            cmds
        } else if dist_sq(dog_xyz, owner_pos) > follow_sq {
            vec![NpcCommand::MoveTo { target: owner_pos }]
        } else {
            vec![]
        };

        if commands.is_empty() {
            continue;
        }

        intent_buffer.ready.push(IntentReady {
            entity_id: dog_id.0,
            epoch: epoch.value,
            commands,
        });
    }
}

// ---------------------------------------------------------------------------
// Pet parrot population + behavior
//
// Each player gets one tamed parrot that flies near them and drops a
// ranged "poop poison" attack on any hostile within `aggro_range` of
// the parrot or owner. Unlike the dog (melee), the parrot doesn't need
// to close with its target — the ability is ranged, so the only gate
// is a per-parrot cooldown so it doesn't spam every ECS tick.
// ---------------------------------------------------------------------------

/// System: maintain pet-parrot population, one parrot per online player.
///
/// Mirrors `manage_pet_dog_population` for the parrot archetype. Emits
/// `SpawnPetParrot` for players without a parrot and `Despawn` for
/// parrots whose owner has left the player snapshot.
pub fn manage_pet_parrot_population(
    parrots: Query<(&McEntityId, &PetOwner), With<AiPetParrot>>,
    players: Query<&OnlinePlayer>,
    config: Res<PetParrotPopulationConfig>,
    server_tick: Res<ServerTick>,
    mut last_managed: ResMut<LastPetParrotManagedTick>,
    mut world_intents: ResMut<WorldIntentBuffer>,
) {
    use std::collections::HashSet;

    let current_tick = server_tick.0;
    if current_tick.saturating_sub(last_managed.0) < config.manage_interval_ticks {
        return;
    }
    last_managed.0 = current_tick;

    let online_ids: HashSet<u64> = players.iter().map(|p| p.entity_id).collect();

    let mut owned_by_online: HashSet<u64> = HashSet::new();
    for (parrot_mc_id, owner) in &parrots {
        if online_ids.contains(&owner.player_id) {
            owned_by_online.insert(owner.player_id);
        } else {
            world_intents.ready.push(IntentReady {
                entity_id: 0,
                epoch: 0,
                commands: vec![NpcCommand::Despawn {
                    target_entity: parrot_mc_id.0,
                }],
            });
        }
    }

    if config.parrots_per_player == 0 {
        return;
    }
    for player in &players {
        if !owned_by_online.contains(&player.entity_id) {
            world_intents.ready.push(IntentReady {
                entity_id: 0,
                epoch: 0,
                commands: vec![NpcCommand::SpawnPetParrot {
                    near_player: player.entity_id,
                    radius: config.spawn_radius,
                }],
            });
        }
    }
}

/// System: evaluate the pet-parrot behavior for every tracked parrot.
///
/// Decision order per parrot:
/// 1. Pick the nearest hostile within `aggro_range` of the parrot or
///    owner. If the per-parrot poop cooldown is clear, emit a
///    `PoopPoison` intent at that target and bump the cooldown.
///    A `MoveTo` above the target is also emitted so the parrot
///    visually "perches" over whatever it's dumping on.
/// 2. Otherwise, if the parrot has drifted past `follow_distance`,
///    nudge it back toward the owner with a `MoveTo` (vanilla parrot
///    flight AI handles the closer range and the hover-above idle).
/// 3. Otherwise, emit nothing and let vanilla AI drift around.
pub fn plan_pet_parrot_behavior(
    mut parrots: Query<
        (
            &McEntityId,
            &McPosition,
            &AiEpoch,
            &NearbyEntities,
            &PetOwner,
            &mut PoopCooldown,
        ),
        With<AiPetParrot>,
    >,
    players: Query<(&OnlinePlayer, &McPosition)>,
    config: Res<PetParrotPopulationConfig>,
    server_tick: Res<ServerTick>,
    mut intent_buffer: ResMut<IntentBuffer>,
) {
    let current_tick = server_tick.0;
    let aggro_sq = config.aggro_range * config.aggro_range;
    let follow_sq = config.follow_distance * config.follow_distance;

    for (parrot_id, parrot_pos, epoch, nearby, owner, mut cooldown) in &mut parrots {
        let Some(owner_pos) = players
            .iter()
            .find_map(|(p, pos)| (p.entity_id == owner.player_id).then_some([pos.x, pos.y, pos.z]))
        else {
            continue;
        };
        let parrot_xyz = [parrot_pos.x, parrot_pos.y, parrot_pos.z];

        let best_target = nearby
            .entities
            .iter()
            .filter(|e| e.is_hostile)
            .filter(|e| {
                dist_sq(parrot_xyz, e.position) <= aggro_sq
                    || dist_sq(owner_pos, e.position) <= aggro_sq
            })
            .min_by(|a, b| {
                let da = dist_sq(parrot_xyz, a.position);
                let db = dist_sq(parrot_xyz, b.position);
                da.partial_cmp(&db).unwrap_or(std::cmp::Ordering::Equal)
            });

        let commands = if let Some(target) = best_target {
            // Hover slightly above the target so the "poop from above"
            // framing reads correctly for any watching players.
            let mut cmds = vec![NpcCommand::MoveTo {
                target: [
                    target.position[0],
                    target.position[1] + 3.0,
                    target.position[2],
                ],
            }];
            if current_tick.saturating_sub(cooldown.last_poop_tick) >= config.poop_cooldown_ticks {
                cmds.push(NpcCommand::PoopPoison {
                    target_entity: target.entity_id,
                    duration_ticks: config.poison_duration_ticks,
                    amplifier: config.poison_amplifier,
                });
                cooldown.last_poop_tick = current_tick;
            }
            cmds
        } else if dist_sq(parrot_xyz, owner_pos) > follow_sq {
            // Hover ~1.5 blocks above the owner's head when returning.
            vec![NpcCommand::MoveTo {
                target: [owner_pos[0], owner_pos[1] + 1.5, owner_pos[2]],
            }]
        } else {
            vec![]
        };

        if commands.is_empty() {
            continue;
        }

        intent_buffer.ready.push(IntentReady {
            entity_id: parrot_id.0,
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
