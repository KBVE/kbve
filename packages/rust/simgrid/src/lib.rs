pub mod grid;
pub mod net;
pub mod proto;
pub mod sim;

#[cfg(feature = "supabase-auth")]
pub mod auth;

pub use grid::{GridPos, MoveSpeed, MoveTarget, WalkableMap};
pub use net::{Roster, ServerState, SlotInput, router};
pub use sim::{
    EntityKind, Health, PlayerSlotTag, SIM_TICK_HZ, SNAPSHOT_BROADCAST_CAPACITY, SimConfig, SimSet,
    Wander, build_app, run_sim_loop,
};
