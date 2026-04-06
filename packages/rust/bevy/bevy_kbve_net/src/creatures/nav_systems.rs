//! Off-thread navigation systems — dispatches NavGrid, WaypointGraph, and
//! PatrolRoute computation to `bevy_tasker` so the main game thread stays free.
//!
//! Pattern mirrors `brain.rs`: capture snapshot → spawn async task → poll result.

use bevy::prelude::*;
use crossbeam_channel::{Receiver, bounded};

use super::nav_grid::{ChunkNav, NAV_CHUNK, NavGrid};
use super::patrol::{self, PatrolRoute};
use super::types::{Creature, CreatureState, SpriteCreatureMarker, SpriteCreatureTypes};
use super::waypoint_graph::WaypointGraph;

use super::simulate::SimulationCenter;

// ---------------------------------------------------------------------------
// Timers
// ---------------------------------------------------------------------------

/// Throttle for nav region updates (every 2 seconds).
#[derive(Resource)]
pub struct NavBuildTimer(pub Timer);

impl Default for NavBuildTimer {
    fn default() -> Self {
        Self(Timer::from_seconds(2.0, TimerMode::Repeating))
    }
}

/// Throttle for eviction (every 10 seconds).
#[derive(Resource)]
pub struct NavEvictTimer(pub Timer);

impl Default for NavEvictTimer {
    fn default() -> Self {
        Self(Timer::from_seconds(10.0, TimerMode::Repeating))
    }
}

// ---------------------------------------------------------------------------
// Async nav build state
// ---------------------------------------------------------------------------

/// Pending off-thread nav build result.
#[derive(Resource)]
pub struct PendingNavBuild {
    rx: Option<Receiver<NavBuildResult>>,
}

impl Default for PendingNavBuild {
    fn default() -> Self {
        Self { rx: None }
    }
}

/// Result of an off-thread nav build.
struct NavBuildResult {
    /// New chunks to merge into NavGrid.
    chunks: Vec<((i32, i32), ChunkNav)>,
    /// Updated waypoint graph (rebuilt from scratch each cycle).
    graph: WaypointGraph,
}

// ---------------------------------------------------------------------------
// System: dispatch nav build off-thread
// ---------------------------------------------------------------------------

/// Periodically dispatches NavGrid + WaypointGraph computation to bevy_tasker.
/// Only dispatches if no build is currently in-flight.
pub fn dispatch_nav_build(
    time: Res<Time>,
    mut timer: ResMut<NavBuildTimer>,
    sim_center: Res<SimulationCenter>,
    nav: Res<NavGrid>,
    graph: Res<WaypointGraph>,
    mut pending: ResMut<PendingNavBuild>,
) {
    timer.0.tick(time.delta());
    if !timer.0.just_finished() {
        return;
    }

    // Don't dispatch if a build is already in-flight
    if pending.rx.is_some() {
        return;
    }

    let center_cx = (sim_center.0.x / NAV_CHUNK as f32).floor() as i32;
    let center_cz = (sim_center.0.z / NAV_CHUNK as f32).floor() as i32;
    let radius = 3i32;

    // Collect which chunks are already built
    let existing_chunks = nav.built_chunk_set();
    let existing_graph_chunks = graph.built_chunk_set();

    // Figure out which chunks need building
    let mut needed_chunks = Vec::new();
    for dx in -radius..=radius {
        for dz in -radius..=radius {
            let cx = center_cx + dx;
            let cz = center_cz + dz;
            if !existing_chunks.contains(&(cx, cz)) {
                needed_chunks.push((cx, cz));
            }
        }
    }

    // Also figure out which chunks need waypoint building
    let mut needed_wp_chunks = Vec::new();
    for dx in -radius..=radius {
        for dz in -radius..=radius {
            let cx = center_cx + dx;
            let cz = center_cz + dz;
            if !existing_graph_chunks.contains(&(cx, cz)) {
                needed_wp_chunks.push((cx, cz));
            }
        }
    }

    // Skip if nothing to build
    if needed_chunks.is_empty() && needed_wp_chunks.is_empty() {
        return;
    }

    // Clone current state for the background task
    let nav_snapshot = nav.clone_for_task();
    let graph_snapshot = graph.clone();

    let (tx, rx) = bounded::<NavBuildResult>(1);

    bevy_tasker::spawn(async move {
        let mut nav_local = nav_snapshot;
        let mut graph_local = graph_snapshot;

        // Build any missing nav chunks
        let mut new_chunks = Vec::new();
        for (cx, cz) in needed_chunks {
            let chunk = ChunkNav::generate(cx, cz);
            nav_local.insert_chunk(cx, cz, &chunk);
            new_chunks.push(((cx, cz), chunk));
        }

        // Build waypoints for any missing chunks
        if !needed_wp_chunks.is_empty() {
            let cx_min = center_cx - radius;
            let cx_max = center_cx + radius;
            let cz_min = center_cz - radius;
            let cz_max = center_cz + radius;
            graph_local.build_for_region(&mut nav_local, cx_min, cx_max, cz_min, cz_max);
        }

        let _ = tx.send(NavBuildResult {
            chunks: new_chunks,
            graph: graph_local,
        });
    })
    .detach();

    pending.rx = Some(rx);
}

