pub mod physics;
pub mod websocket;

use std::sync::Arc;
use tokio::sync::broadcast;

use physics::PhysicsWorld;

/// Shared game server state, passed to WebSocket handlers via axum State.
#[derive(Clone)]
pub struct GameServerState {
    pub inner: Arc<GameServerInner>,
}

pub struct GameServerInner {
    pub physics: PhysicsWorld,
    /// Broadcast channel for sending world snapshots to all connected clients.
    pub snapshot_tx: broadcast::Sender<Vec<u8>>,
}

/// Initialize the game server: creates physics world, starts tick loop.
pub fn init_gameserver() -> GameServerState {
    let physics = PhysicsWorld::new();
    let (snapshot_tx, _) = broadcast::channel(64);

    let state = GameServerState {
        inner: Arc::new(GameServerInner {
            physics,
            snapshot_tx,
        }),
    };

    tracing::info!("game server initialized");
    state
}
