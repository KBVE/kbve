//! Pets are ECS entities, mirroring the items-are-entities model. A caught pet is
//! its own entity carrying [`Pet`] + [`PetId`] + [`PetRef`] + progress/vitals/moves.
//! Pets are OFF-GRID (no `GridPos`): they never stream or render in the overworld —
//! they surface only in JRPG battles and the roster UI. An owner's [`PetRoster`]
//! holds entity handles in order; all roster mutation goes through [`PetBank`], which
//! spawns/despawns the backing entities and reads them back the same frame via a
//! per-frame overlay ([`PendingPets`]), exactly as [`crate::sim::ItemBank`] does.
//!
//! Keeping instances as entities (not rows) makes trading a handle move that
//! preserves the pet's identity, and lets level/xp/hp live as plain components the
//! battle systems read directly. A render/transform component can be added later to
//! put pets in the overworld with no data migration.

use std::collections::{HashMap, HashSet};

use bevy::ecs::system::SystemParam;
use bevy::prelude::{Commands, Component, Entity, Query, ResMut, Resource};
use serde::{Deserialize, Serialize};

use crate::data::NpcDef;

/// A freshly-minted pet instance id (ULID, mint timestamp embedded), preserved
/// across every move (trade hands the same entity over, so the id never changes).
pub fn mint_pet_id() -> String {
    ulid::Ulid::new().to_string()
}

/// Marker: this entity is a caught pet instance.
#[derive(Component)]
pub struct Pet;

/// Stable ULID instance identity. On a pet entity.
#[derive(Component, Clone)]
pub struct PetId(pub String);

/// The species ref — an npcdb `ref` (e.g. `"mechamutt"`) keying the static template
/// (base stats, movepool, battle sprite). On a pet entity.
#[derive(Component, Clone)]
pub struct PetRef(pub String);

/// Display name; defaults to the species name until the owner renames it.
#[derive(Component, Clone)]
pub struct PetNickname(pub String);

/// Per-instance growth: current level and accumulated xp toward the next.
#[derive(Component, Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct PetProgress {
    pub level: u32,
    pub xp: u32,
}

/// Current combat vitals, computed from the species base stats scaled by level and
/// then mutated in place by battles. Doubles as the wire/snapshot stat block.
#[derive(Component, Clone, Copy, Default, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct PetVitals {
    pub hp: i32,
    pub max_hp: i32,
    pub attack: i32,
    pub defense: i32,
    pub sp_attack: i32,
    pub sp_defense: i32,
    pub speed: i32,
}

/// One equipped move and its remaining power points.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct PetMoveSlot {
    pub ability_id: String,
    pub pp: u16,
    pub max_pp: u16,
}

/// The pet's up-to-four known moves (resolved from the species movepool at mint).
#[derive(Component, Clone, Default)]
pub struct PetMoves(pub Vec<PetMoveSlot>);

/// An owner's ordered pet roster — handles to pet entities, plus the active index
/// (the pet sent out first in battle). Mutate via [`PetBank`].
#[derive(Component, Clone, Default)]
pub struct PetRoster {
    pub slots: Vec<Entity>,
    pub active: Option<usize>,
}

/// Detached DTO form of a pet instance — for read-back, the wire, and persistence.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct PetSnapshot {
    pub id: String,
    pub species_ref: String,
    pub nickname: String,
    pub level: u32,
    pub xp: u32,
    pub vitals: PetVitals,
    pub moves: Vec<PetMoveSlot>,
}

/// Pet entities spawned THIS frame whose components aren't queryable yet (Bevy
/// applies `Commands` spawns at the next sync point). [`PetBank`] reads this overlay
/// so a spawn → read within one frame stays consistent. Cleared each frame by
/// [`clear_pending_pets`].
#[derive(Resource, Default)]
pub struct PendingPets(pub HashMap<Entity, PetSnapshot>);

/// Drop the per-frame just-spawned-pet overlay; by the next frame those entities are
/// real and queryable.
pub fn clear_pending_pets(mut pending: ResMut<PendingPets>) {
    pending.0.clear();
}

