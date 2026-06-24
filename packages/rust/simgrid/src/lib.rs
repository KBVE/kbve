pub mod arpg_dungeon;
pub mod blackjack;
pub mod combat;
pub mod data;
pub mod dungeon;
pub mod float_move;
pub mod grid;
pub mod net;
pub mod proto;
pub mod rng;
pub mod shop;
pub mod sim;
pub mod spells;
pub mod trade;

#[cfg(feature = "supabase-auth")]
pub mod auth;

pub use blackjack::{TableDef, Tables};
pub use data::{ItemDb, ItemDef, KindRegistry, NpcDb, NpcDef};
pub use grid::{FloatMove, Floor, GridPos, MoveSpeed, MoveTarget, StairLink, Stairs, WalkableMap};
pub use net::{Roster, ServerState, SlotInput, router};
pub use sim::{
    Aggro, AggroSpec, Blocker, BuffEffects, BuffSpec, CombatStats, ConsumableEffects, Defense,
    DeployableSpec, Deployables, EntityKind, EnvObject, EnvOpts, EnvPersistSink, EquipBonus,
    EquipmentEffects, Equipped, HazardZone, HealAura, Health, Inventory, ItemPrices, Loot,
    NpcLevel, NpcSpec, PersistedEnvLog, PersistedEnvObject, PlayerSlotTag, PlayerStore,
    RespawnOnDeath, SIM_TICK_HZ, ShopStock, SimClock, SimConfig, SimSeed, SimSet, StatusEffect,
    StatusEffects, Wander, XpState, build_app, ground_item_bundle, level_attack, level_max_hp,
    run_sim_loop, spawn_env_object, spawn_npc_from_spec, xp_to_next,
};
