//! ECS systems for AI behavior planning.
//!
//! These run inside the headless Bevy App on the Tokio runtime.
//! They read ECS components, evaluate behavior trees, and produce intents.

use bevy::prelude::*;

use crate::tree::builtin::{AttackNearest, CallAllies, Flee, IsHealthLow, Wander};
use crate::tree::node::{BehaviorNode, Selector, Sequence};
use crate::types::NpcObservation;

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

        // Spawn new ECS entity if not found
        if !found {
            commands.spawn((
                AiManaged,
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
                CallCooldown::new(400),
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

/// System: evaluate behavior trees for all AI-managed entities, write intents.
pub fn plan_behavior(
    query: Query<
        (
            &McEntityId,
            &McPosition,
            &McHealth,
            &AiEpoch,
            &NearbyEntities,
        ),
        With<AiManaged>,
    >,
    server_tick: Res<ServerTick>,
    mut intent_buffer: ResMut<IntentBuffer>,
) {
    let tree = build_behavior_tree();

    for (mc_id, pos, health, epoch, nearby) in &query {
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
            tick: server_tick.0,
        };

        let (_status, commands) = tree.evaluate(&observation);

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
                    Box::new(IsHealthLow { threshold: 12.0 }),
                    Box::new(CallAllies {
                        health_threshold: 12.0,
                        reinforcement_count: 2,
                    }),
                ],
            }),
            Box::new(AttackNearest { range: 4.0 }),
            Box::new(Wander { radius: 8.0 }),
        ],
    }
}
