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

/// How attached the pet is to its owner, `0..=255`, seeded from the species'
/// `base_friendship`. Read by [`crate::battle::Combatant`] — a pet at or above
/// [`FRIENDSHIP_DEVOTED`] hits harder.
#[derive(Component, Clone, Copy, Debug, PartialEq, Eq, Default, Serialize, Deserialize)]
pub struct PetFriendship(pub u8);

/// Friendship at which a pet starts fighting harder for its owner.
pub const FRIENDSHIP_DEVOTED: u8 = 200;

/// Friendship gained per duel won by a participating pet.
pub const FRIENDSHIP_PER_WIN: u8 = 2;

/// Friendship gained per level, so a pet that is actually being raised closes the gap to
/// [`FRIENDSHIP_DEVOTED`] rather than needing hundreds of duels.
pub const FRIENDSHIP_PER_LEVEL: u8 = 4;

/// Friendship lost when the pet faints. Larger than a win is worth, so carelessly throwing
/// a pet into battles it loses walks the number backwards.
pub const FRIENDSHIP_ON_FAINT: u8 = 5;

/// An owner's ordered pet roster — handles to pet entities, plus the active index
/// (the pet sent out first in battle). Mutate via [`PetBank`].
#[derive(Component, Clone, Default)]
pub struct PetRoster {
    pub slots: Vec<Entity>,
    pub active: Option<usize>,
}

/// Detached DTO form of a pet instance — for read-back, the wire, and persistence.
///
/// This is the shape `pet_instances` in #13789 mirrors, so every field here is a column
/// and every field absent here is one the schema does not need.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct PetSnapshot {
    pub id: String,
    pub species_ref: String,
    pub nickname: String,
    pub level: u32,
    pub xp: u32,
    /// Rolled once at mint and immutable thereafter — not by levelling, not by evolution.
    pub genes: crate::genes::PetGenes,
    pub gender: crate::genes::PetGender,
    pub friendship: u8,
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

/// Longest accepted pet nickname, in chars.
pub const PET_NICKNAME_MAX: usize = 20;

/// Most pets an owner can carry. There is no box beyond this yet, so a capture attempt at the
/// cap is refused outright rather than silently dropping the catch.
pub const PET_ROSTER_MAX: usize = 6;

/// Trim a client-supplied nickname to printable single-line text, clamped to
/// [`PET_NICKNAME_MAX`] chars. Control characters are dropped rather than replaced so a
/// pasted newline can't smuggle a second line into the name.
pub fn sanitize_nickname(name: &str) -> String {
    name.chars()
        .filter(|c| !c.is_control())
        .collect::<String>()
        .trim()
        .chars()
        .take(PET_NICKNAME_MAX)
        .collect::<String>()
        .trim_end()
        .to_string()
}

/// Gentle level scaling for a base stat — `base` at level 1, growing ~1/8 of base per
/// level. A prototype curve; tune when the battle math lands.
pub(crate) fn level_scale(base: i32, level: u32) -> i32 {
    base + base * (level as i32 - 1) / 8
}

/// How many moves a pet can know at once. A pet at the cap must forget one to learn another.
pub const PET_MOVE_SLOTS: usize = 4;

/// Build a move slot for `ability_id` at full PP, reading `max_pp` off the species' ability
/// list. Returns `None` when the species does not define that ability — a movepool entry can
/// name an ability that was renamed or removed, and silently learning a 0-PP move would give
/// the pet a slot it can never use.
pub fn move_slot_from_species(species: &NpcDef, ability_id: &str) -> Option<PetMoveSlot> {
    let ability = species.abilities.iter().find(|a| a.id == ability_id)?;
    let max_pp = ability.max_pp.max(ability.pp).max(0) as u16;
    Some(PetMoveSlot {
        ability_id: ability_id.to_string(),
        pp: max_pp,
        max_pp,
    })
}

/// Mint a fresh pet instance from a catchable species at `level`. Returns `None` when
/// the species isn't a catchable pet. Vitals come from the base stats scaled by level and
/// then by the pet's own genetics; moves are the most-recent (up to four) moves learned at
/// or below `level`, each at full PP.
pub fn mint_pet_from_species(species: &NpcDef, level: u32) -> Option<PetSnapshot> {
    mint_pet_inner(species, level, None)
}

