//! Wild pets — the encounter source capture needs.
//!
//! Before this, nothing catchable existed in the world: `mechamutt` is the only species with
//! `pet.catchable`, and it only ever appeared as a battle team built by `mechamutt_team` or
//! `trainer_team`. Trainer pets belong to the trainer and PvP pets belong to another player, so
//! neither is a legitimate catch target.
//!
//! A wild pet is a peaceful, streamed NPC on the surface. It carries no `AggroSpec` — it will
//! not attack — and walking up to it starts a 1v1 wild duel where the Catch action is offered.
//! Streaming mirrors `creatures::stream_predators` (cull by distance, top up per player), but on
//! the surface rather than underground, since the surface is the peaceful half of the world.

use bevy::prelude::{Commands, Component, Entity, Query, Res, With, Without};
use simgrid::proto::Tile;
use simgrid::rng::hash3;
use simgrid::{
    EntityKind, Floor, GridPos, KindRegistry, NpcSpec, PlayerSlotTag, SIM_TICK_HZ, SimClock,
    SimSeed, spawn_npc_from_spec,
};

use crate::game::{SPAWN_FLOOR, floor_near_z};

/// Kind ref for a wild pet. Distinct from the species ref so the client can render a wild
/// mechamutt with the creature sheets it already has, and so a wild pet reads as its own kind of
/// world object rather than as a hostile creature.
pub const WILD_PET_REF: &str = "wild-pet";

/// The species a wild pet is an instance of. Only one catchable species exists today; when there
/// are more, this becomes a weighted table per biome.
pub const WILD_SPECIES_REF: &str = "mechamutt";

pub const WILD_LEVEL_MIN: u32 = 3;
pub const WILD_LEVEL_MAX: u32 = 8;

const WILD_PER_PLAYER: usize = 2;
const WILD_SPAWN_MIN: i32 = 8;
const WILD_SPAWN_MAX: i32 = 16;
const WILD_DESPAWN_RADIUS: i32 = 28;
const WILD_STREAM_PERIOD_TICKS: u32 = SIM_TICK_HZ * 3;
const WILD_TICKS_PER_TILE: u8 = 10;
const WILD_HP: i32 = 20;
const WILD_WANDER_RADIUS: i32 = 3;
/// Ticks a wild pet idles between wander steps.
const WILD_WANDER_DWELL_TICKS: u32 = SIM_TICK_HZ * 2;

/// Marker for a catchable wild pet standing in the world. `level` is rolled at spawn and is what
/// the duel mints its combatant at, so a caught pet keeps the level it was found at.
#[derive(Component)]
pub struct WildPet {
    pub species_ref: String,
    pub level: u32,
}

fn chebyshev(a: Tile, b: Tile) -> i32 {
    (a.x - b.x).abs().max((a.y - b.y).abs())
}

fn wild_spec(registry: &KindRegistry, origin: Tile, level: u32) -> Option<NpcSpec> {
    let kind = registry.kind_of(WILD_PET_REF)?;
    Some(NpcSpec {
        kind,
        origin,
        floor: SPAWN_FLOOR,
        ticks_per_tile: WILD_TICKS_PER_TILE,
        max_hp: WILD_HP,
        level: level as i32,
        defense: 0,
        // Idles around its spawn point. No `aggro`: a wild pet never initiates, the player does.
        wander: Some((WILD_WANDER_RADIUS, WILD_WANDER_DWELL_TICKS)),
        roam: None,
        aggro: None,
        loot: None,
        // Culled by distance like predators, not respawned in place.
        respawn_ticks: 0,
        float_steer: false,
        move_profile: None,
    })
}

/// Roll a wild pet's level from the world seed, the spawn attempt and the tick, so two players
/// streaming at the same moment do not get identical encounters.
fn wild_level(seed: u64, salt: u64, tick: u32) -> u32 {
    let span = (WILD_LEVEL_MAX - WILD_LEVEL_MIN + 1) as u64;
    WILD_LEVEL_MIN + (hash3(seed, salt, tick as u64) % span) as u32
}

