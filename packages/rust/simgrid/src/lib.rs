pub mod arpg_dungeon;
pub mod biome;
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
pub use grid::{
    FloatMove, Floor, GridPos, MoveSpeed, MoveTarget, StairGrace, StairLink, Stairs, WalkableMap,
};
pub use net::{Roster, ServerState, SlotInput, router};
pub use sim::{
    Aggro, AggroSpec, BUSH_DENSITY_PER_MILLE, BUSH_REF, BUSH_VARIANTS, Blocker, BuffEffects,
    BuffSpec, BushState, CombatStats, ConsumableEffects, Defense, DeployableSpec, Deployables,
    EntityKind, EnvObject, EnvOpts, EnvPersistSink, EquipBonus, EquipmentEffects, Equipped,
    HazardZone, HealAura, Health, Inventory, ItemPrices, Loot, MoveProfile, NpcLevel, NpcSpec,
    PersistedEnvLog, PersistedEnvObject, PlayerSlotTag, PlayerStore, RespawnOnDeath, SIM_TICK_HZ,
    ShopStock, SimClock, SimConfig, SimSeed, SimSet, StatusEffect, StatusEffects,
    TREE_DENSITY_PER_MILLE, TREE_REF, TREE_VARIANTS, Terrain, TreeState, Wander, XpState,
    build_app, bush_at, ground_item_bundle, has_clearance, level_attack, level_max_hp,
    run_sim_loop, spawn_bush, spawn_env_object, spawn_npc_from_spec, spawn_tree, tree_at,
    xp_to_next,
};