/// Mint with genetics supplied rather than rolled.
///
/// Two uses: a pet handed out with fixed stats, and any test that needs two pets of one species
/// to be comparable — since genetics are rolled from a fresh ULID, two calls to
/// [`mint_pet_from_species`] are deliberately no longer identical.
pub fn mint_pet_with_genes(
    species: &NpcDef,
    level: u32,
    genes: crate::genes::PetGenes,
) -> Option<PetSnapshot> {
    mint_pet_inner(species, level, Some(genes))
}

fn mint_pet_inner(
    species: &NpcDef,
    level: u32,
    fixed: Option<crate::genes::PetGenes>,
) -> Option<PetSnapshot> {
    let pet = species.pet.as_ref().filter(|p| p.catchable)?;
    let lvl = level.max(1);
    let id = mint_pet_id();
    let genes = fixed.unwrap_or_else(|| crate::genes::PetGenes::roll(&id));

    // Deliberately the same call `grow_pet` and `evolve_pet` make rather than an inlined
    // copy of the curve: a pet minted at level N must have identical stats to one grown or
    // evolved into level N, or where a pet came from would be visible in its stat line.
    let mut vitals = PetVitals::default();
    crate::progress::rescale_for(
        &mut vitals,
        &crate::progress::BaseStats::of(species),
        lvl,
        &genes,
    );
    vitals.hp = vitals.max_hp;

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
        .take(PET_MOVE_SLOTS)
        .rev()
        .filter_map(|id| move_slot_from_species(species, id))
        .collect();

    Some(PetSnapshot {
        gender: crate::genes::PetGender::roll(pet.gender_ratio, &id),
        friendship: pet.base_friendship.clamp(0, u8::MAX as i32) as u8,
        id,
        species_ref: species.ref_id.clone(),
        nickname: species.name.clone(),
        level: lvl,
        xp: 0,
        genes,
        vitals,
        moves,
    })
}

/// Owners whose roster changed this frame and need a re-sync. A queue rather than a
/// direct send because the systems that mutate pet components hold `&mut PetVitals` /
/// `&mut PetMoves`, which conflicts with [`PetBank`]'s read-only view of the same
/// components — they cannot both live in one system. Drained by [`flush_roster_syncs`].
#[derive(Resource, Default)]
pub struct PendingRosterSyncs(pub HashSet<crate::proto::PlayerSlot>);

/// Send one roster sync per owner queued in [`PendingRosterSyncs`]. Runs after everything
/// that can touch a roster, so a frame with several mutations still costs one event.
pub fn flush_roster_syncs(
    bcast: bevy::prelude::Res<crate::sim::Outbound>,
    mut queued: ResMut<PendingRosterSyncs>,
    db: Option<bevy::prelude::Res<crate::data::NpcDb>>,
    bank: PetBank,
    players: Query<(&crate::sim::PlayerSlotTag, &PetRoster)>,
) {
    if queued.0.is_empty() {
        return;
    }
    for slot in std::mem::take(&mut queued.0) {
        let Some((_, roster)) = players.iter().find(|(tag, _)| tag.0 == slot) else {
            continue;
        };
        send_roster_sync(
            &bcast,
            slot,
            &bank.snapshot(roster),
            roster.active,
            db.as_deref(),
        );
    }
}

