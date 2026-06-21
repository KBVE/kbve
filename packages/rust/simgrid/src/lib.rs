pub mod arpg_dungeon;
pub mod blackjack;
pub mod combat;
pub mod data;
pub mod dungeon;
pub mod grid;
pub mod net;
pub mod proto;
pub mod rng;
pub mod sim;

#[cfg(feature = "supabase-auth")]
pub mod auth;

pub use data::{ItemDb, ItemDef, KindRegistry, NpcDb, NpcDef};
pub use grid::{Floor, GridPos, MoveSpeed, MoveTarget, StairLink, Stairs, WalkableMap};
pub use net::{Roster, ServerState, SlotInput, router};
pub use sim::{
    Aggro, AggroSpec, Blocker, BuffEffects, BuffSpec, CombatStats, ConsumableEffects, Defense,
    EntityKind, EnvObject, EnvOpts, EquipBonus, EquipmentEffects, Equipped, HazardZone, HealAura,
    Health, Inventory, ItemPrices, Loot, NpcLevel, NpcSpec, Path, PlayerSlotTag, PlayerStore,
    RespawnOnDeath, SIM_TICK_HZ, ShopStock, SimConfig, SimSet, StatusEffect, StatusEffects,
    StepBuffer, TableDef, Tables, Wander, XpState, build_app, ground_item_bundle, level_attack,
    level_max_hp, run_sim_loop, spawn_env_object, spawn_npc_from_spec, xp_to_next,
};
