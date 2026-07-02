pub mod arpg_dungeon;
pub mod battle;
pub mod biome;
pub mod blackjack;
pub mod combat;
pub mod data;
pub mod dungeon;
pub mod float_move;
pub mod grid;
pub mod heightfield;
pub mod net;
pub mod net_udp;
pub mod pets;
pub mod proto;
pub mod rng;
pub mod shop;
pub mod sim;
pub mod spells;
pub mod trade;

#[cfg(feature = "supabase-auth")]
pub mod auth;

pub use battle::{
    BattleAction, BattleEvent, BattleOutcome, BattleSide, BattleState, Combatant, Effectiveness,
    Element, MoveCategory, MoveData, PetStatus, Side, StatId, type_multiplier,
};
pub use blackjack::{TableDef, Tables};
pub use data::{ItemDb, ItemDef, KindRegistry, NpcDb, NpcDef};
pub use grid::{
    FloatMove, Floor, GridPos, MoveSpeed, MoveTarget, StairGrace, StairLink, Stairs, WalkableMap,
};
pub use net::{Roster, ServerState, SlotInput, router};
pub use net_udp::UdpLane;
pub use pets::{
    PendingPets, Pet, PetBank, PetId, PetMoveSlot, PetMoves, PetNickname, PetProgress, PetRef,
    PetRoster, PetSnapshot, PetVitals, clear_pending_pets, mint_pet_from_species, mint_pet_id,
    to_roster_sync,
};
pub use sim::{
    Aggro, AggroSpec, BUSH_DENSITY_PER_MILLE, BUSH_REF, BUSH_VARIANTS, Blocker, BuffEffects,
    BuffSpec, BushState, CombatStats, ConsumableEffects, Defense, DeployableSpec, Deployables,
    EntityKind, EnvObject, EnvOpts, EnvPersistSink, EquipBonus, EquipmentEffects, Equipped,
    FurnitureRot, HazardZone, HealAura, Health, InSpaceFlag, IntentBuffer, Inventory, ItemPrices,
    ItemStack, Loot, ManaAura, MoveProfile, NpcLevel, NpcSpec, Outbound, PendingPetBattles,
    PendingPetTurns, PendingPilotOps, PersistedEnvLog, PersistedEnvObject, PilotOp, Piloting,
    PlacedBy, PlayerSlotTag, PlayerStore, RespawnOnDeath, ReturnedFromInstance, SIM_TICK_HZ,
    ShopStock, SimClock, SimConfig, SimSeed, SimSet, StatusEffect, StatusEffects,
    TREE_DENSITY_PER_MILLE, TREE_REF, TREE_VARIANTS, Terrain, TreeState, Wander, XpState,
    build_app, bush_at, ground_item_bundle, ground_item_bundle_stack, has_clearance, level_attack,
    level_max_hp, mint_item_id, run_sim_loop, spawn_bush, spawn_env_object, spawn_npc_from_spec,
    spawn_tree, tree_at, xp_to_next,
};