/// Detach a live battle combatant into a persistable pet instance — the capture path.
///
/// The caught pet keeps the level, hp and PP it had when the ball landed: phase D made battle
/// vitals persist, so minting a fresh full-health copy here would quietly contradict that. A new
/// instance id is minted because this is a new owned pet, not a move of an existing one.
pub fn snapshot_from_combatant(c: &crate::battle::Combatant) -> PetSnapshot {
    PetSnapshot {
        id: mint_pet_id(),
        species_ref: c.species_ref.clone(),
        nickname: c.nickname.clone(),
        level: c.level,
        xp: 0,
        // The individual is what was caught. Rolling fresh genetics here would leave the
        // stored vitals — the wild pet's, computed from ITS rolls — disagreeing with the pet's
        // own genes, and the disagreement would only surface as a stat jump at its next level.
        genes: c.genes,
        gender: c.gender,
        friendship: c.friendship,
        vitals: PetVitals {
            hp: c.hp.max(1),
            max_hp: c.max_hp,
            attack: c.attack,
            defense: c.defense,
            sp_attack: c.sp_attack,
            sp_defense: c.sp_defense,
            speed: c.speed,
        },
        moves: c
            .moves
            .iter()
            .map(|m| PetMoveSlot {
                ability_id: m.data.id.clone(),
                pp: m.pp,
                max_pp: m.max_pp,
            })
            .collect(),
    }
}

/// Push a roster snapshot to its owner as an `EPHEMERAL_PET_ROSTER` event. The single
/// emit path — the join/rejoin restore and every roster mutation go through here, so the
/// client's view of the roster can never diverge from the server's.
pub fn send_roster_sync(
    bcast: &crate::sim::Outbound,
    slot: crate::proto::PlayerSlot,
    snaps: &[PetSnapshot],
    active: Option<usize>,
    db: Option<&crate::data::NpcDb>,
) {
    let payload =
        crate::proto::encode_inner(&to_roster_sync(snaps, active, db)).unwrap_or_default();
    let _ = bcast.tx.send(crate::proto::ServerEvent::Ephemeral {
        kind: crate::proto::EPHEMERAL_PET_ROSTER,
        to: slot,
        payload,
    });
}