/// Stream wild pets around surface players. Culls any that drifted out of every player's radius,
/// then tops each player's local population back up.
pub fn stream_wild_pets(
    clock: Res<SimClock>,
    seed: Res<SimSeed>,
    registry: Res<KindRegistry>,
    players: Query<(&GridPos, Option<&Floor>), With<PlayerSlotTag>>,
    wild: Query<(Entity, &GridPos, Option<&Floor>, &EntityKind), Without<PlayerSlotTag>>,
    mut commands: Commands,
) {
    if !clock.tick.is_multiple_of(WILD_STREAM_PERIOD_TICKS) {
        return;
    }
    let Some(wild_kind) = registry.kind_of(WILD_PET_REF) else {
        return;
    };

    // Surface only — the dungeon is where the hostile creatures live.
    let surface_players: Vec<Tile> = players
        .iter()
        .filter(|(_, f)| f.map(|f| f.0).unwrap_or(0) >= SPAWN_FLOOR)
        .map(|(p, _)| p.tile)
        .collect();

    let mut alive: Vec<Tile> = Vec::new();
    for (entity, pos, pfloor, kind) in wild.iter() {
        if kind.0 != wild_kind {
            continue;
        }
        if pfloor.map(|f| f.0).unwrap_or(0) < SPAWN_FLOOR {
            continue;
        }
        if surface_players
            .iter()
            .any(|pt| chebyshev(*pt, pos.tile) <= WILD_DESPAWN_RADIUS)
        {
            alive.push(pos.tile);
        } else {
            commands.entity(entity).despawn();
        }
    }

    for (i, ptile) in surface_players.iter().enumerate() {
        let local = alive
            .iter()
            .filter(|t| chebyshev(**t, *ptile) <= WILD_SPAWN_MAX)
            .count();
        if local >= WILD_PER_PLAYER {
            continue;
        }
        for attempt in 0..8u64 {
            let salt = ((i as u64) << 8) | attempt;
            let h = hash3(seed.0, salt, clock.tick as u64);
            let span = (WILD_SPAWN_MAX - WILD_SPAWN_MIN + 1) as u64;
            let dist = WILD_SPAWN_MIN + ((h >> 8) % span) as i32;
            let (dx, dy) = ring_offset((h % 8) as u8, dist);
            let origin = floor_near_z(Tile::new(ptile.x + dx, ptile.y + dy), SPAWN_FLOOR);
            if chebyshev(origin, *ptile) < WILD_SPAWN_MIN {
                continue;
            }
            let level = wild_level(seed.0, salt, clock.tick);
            if let Some(spec) = wild_spec(&registry, origin, level) {
                let e = spawn_npc_from_spec(&mut commands, &spec);
                commands.entity(e).insert((
                    WildPet {
                        species_ref: WILD_SPECIES_REF.to_string(),
                        level,
                    },
                    // A wild pet cannot be hit with the overworld combat verbs — the only way to
                    // interact is the duel, same as a trainer.
                    simgrid::Invulnerable,
                ));
                alive.push(origin);
            }
            break;
        }
    }
}

/// One of eight compass offsets at `dist`, so spawns ring the player instead of clustering.
fn ring_offset(dir: u8, dist: i32) -> (i32, i32) {
    match dir % 8 {
        0 => (dist, 0),
        1 => (dist, dist),
        2 => (0, dist),
        3 => (-dist, dist),
        4 => (-dist, 0),
        5 => (-dist, -dist),
        6 => (0, -dist),
        _ => (dist, -dist),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn wild_levels_stay_in_band() {
        for salt in 0..64u64 {
            let lvl = wild_level(7, salt, salt as u32 * 13);
            assert!(
                (WILD_LEVEL_MIN..=WILD_LEVEL_MAX).contains(&lvl),
                "level {lvl} out of band"
            );
        }
    }

    #[test]
    fn wild_level_is_deterministic() {
        assert_eq!(wild_level(7, 3, 100), wild_level(7, 3, 100));
    }

    #[test]
    fn ring_offsets_sit_at_the_requested_distance() {
        for dir in 0..8u8 {
            let (dx, dy) = ring_offset(dir, 12);
            assert_eq!(dx.abs().max(dy.abs()), 12);
        }
    }
}
