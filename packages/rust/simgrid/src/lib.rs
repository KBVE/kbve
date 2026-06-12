pub mod data;
pub mod grid;
pub mod net;
pub mod proto;
pub mod sim;

#[cfg(feature = "supabase-auth")]
pub mod auth;

pub use data::{ItemDb, KindRegistry, NpcDb};
pub use grid::{GridPos, MoveSpeed, MoveTarget, WalkableMap};
pub use net::{Roster, ServerState, SlotInput, router};
pub use sim::{
    CombatStats, EntityKind, Health, Inventory, Loot, Path, PlayerSlotTag, SIM_TICK_HZ,
    SNAPSHOT_BROADCAST_CAPACITY, SimConfig, SimSet, StepBuffer, Wander, build_app,
    ground_item_bundle, run_sim_loop,
};
