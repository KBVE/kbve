//! Nexus Defense server-side systems (bevy + rapier2d + axum side).
//! Activated by `--features nexus-defense-server`.
//!
//! Hosts the authoritative simulation. The bevy `App` is built by
//! [`build_app`] and driven by [`run_sim_loop`] from a tokio task — no winit,
//! no rendering, just a fixed-cadence scheduler that calls `App::update`.
//!
//! Snapshots produced by the [`emit_snapshot`] system are fanned out via a
//! `tokio::sync::broadcast::Sender<ServerEvent>` so the axum WS layer can
//! subscribe a `Receiver` per connection.

use std::time::Duration;

use bevy::app::App;
use bevy::prelude::{IntoScheduleConfigs, Res, ResMut, Resource, Update};
use tokio::sync::broadcast;
use tokio::time;

use crate::proto::{self, ServerEvent};

/// Server sim tick rate. 20 Hz matches the design budget in #11294.
pub const SIM_TICK_HZ: u32 = 20;

/// Send a snapshot every `SNAPSHOT_EVERY_N_TICKS` sim ticks (10 Hz at 20 Hz sim).
pub const SNAPSHOT_EVERY_N_TICKS: u32 = 2;

/// Capacity for the broadcast channel — enough headroom for late subscribers
/// to catch up without lagging the producer.
pub const SNAPSHOT_BROADCAST_CAPACITY: usize = 256;

#[derive(Resource, Default)]
pub struct SimClock {
    pub tick: u32,
    pub elapsed_ms: u32,
}

#[derive(Resource, Clone)]
pub struct SnapshotBroadcast {
    pub tx: broadcast::Sender<ServerEvent>,
}

#[derive(Resource, Clone, Copy)]
pub struct SimSeed(pub u64);

/// Build a headless bevy `App` wired to broadcast snapshots over `tx`.
///
/// Caller owns the broadcast `Sender`; clone a `Receiver` per WS connection.
pub fn build_app(tx: broadcast::Sender<ServerEvent>, seed: u64) -> App {
    let mut app = App::new();
    app.insert_resource(SimClock::default())
        .insert_resource(SimSeed(seed))
        .insert_resource(SnapshotBroadcast { tx })
        .add_systems(Update, (tick_sim, emit_snapshot).chain());
    app
}

fn tick_sim(mut clock: ResMut<SimClock>) {
    clock.tick = clock.tick.wrapping_add(1);
    clock.elapsed_ms = clock.elapsed_ms.wrapping_add(1000 / SIM_TICK_HZ);
}

fn emit_snapshot(clock: Res<SimClock>, bcast: Res<SnapshotBroadcast>) {
    if clock.tick % SNAPSHOT_EVERY_N_TICKS != 0 {
        return;
    }
    let snap = proto::Snapshot {
        tick: clock.tick,
        server_time_ms: clock.elapsed_ms,
        input_ack: 0,
        players: Vec::new(),
        fields: Vec::new(),
        keyframe: clock.tick % (SIM_TICK_HZ * 5) == 0,
    };
    let _ = bcast.tx.send(ServerEvent::Snapshot(snap));
}

/// Drive `App::update` on a tokio task at `SIM_TICK_HZ`. Loops until the
/// surrounding task is aborted.
pub async fn run_sim_loop(mut app: App) {
    let mut ticker = time::interval(Duration::from_millis(1000 / SIM_TICK_HZ as u64));
    ticker.set_missed_tick_behavior(time::MissedTickBehavior::Skip);
    loop {
        ticker.tick().await;
        app.update();
    }
}
