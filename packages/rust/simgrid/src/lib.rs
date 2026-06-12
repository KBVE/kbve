pub mod data;
pub mod grid;
pub mod net;
pub mod proto;
pub mod sim;

#[cfg(feature = "supabase-auth")]
pub mod auth;

pub use data::{ItemDb, KindRegistry, NpcDb, NpcDef};
pub use grid::{GridPos, MoveSpeed, MoveTarget, WalkableMap};
pub use net::{Roster, ServerState, SlotInput, router};
pub use sim::{
    Aggro, AggroSpec, CombatStats, ConsumableEffects, EntityKind, EquipmentEffects, Equipped,
    Health, Inventory, Loot, NpcSpec, Path, PlayerSlotTag, PlayerStore, RespawnOnDeath,
    SIM_TICK_HZ, SNAPSHOT_BROADCAST_CAPACITY, SimConfig, SimSet, StepBuffer, Wander, build_app,
    ground_item_bundle, run_sim_loop, spawn_npc_from_spec,
};
