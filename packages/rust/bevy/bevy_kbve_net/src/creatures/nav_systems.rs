//! Off-thread navigation systems — dispatches NavGrid, WaypointGraph, and
//! PatrolRoute computation to `bevy_tasker` so the main game thread stays free.
//!
//! Uses DashMap for lock-free concurrent chunk access and Bevy triggers for
//! event-driven completion notification.

use bevy::prelude::*;
use crossbeam_channel::{Receiver, bounded};

use super::nav_grid::{ChunkNav, NAV_CHUNK, NavGrid};
use super::patrol::{self, PatrolRoute};
use super::simulate::SimulationCenter;
use super::types::{Creature, CreatureState, SpriteCreatureMarker, SpriteCreatureTypes};
use super::waypoint_graph::WaypointGraph;

// ---------------------------------------------------------------------------
// Timers
// ---------------------------------------------------------------------------

#[derive(Resource)]
pub struct NavBuildTimer(pub Timer);

impl Default for NavBuildTimer {
    fn default() -> Self {
        Self(Timer::from_seconds(2.0, TimerMode::Repeating))
    }
}

#[derive(Resource)]
pub struct NavEvictTimer(pub Timer);

impl Default for NavEvictTimer {
    fn default() -> Self {
        Self(Timer::from_seconds(10.0, TimerMode::Repeating))
    }
}

// ---------------------------------------------------------------------------
// Pending nav build (single in-flight task)
// ---------------------------------------------------------------------------

#[derive(Resource, Default)]
pub struct PendingNavBuild {
    rx: Option<Receiver<WaypointGraph>>,
}

// ---------------------------------------------------------------------------
// System: dispatch nav build off-thread
// ---------------------------------------------------------------------------

/// Periodically dispatches NavGrid chunk + WaypointGraph computation to
/// bevy_tasker. NavGrid uses DashMap — background task writes chunks directly
/// into the shared map. Only the rebuilt WaypointGraph is shipped back.
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
    if pending.rx.is_some() {
        return;
    }

    let center_cx = (sim_center.0.x / NAV_CHUNK as f32).floor() as i32;
    let center_cz = (sim_center.0.z / NAV_CHUNK as f32).floor() as i32;
    let radius = 3i32;

    // Check what needs building
    let graph_built = graph.built_chunk_set();
    let mut need_nav = Vec::new();
    let mut need_wp = false;

    for dx in -radius..=radius {
        for dz in -radius..=radius {
            let cx = center_cx + dx;
            let cz = center_cz + dz;
            if !nav.has_chunk(cx, cz) {
                need_nav.push((cx, cz));
            }
            if !graph_built.contains(&(cx, cz)) {
                need_wp = true;
            }
        }
    }

    if need_nav.is_empty() && !need_wp {
        return;
    }

    // Share the DashMap handle — background task writes chunks directly
    let nav_handle = nav.shared();
    let nav_clone = nav.clone(); // Cheap: Arc clone of DashMap
    let mut graph_clone = graph.clone();

    let (tx, rx) = bounded::<WaypointGraph>(1);

    bevy_tasker::spawn(async move {
        // Build missing nav chunks into the shared DashMap
        for (cx, cz) in need_nav {
            if !nav_handle.contains_key(&(cx, cz)) {
                nav_handle.insert((cx, cz), ChunkNav::generate(cx, cz));
            }
        }

        // Build waypoints (reads from same DashMap via nav_clone)
        if need_wp {
            graph_clone.build_for_region(
                &nav_clone,
                center_cx - radius,
                center_cx + radius,
                center_cz - radius,
                center_cz + radius,
            );
        }

        let _ = tx.send(graph_clone);
    })
    .detach();

    pending.rx = Some(rx);
}

/// Receive completed nav builds — swap in the new WaypointGraph.
pub fn receive_nav_build(mut pending: ResMut<PendingNavBuild>, mut graph: ResMut<WaypointGraph>) {
    let Some(ref rx) = pending.rx else { return };

    match rx.try_recv() {
        Ok(new_graph) => {
            *graph = new_graph;
            pending.rx = None;
        }
        Err(crossbeam_channel::TryRecvError::Empty) => {}
        Err(crossbeam_channel::TryRecvError::Disconnected) => {
            pending.rx = None;
        }
    }
}

// ---------------------------------------------------------------------------
// System: evict far-away nav data
// ---------------------------------------------------------------------------

pub fn evict_nav_data(
    time: Res<Time>,
    mut timer: ResMut<NavEvictTimer>,
    sim_center: Res<SimulationCenter>,
    nav: Res<NavGrid>,
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
// Patrol route generation — off-thread per creature
// ---------------------------------------------------------------------------

/// Marker for creatures that need a patrol route computed.
#[derive(Component)]
pub struct NeedsPatrolRoute;

/// Pending patrol route computation.
#[derive(Component)]
pub struct PendingPatrolCompute {
    rx: Receiver<Option<PatrolRoute>>,
}

/// Tag newly-activated creatures that have an influence profile but no route.
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
        if cr.state != CreatureState::Active {
            continue;
        }
        let Some(ctype) = types.types.iter().find(|t| t.npc_ref == marker.type_key) else {
            continue;
        };
        if ctype.influence.is_none() {
            continue;
        }
        commands.entity(entity).insert(NeedsPatrolRoute);
    }
}

/// Dispatch patrol route generation off-thread. NavGrid is read via shared
/// DashMap handle — cheap Arc clone, no data copying.
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
        if graph.waypoints.is_empty() {
            continue;
        }

        let seed = cr.slot_seed;
        let anchor = cr.anchor;
        let profile_clone = profile.clone();
        let emotes: Vec<&'static str> = ctype.patrol_emotes.to_vec();
        let nav_clone = nav.clone(); // Cheap: Arc clone
        let graph_clone = graph.clone();

        let (tx, rx) = bounded::<Option<PatrolRoute>>(1);

        bevy_tasker::spawn(async move {
            let route = patrol::generate_route(
                seed,
                anchor,
                &profile_clone,
                &graph_clone,
                &nav_clone,
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

/// Receive completed patrol routes and insert PatrolRoute components.
pub fn receive_patrol_routes(
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
                commands.entity(entity).remove::<PendingPatrolCompute>();
            }
            Err(crossbeam_channel::TryRecvError::Empty) => {}
            Err(crossbeam_channel::TryRecvError::Disconnected) => {
                commands.entity(entity).remove::<PendingPatrolCompute>();
            }
        }
    }
}