/// Poll completed nav builds and merge results into the main-thread resources.
pub fn poll_nav_build(
    mut nav: ResMut<NavGrid>,
    mut graph: ResMut<WaypointGraph>,
    mut pending: ResMut<PendingNavBuild>,
) {
    let Some(ref rx) = pending.rx else { return };

    match rx.try_recv() {
        Ok(result) => {
            // Merge new chunks into NavGrid
            for ((cx, cz), chunk) in result.chunks {
                nav.merge_chunk(cx, cz, chunk);
            }
            // Replace waypoint graph with the updated version
            *graph = result.graph;

            pending.rx = None;
        }
        Err(crossbeam_channel::TryRecvError::Empty) => {
            // Still computing
        }
        Err(crossbeam_channel::TryRecvError::Disconnected) => {
            pending.rx = None;
        }
    }
}

// ---------------------------------------------------------------------------
// System: evict far-away nav data
// ---------------------------------------------------------------------------

/// Periodically evict NavGrid chunks and WaypointGraph data far from the
/// simulation center.
pub fn evict_nav_data(
    time: Res<Time>,
    mut timer: ResMut<NavEvictTimer>,
    sim_center: Res<SimulationCenter>,
    mut nav: ResMut<NavGrid>,
    mut graph: ResMut<WaypointGraph>,
) {
    timer.0.tick(time.delta());
    if !timer.0.just_finished() {
        return;
    }

    let center_cx = (sim_center.0.x / NAV_CHUNK as f32).floor() as i32;
    let center_cz = (sim_center.0.z / NAV_CHUNK as f32).floor() as i32;
    let keep_radius = 4;

    nav.evict_far(center_cx, center_cz, keep_radius);
    graph.evict_far(center_cx, center_cz, keep_radius);
}

// ---------------------------------------------------------------------------
// System: assign patrol routes off-thread
// ---------------------------------------------------------------------------

/// Marker for creatures that need a patrol route computed.
#[derive(Component)]
pub struct NeedsPatrolRoute;

/// Pending patrol route computation for a single creature.
#[derive(Component)]
pub struct PendingPatrolCompute {
    rx: Receiver<Option<PatrolRoute>>,
}

/// Tag newly-activated creatures that have an influence profile but no route yet.
pub fn tag_creatures_needing_routes(
    mut commands: Commands,
    types: Res<SpriteCreatureTypes>,
    query: Query<
        (Entity, &Creature, &SpriteCreatureMarker),
        (
            Without<PatrolRoute>,
            Without<NeedsPatrolRoute>,
            Without<PendingPatrolCompute>,
        ),
    >,
) {
    for (entity, cr, marker) in &query {
        // Only tag active creatures (not pooled)
        if cr.state != CreatureState::Active {
            continue;
        }
        // Only if creature type has an influence profile
        let Some(ctype) = types.types.iter().find(|t| t.npc_ref == marker.type_key) else {
            continue;
        };
        if ctype.influence.is_none() {
            continue;
        }
        commands.entity(entity).insert(NeedsPatrolRoute);
    }
}

/// Dispatch patrol route generation to bevy_tasker for tagged creatures.
pub fn dispatch_patrol_generation(
    mut commands: Commands,
    types: Res<SpriteCreatureTypes>,
    nav: Res<NavGrid>,
    graph: Res<WaypointGraph>,
    query: Query<(Entity, &Creature, &SpriteCreatureMarker), With<NeedsPatrolRoute>>,
) {
    for (entity, cr, marker) in &query {
        let Some(ctype) = types.types.iter().find(|t| t.npc_ref == marker.type_key) else {
            commands.entity(entity).remove::<NeedsPatrolRoute>();
            continue;
        };
        let Some(ref profile) = ctype.influence else {
            commands.entity(entity).remove::<NeedsPatrolRoute>();
            continue;
        };

        // Skip if waypoint graph is empty (still building)
        if graph.waypoints.is_empty() {
            continue;
        }

        let seed = cr.slot_seed;
        let anchor = cr.anchor;
        let profile_clone = profile.clone();
        let emotes: Vec<&'static str> = ctype.patrol_emotes.to_vec();
        let nav_snapshot = nav.clone_for_task();
        let graph_clone = graph.clone();

        let (tx, rx) = bounded::<Option<PatrolRoute>>(1);

        bevy_tasker::spawn(async move {
            let mut nav_local = nav_snapshot;
            let route = patrol::generate_route(
                seed,
                anchor,
                &profile_clone,
                &graph_clone,
                &mut nav_local,
                &emotes,
            );
            let _ = tx.send(route);
        })
        .detach();

        commands
            .entity(entity)
            .remove::<NeedsPatrolRoute>()
            .insert(PendingPatrolCompute { rx });
    }
}

/// Poll completed patrol route computations and insert the PatrolRoute component.
pub fn poll_patrol_generation(
    mut commands: Commands,
    query: Query<(Entity, &PendingPatrolCompute)>,
) {
    for (entity, pending) in &query {
        match pending.rx.try_recv() {
            Ok(Some(route)) => {
                commands
                    .entity(entity)
                    .remove::<PendingPatrolCompute>()
                    .insert(route);
            }
            Ok(None) => {
                // No valid route (not enough waypoints) — just remove the pending marker
                commands.entity(entity).remove::<PendingPatrolCompute>();
            }
            Err(crossbeam_channel::TryRecvError::Empty) => {
                // Still computing
            }
            Err(crossbeam_channel::TryRecvError::Disconnected) => {
                commands.entity(entity).remove::<PendingPatrolCompute>();
            }
        }
    }
}