/// Gentle level scaling for a base stat — `base` at level 1, growing ~1/8 of base per
/// level. A prototype curve; tune when the battle math lands.
fn level_scale(base: i32, level: u32) -> i32 {
    base + base * (level as i32 - 1) / 8
}

/// Mint a fresh pet instance from a catchable species at `level`. Returns `None` when
/// the species isn't a catchable pet. Vitals come from the base stats scaled by level;
/// moves are the most-recent (up to four) moves learned at or below `level`, each at
/// full PP.
pub fn mint_pet_from_species(species: &NpcDef, level: u32) -> Option<PetSnapshot> {
    let pet = species.pet.as_ref().filter(|p| p.catchable)?;
    let lvl = level.max(1);
    let s = &species.stats;
    let base_hp = s.max_hp.max(s.hp);
    let vitals = PetVitals {
        hp: level_scale(base_hp, lvl),
        max_hp: level_scale(base_hp, lvl),
        attack: level_scale(s.attack, lvl),
        defense: level_scale(s.defense, lvl),
        sp_attack: level_scale(s.special_attack, lvl),
        sp_defense: level_scale(s.special_defense, lvl),
        speed: level_scale(s.speed, lvl),
    };

    let mut learned: Vec<&str> = pet
        .movepool
        .iter()
        .filter(|m| m.level <= lvl && !m.ability_id.is_empty())
        .map(|m| m.ability_id.as_str())
        .collect();
    let mut seen: HashSet<&str> = HashSet::new();
    learned.retain(|id| seen.insert(*id));
    let moves: Vec<PetMoveSlot> = learned
        .iter()
        .rev()
        .take(4)
        .rev()
        .map(|id| {
            let max_pp = species
                .abilities
                .iter()
                .find(|a| a.id == *id)
                .map(|a| a.max_pp.max(a.pp).max(0) as u16)
                .unwrap_or(0);
            PetMoveSlot {
                ability_id: (*id).to_string(),
                pp: max_pp,
                max_pp,
            }
        })
        .collect();

    Some(PetSnapshot {
        id: mint_pet_id(),
        species_ref: species.ref_id.clone(),
        nickname: species.name.clone(),
        level: lvl,
        xp: 0,
        vitals,
        moves,
    })
}

/// Reproject a roster's snapshots onto the wire roster-sync form.
pub fn to_roster_sync(snaps: &[PetSnapshot], active: Option<usize>) -> crate::proto::PetRosterSync {
    crate::proto::PetRosterSync {
        pets: snaps
            .iter()
            .map(|s| crate::proto::PetView {
                id: s.id.clone(),
                species_ref: s.species_ref.clone(),
                nickname: s.nickname.clone(),
                level: s.level,
                xp: s.xp,
                hp: s.vitals.hp,
                max_hp: s.vitals.max_hp,
                attack: s.vitals.attack,
                defense: s.vitals.defense,
                sp_attack: s.vitals.sp_attack,
                sp_defense: s.vitals.sp_defense,
                speed: s.vitals.speed,
                moves: s
                    .moves
                    .iter()
                    .map(|m| crate::proto::PetMoveView {
                        ability_id: m.ability_id.clone(),
                        pp: m.pp,
                        max_pp: m.max_pp,
                    })
                    .collect(),
            })
            .collect(),
        active: active.map(|a| a as u32),
    }
}

/// Keep `active` valid after the slot at `removed` is taken out.
fn fix_active(roster: &mut PetRoster, removed: usize) {
    let len = roster.slots.len();
    if len == 0 {
        roster.active = None;
        return;
    }
    if let Some(a) = roster.active {
        if a == removed {
            roster.active = Some(removed.min(len - 1));
        } else if a > removed {
            roster.active = Some(a - 1);
        }
    }
}

/// The one chokepoint for pet-instance mutation: bundles `Commands` + the pet-entity
/// query + the per-frame overlay so roster ops can mint, release, and trade the backing
/// entities and read them back the same frame. Mirrors [`crate::sim::ItemBank`].
#[derive(SystemParam)]
pub struct PetBank<'w, 's> {
    pub commands: Commands<'w, 's>,
    pets: Query<
        'w,
        's,
        (
            &'static PetId,
            &'static PetRef,
            &'static PetNickname,
            &'static PetProgress,
            &'static PetVitals,
            &'static PetMoves,
        ),
    >,
    pending: ResMut<'w, PendingPets>,
}

