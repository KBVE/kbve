pub mod blackjack;
pub mod data;
pub mod dungeon;
pub mod grid;
pub mod net;
pub mod proto;
pub mod sim;

#[cfg(feature = "supabase-auth")]
pub mod auth;

pub use data::{ItemDb, ItemDef, KindRegistry, NpcDb, NpcDef};
pub use grid::{GridPos, MoveSpeed, MoveTarget, WalkableMap};
pub use net::{Roster, ServerState, SlotInput, router};
pub use sim::{
    Aggro, AggroSpec, BuffEffects, BuffSpec, CombatStats, ConsumableEffects, Defense, EntityKind,
    EquipBonus, EquipmentEffects, Equipped, Health, Inventory, ItemPrices, Loot, NpcLevel, NpcSpec,
    Path, PlayerSlotTag, PlayerStore, RespawnOnDeath, SIM_TICK_HZ, ShopStock, SimConfig, SimSet,
    StatusEffect, StatusEffects, StepBuffer, TableDef, Tables, Wander, XpState, build_app,
    ground_item_bundle, level_attack, level_max_hp, run_sim_loop, spawn_npc_from_spec, xp_to_next,
};