/// Reproject a roster's snapshots onto the wire roster-sync form.
///
/// `db` is only needed to fill `xp_to_next`, which depends on the species' growth curve.
/// Passing `None` leaves it 0 — a caller with no npcdb to hand (a game that has no pets, a
/// test) still produces a valid sync, the client just cannot draw a progress bar.
pub fn to_roster_sync(
    snaps: &[PetSnapshot],
    active: Option<usize>,
    db: Option<&crate::data::NpcDb>,
) -> crate::proto::PetRosterSync {
    crate::proto::PetRosterSync {
        pets: snaps
            .iter()
            .map(|s| crate::proto::PetView {
                id: s.id.clone(),
                species_ref: s.species_ref.clone(),
                nickname: s.nickname.clone(),
                level: s.level,
                xp: s.xp,
                xp_to_next: db
                    .and_then(|db| db.get(&s.species_ref))
                    .and_then(|species| species.pet.as_ref())
                    .map(|pet| {
                        crate::progress::GrowthRate::from_proto(&pet.growth_rate)
                            .xp_to_next(s.level)
                    })
                    .unwrap_or(0),
                evolve_items: db
                    .and_then(|db| db.get(&s.species_ref))
                    .and_then(|species| species.pet.as_ref())
                    .map(|pet| crate::evolve::evolution_items(pet, s.level))
                    .unwrap_or_default(),
                nature: s.genes.nature.index() as u32,
                ivs: s.genes.ivs.iter().map(|iv| *iv as u32).collect(),
                gender: s.gender.as_wire() as u32,
                friendship: s.friendship as u32,
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

/// Everything [`PetBank`] reads off a pet entity to rebuild a [`PetSnapshot`]. Named because
/// the inline tuple crossed clippy's complexity threshold once genetics joined it.
type PetReadQuery = (
    &'static PetId,
    &'static PetRef,
    &'static PetNickname,
    &'static PetProgress,
    &'static crate::genes::PetGenes,
    &'static crate::genes::PetGender,
    &'static PetFriendship,
    &'static PetVitals,
    &'static PetMoves,
);

/// The one chokepoint for pet-instance mutation: bundles `Commands` + the pet-entity
/// query + the per-frame overlay so roster ops can mint, release, and trade the backing
/// entities and read them back the same frame. Mirrors [`crate::sim::ItemBank`].
#[derive(SystemParam)]
pub struct PetBank<'w, 's> {
    pub commands: Commands<'w, 's>,
    pets: Query<'w, 's, PetReadQuery>,
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
                snap.genes,
                snap.gender,
                PetFriendship(snap.friendship),
                snap.vitals,
                PetMoves(snap.moves.clone()),
            ))
            .id();
        self.pending.0.insert(e, snap);
        e
    }

    /// Full snapshot for a pet entity — real components if queryable, else the overlay.
    fn read(&self, e: Entity) -> Option<PetSnapshot> {
        if let Ok((id, r, nick, prog, genes, gender, friendship, vit, mv)) = self.pets.get(e) {
            return Some(PetSnapshot {
                id: id.0.clone(),
                species_ref: r.0.clone(),
                nickname: nick.0.clone(),
                level: prog.level,
                xp: prog.xp,
                genes: *genes,
                gender: *gender,
                friendship: friendship.0,
                vitals: *vit,
                moves: mv.0.clone(),
            });
        }
        self.pending.0.get(&e).cloned()
    }

    /// Whether the roster has room for another pet.
    pub fn has_room(roster: &PetRoster) -> bool {
        roster.slots.len() < PET_ROSTER_MAX
    }

    /// Mint a pet into a roster, appending it and making it active if the roster was
    /// empty. Returns the spawned entity.
    ///
    /// Does NOT enforce [`PET_ROSTER_MAX`] — the join restore has to be able to load a roster
    /// saved before a cap change. Gameplay paths that grow a roster check [`Self::has_room`]
    /// first so the player is told why, instead of losing the pet.
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

    /// Make `idx` the battle lead. Returns whether the index was in range.
    pub fn set_active(&mut self, roster: &mut PetRoster, idx: usize) -> bool {
        if idx >= roster.slots.len() {
            return false;
        }
        roster.active = Some(idx);
        true
    }

    /// Rename the pet at `idx`. `name` is trimmed and clamped to [`PET_NICKNAME_MAX`]
    /// chars; an empty result is rejected. Returns the applied name, or `None` if the op
    /// was rejected.
    ///
    /// The `PetNickname` insert goes through `Commands`, so it is NOT visible to
    /// [`Self::snapshot`] until the next sync point — callers that sync the roster in the
    /// same frame must patch the returned name in themselves.
    pub fn rename(&mut self, roster: &PetRoster, idx: usize, name: &str) -> Option<String> {
        let &e = roster.slots.get(idx)?;
        let clean = sanitize_nickname(name);
        if clean.is_empty() {
            return None;
        }
        self.commands.entity(e).insert(PetNickname(clean.clone()));
        if let Some(snap) = self.pending.0.get_mut(&e) {
            snap.nickname = clean.clone();
        }
        Some(clean)
    }

    /// The active pet's entity, if any.
    pub fn active(&self, roster: &PetRoster) -> Option<Entity> {
        roster.active.and_then(|i| roster.slots.get(i).copied())
    }

    /// The detached snapshots of a roster, in slot order — for the wire + persistence.
    pub fn snapshot(&self, roster: &PetRoster) -> Vec<PetSnapshot> {
        roster.slots.iter().filter_map(|&e| self.read(e)).collect()
    }

    /// Like [`Self::snapshot`], but keeps each snapshot paired with the entity it came
    /// from. Callers that have to write back to a pet (battle vitals commit-back) need the
    /// handle, and pairing here keeps them from re-deriving it by index — `snapshot` drops
    /// unreadable slots, so slot order and snapshot order are not interchangeable.
    pub fn snapshot_with_entities(&self, roster: &PetRoster) -> Vec<(Entity, PetSnapshot)> {
        roster
            .slots
            .iter()
            .filter_map(|&e| self.read(e).map(|snap| (e, snap)))
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::data::{NpcAbility, NpcMovepoolEntry, NpcPet, NpcStats};
    use bevy::prelude::*;

    /// The guarantee that made `rescale_for` the single stat choke point: three different code
    /// paths reach level N, and a pet must not be able to tell which one it took.
    ///
    /// Before per-instance genetics this held for free, because `mint_pet_from_species` inlined
    /// the same pure `level_scale` the other two used. It does not hold for free any more.
    #[test]
    fn minted_grown_and_evolved_pets_agree_at_the_same_level() {
        let def = mechamutt();
        let pet = def.pet.as_ref().expect("pet");
        let base = crate::progress::BaseStats::of(&def);
        let genes = crate::genes::PetGenes {
            ivs: [31, 4, 19, 0, 27, 11],
            nature: crate::genes::Nature::from_index(9),
        };

        let mut minted = PetVitals::default();
        crate::progress::rescale_for(&mut minted, &base, 12, &genes);

        let mut grown = PetVitals::default();
        crate::progress::rescale_for(&mut grown, &base, 1, &genes);
        grown.hp = grown.max_hp;
        let mut progress = PetProgress { level: 1, xp: 0 };
        // Enough xp to cover eleven levels of MediumFast in one award.
        while progress.level < 12 {
            let need = crate::progress::GrowthRate::from_proto(&pet.growth_rate)
                .xp_to_next(progress.level);
            crate::progress::grow_pet(&mut progress, &mut grown, pet, &base, &genes, need);
        }
        assert_eq!(progress.level, 12);

        let mut evolved = PetVitals::default();
        crate::progress::rescale_for(&mut evolved, &base, 12, &genes);
        let mut moves = PetMoves(vec![]);
        crate::evolve::evolve_pet(
            &def,
            &PetProgress { level: 12, xp: 0 },
            &genes,
            &mut evolved,
            &mut moves,
        );

        assert_eq!(minted.max_hp, grown.max_hp, "mint vs grow: max_hp");
        assert_eq!(minted.attack, grown.attack, "mint vs grow: attack");
        assert_eq!(minted.speed, grown.speed, "mint vs grow: speed");
        assert_eq!(minted.max_hp, evolved.max_hp, "mint vs evolve: max_hp");
        assert_eq!(minted.attack, evolved.attack, "mint vs evolve: attack");
        assert_eq!(minted.speed, evolved.speed, "mint vs evolve: speed");
    }

    #[test]
    fn two_pets_of_one_species_and_level_now_differ() {
        // The whole point of the module. Before genetics these were byte-identical, which made
        // catching a second of anything pointless.
        let def = mechamutt();
        let a = mint_pet_from_species(&def, 30).expect("mint");
        let b = mint_pet_from_species(&def, 30).expect("mint");
        assert_ne!(a.genes, b.genes, "distinct ids must roll distinct genes");
    }

    #[test]
    fn a_minted_pets_stats_match_its_own_genes() {
        let def = mechamutt();
        let snap = mint_pet_from_species(&def, 25).expect("mint");
        let mut expected = PetVitals::default();
        crate::progress::rescale_for(
            &mut expected,
            &crate::progress::BaseStats::of(&def),
            25,
            &snap.genes,
        );
        assert_eq!(snap.vitals.max_hp, expected.max_hp);
        assert_eq!(snap.vitals.attack, expected.attack);
        assert_eq!(
            snap.vitals.hp, snap.vitals.max_hp,
            "a freshly minted pet starts full"
        );
    }

    #[test]
    fn a_minted_pet_carries_the_species_base_friendship() {
        let mut def = mechamutt();
        def.pet.as_mut().expect("pet").base_friendship = 90;
        assert_eq!(mint_pet_from_species(&def, 5).expect("mint").friendship, 90);
    }

    #[test]
    fn an_out_of_range_base_friendship_clamps_instead_of_wrapping() {
        let mut def = mechamutt();
        def.pet.as_mut().expect("pet").base_friendship = 4000;
        assert_eq!(
            mint_pet_from_species(&def, 5).expect("mint").friendship,
            u8::MAX
        );
        def.pet.as_mut().expect("pet").base_friendship = -20;
        assert_eq!(mint_pet_from_species(&def, 5).expect("mint").friendship, 0);
    }

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
        // Genetics pinned so the stat assertion is about the level curve. The identity default
        // is also what this pet would have had before per-instance variance existed.
        let snap = mint_pet_with_genes(&mechamutt(), 5, crate::genes::PetGenes::default())
            .expect("catchable");
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