impl PetBank<'_, '_> {
    /// Spawn a held pet entity from a snapshot, recording it in the per-frame overlay so
    /// it reads back this frame. Off-grid (no `GridPos`) — never streamed or rendered.
    pub fn spawn_pet(&mut self, snap: PetSnapshot) -> Entity {
        let e = self
            .commands
            .spawn((
                Pet,
                PetId(snap.id.clone()),
                PetRef(snap.species_ref.clone()),
                PetNickname(snap.nickname.clone()),
                PetProgress {
                    level: snap.level,
                    xp: snap.xp,
                },
                snap.vitals,
                PetMoves(snap.moves.clone()),
            ))
            .id();
        self.pending.0.insert(e, snap);
        e
    }

    /// Full snapshot for a pet entity — real components if queryable, else the overlay.
    fn read(&self, e: Entity) -> Option<PetSnapshot> {
        if let Ok((id, r, nick, prog, vit, mv)) = self.pets.get(e) {
            return Some(PetSnapshot {
                id: id.0.clone(),
                species_ref: r.0.clone(),
                nickname: nick.0.clone(),
                level: prog.level,
                xp: prog.xp,
                vitals: *vit,
                moves: mv.0.clone(),
            });
        }
        self.pending.0.get(&e).cloned()
    }

    /// Mint a pet into a roster, appending it and making it active if the roster was
    /// empty. Returns the spawned entity.
    pub fn add(&mut self, roster: &mut PetRoster, snap: PetSnapshot) -> Entity {
        let e = self.spawn_pet(snap);
        roster.slots.push(e);
        if roster.active.is_none() {
            roster.active = Some(roster.slots.len() - 1);
        }
        e
    }

    /// Release (despawn) the pet at `idx`, fixing up the active index. Returns whether a
    /// slot was removed.
    pub fn release(&mut self, roster: &mut PetRoster, idx: usize) -> bool {
        if idx >= roster.slots.len() {
            return false;
        }
        let e = roster.slots.remove(idx);
        self.pending.0.remove(&e);
        self.commands.entity(e).despawn();
        fix_active(roster, idx);
        true
    }

    /// Move the pet at `idx` from one roster to another, PRESERVING the entity (and its
    /// id) — the trade primitive. Returns whether the move happened.
    pub fn transfer(&mut self, from: &mut PetRoster, idx: usize, to: &mut PetRoster) -> bool {
        if idx >= from.slots.len() {
            return false;
        }
        let e = from.slots.remove(idx);
        fix_active(from, idx);
        to.slots.push(e);
        if to.active.is_none() {
            to.active = Some(to.slots.len() - 1);
        }
        true
    }

    /// The active pet's entity, if any.
    pub fn active(&self, roster: &PetRoster) -> Option<Entity> {
        roster.active.and_then(|i| roster.slots.get(i).copied())
    }

    /// The detached snapshots of a roster, in slot order — for the wire + persistence.
    pub fn snapshot(&self, roster: &PetRoster) -> Vec<PetSnapshot> {
        roster.slots.iter().filter_map(|&e| self.read(e)).collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::data::{NpcAbility, NpcMovepoolEntry, NpcPet, NpcStats};
    use bevy::prelude::*;

    fn mechamutt() -> NpcDef {
        NpcDef {
            ref_id: "mechamutt".into(),
            name: "Mechamutt".into(),
            level: 5,
            element: "ELEMENT_LIGHTNING".into(),
            stats: NpcStats {
                hp: 45,
                max_hp: 45,
                attack: 9,
                defense: 7,
                speed: 11,
                special_attack: 12,
                special_defense: 8,
            },
            equipment: None,
            faction: None,
            shop_items: vec![],
            abilities: vec![
                NpcAbility {
                    id: "tackle".into(),
                    max_pp: 35,
                    ..Default::default()
                },
                NpcAbility {
                    id: "spark-bark".into(),
                    max_pp: 20,
                    ..Default::default()
                },
                NpcAbility {
                    id: "overclock".into(),
                    max_pp: 10,
                    ..Default::default()
                },
            ],
            pet: Some(NpcPet {
                catchable: true,
                capture_rate: 120,
                growth_rate: "GROWTH_RATE_MEDIUM_FAST".into(),
                base_xp_yield: 64,
                movepool: vec![
                    NpcMovepoolEntry {
                        level: 1,
                        ability_id: "tackle".into(),
                    },
                    NpcMovepoolEntry {
                        level: 1,
                        ability_id: "spark-bark".into(),
                    },
                    NpcMovepoolEntry {
                        level: 16,
                        ability_id: "overclock".into(),
                    },
                ],
                ..Default::default()
            }),
        }
    }

    #[test]
    fn mint_skips_non_catchable() {
        let mut def = mechamutt();
        def.pet = None;
        assert!(mint_pet_from_species(&def, 5).is_none());
    }

    #[test]
    fn mint_scales_and_learns_levelled_moves() {
        let snap = mint_pet_from_species(&mechamutt(), 5).expect("catchable");
        assert_eq!(snap.species_ref, "mechamutt");
        assert_eq!(snap.nickname, "Mechamutt");
        assert_eq!(snap.level, 5);
        // Base 45 hp scaled by level 5: 45 + 45*4/8 = 67.
        assert_eq!(snap.vitals.max_hp, 67);
        assert_eq!(snap.vitals.hp, snap.vitals.max_hp);
        // Only level<=5 moves are learned; overclock (lvl 16) is not.
        let ids: Vec<&str> = snap.moves.iter().map(|m| m.ability_id.as_str()).collect();
        assert_eq!(ids, vec!["tackle", "spark-bark"]);
        // PP seeded from the ability's max_pp at full.
        let tackle = &snap.moves[0];
        assert_eq!((tackle.pp, tackle.max_pp), (35, 35));
    }

    fn bank_app() -> App {
        let mut app = App::new();
        app.init_resource::<PendingPets>();
        app
    }

    #[test]
    fn add_and_snapshot_roundtrips_same_frame() {
        let mut app = bank_app();
        let snap = mint_pet_from_species(&mechamutt(), 5).unwrap();
        let want = snap.clone();
        app.world_mut().spawn(PetRoster::default());

        let mut sys = bevy::ecs::system::SystemState::<(PetBank, Query<&mut PetRoster>)>::new(
            app.world_mut(),
        );
        {
            let (mut bank, mut rosters) = sys.get_mut(app.world_mut()).unwrap();
            let mut roster = rosters.single_mut().unwrap();
            bank.add(&mut roster, snap);
            let out = bank.snapshot(&roster);
            assert_eq!(roster.slots.len(), 1);
            assert_eq!(roster.active, Some(0));
            assert_eq!(out.len(), 1);
            assert_eq!(out[0].id, want.id);
            assert_eq!(out[0].vitals, want.vitals);
            assert_eq!(out[0].moves, want.moves);
        }
        sys.apply(app.world_mut());
    }

    #[test]
    fn transfer_preserves_pet_identity() {
        let mut app = bank_app();
        let snap = mint_pet_from_species(&mechamutt(), 5).unwrap();
        let id = snap.id.clone();
        let from = app.world_mut().spawn(PetRoster::default()).id();
        let to = app.world_mut().spawn(PetRoster::default()).id();

        let mut sys = bevy::ecs::system::SystemState::<(PetBank, Query<&mut PetRoster>)>::new(
            app.world_mut(),
        );
        {
            let (mut bank, mut rosters) = sys.get_mut(app.world_mut()).unwrap();
            let [mut from_r, mut to_r] = rosters.get_many_mut([from, to]).unwrap();
            bank.add(&mut from_r, snap);
            assert!(bank.transfer(&mut from_r, 0, &mut to_r));
            assert_eq!(from_r.slots.len(), 0);
            assert_eq!(from_r.active, None);
            assert_eq!(to_r.slots.len(), 1);
            // Same entity moved over → same id, identity preserved.
            assert_eq!(bank.snapshot(&to_r)[0].id, id);
        }
        sys.apply(app.world_mut());
    }
}
