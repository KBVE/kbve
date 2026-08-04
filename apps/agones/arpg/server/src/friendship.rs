//! Pet friendship: what moves the number, and the one thing that reads it.
//!
//! `base_friendship` had been authored in npcdb since #13502 with nothing consuming it. This is
//! the module that earns it a column — the counter is seeded from it at mint, moved here, and
//! read by [`simgrid::friendship_multiplier`] inside the damage formula.
//!
//! Split from `growth.rs` because that module owns the xp axis. Friendship moves on different
//! events (a faint costs friendship but pays no xp; a forfeit pays neither) and moving it in
//! lockstep with xp would tie two curves that should be tunable apart.
//!
//! Same two-half shape as xp, for the same reason: [`queue_duel_friendship`] runs inside
//! `finish_duel`, which holds `&mut ActiveDuels`, while writing `&mut PetFriendship` needs its
//! own system.

use bevy::prelude::*;

use crate::duel::{Duel, DuelSide, engine_side};

/// Friendship deltas earned but not yet applied, as `(pet, delta)`.
#[derive(Resource, Default)]
pub struct PendingFriendship(pub Vec<(Entity, i32)>);

/// Queue the friendship a finished duel moved.
///
/// Winning pays only the winner's fielded pets, and only on a decided battle — the same gate xp
/// uses, so a forfeit or a catch moves nothing. Fainting costs on **both** sides regardless of
/// who won, because the pet was still knocked out; a pet can therefore come out of a won duel
/// down on the deal, which is the intent.
pub fn queue_duel_friendship(duel: &Duel, pending: &mut PendingFriendship) {
    let decided = matches!(
        duel.state.outcome,
        simgrid::BattleOutcome::PlayerWon | simgrid::BattleOutcome::PlayerLost
    );
    let winner = match duel.state.outcome {
        simgrid::BattleOutcome::PlayerWon => Some(0),
        simgrid::BattleOutcome::PlayerLost => Some(1),
        _ => None,
    };

    for side in 0..2 {
        if !matches!(duel.sides[side], DuelSide::Human { .. }) {
            continue;
        }
        let team = match engine_side(side) {
            simgrid::Side::Player => &duel.state.player.team,
            simgrid::Side::Enemy => &duel.state.enemy.team,
        };
        let won = decided && winner == Some(side);
        for (idx, pet) in duel.pets[side].iter().enumerate() {
            let Some(pet) = pet else { continue };
            let fainted = team.get(idx).is_some_and(|c| c.hp <= 0);
            let mut delta = 0i32;
            if won {
                delta += simgrid::FRIENDSHIP_PER_WIN as i32;
            }
            if fainted {
                delta -= simgrid::FRIENDSHIP_ON_FAINT as i32;
            }
            if delta != 0 {
                pending.0.push((*pet, delta));
            }
        }
    }
}

/// Apply queued friendship deltas, clamped to `0..=255`.
///
/// Deltas for one pet are summed before clamping, so a pet that won and fainted in the same duel
/// lands on the net change rather than depending on which delta was applied first.
pub fn apply_friendship(
    mut pending: ResMut<PendingFriendship>,
    mut queued: ResMut<simgrid::PendingRosterSyncs>,
    owners: Query<(&simgrid::PlayerSlotTag, &simgrid::PetRoster)>,
    mut pets: Query<&mut simgrid::PetFriendship>,
) {
    if pending.0.is_empty() {
        return;
    }
    let mut totals: std::collections::HashMap<Entity, i32> = std::collections::HashMap::new();
    for (pet, delta) in std::mem::take(&mut pending.0) {
        *totals.entry(pet).or_default() += delta;
    }
    for (pet, delta) in totals {
        let Ok(mut friendship) = pets.get_mut(pet) else {
            continue;
        };
        let next = (friendship.0 as i32 + delta).clamp(0, u8::MAX as i32) as u8;
        if next == friendship.0 {
            continue;
        }
        friendship.0 = next;
        // Friendship is on the roster view, and crossing FRIENDSHIP_DEVOTED changes what the
        // pet hits for, so the hub must not be left showing the old number.
        for (tag, roster) in owners.iter() {
            if roster.slots.contains(&pet) {
                queued.0.insert(tag.0);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const SLOT: simgrid::proto::PlayerSlot = simgrid::proto::PlayerSlot(3);

    fn harness(start: u8) -> (App, Entity) {
        let mut app = App::new();
        app.insert_resource(PendingFriendship::default());
        app.insert_resource(simgrid::PendingRosterSyncs::default());
        let pet = app.world_mut().spawn(simgrid::PetFriendship(start)).id();
        app.world_mut().spawn((
            simgrid::PlayerSlotTag(SLOT),
            simgrid::PetRoster {
                slots: vec![pet],
                active: Some(0),
            },
        ));
        app.add_systems(Update, apply_friendship);
        (app, pet)
    }

    fn friendship_of(app: &App, pet: Entity) -> u8 {
        app.world()
            .get::<simgrid::PetFriendship>(pet)
            .expect("friendship")
            .0
    }

    fn queue(app: &mut App, pet: Entity, delta: i32) {
        app.world_mut()
            .resource_mut::<PendingFriendship>()
            .0
            .push((pet, delta));
    }

    #[test]
    fn a_delta_lands_and_resyncs_the_roster() {
        let (mut app, pet) = harness(70);
        queue(&mut app, pet, 4);
        app.update();
        assert_eq!(friendship_of(&app, pet), 74);
        assert!(
            app.world()
                .resource::<simgrid::PendingRosterSyncs>()
                .0
                .contains(&SLOT)
        );
    }

    #[test]
    fn deltas_for_one_pet_sum_before_clamping() {
        // Won and fainted in the same duel: +2 and −5 net to −3, not to whichever applied last.
        let (mut app, pet) = harness(70);
        queue(&mut app, pet, simgrid::FRIENDSHIP_PER_WIN as i32);
        queue(&mut app, pet, -(simgrid::FRIENDSHIP_ON_FAINT as i32));
        app.update();
        assert_eq!(friendship_of(&app, pet), 67);
    }

    #[test]
    fn friendship_cannot_wrap_past_either_end() {
        let (mut app, pet) = harness(2);
        queue(&mut app, pet, -50);
        app.update();
        assert_eq!(friendship_of(&app, pet), 0);

        let (mut app, pet) = harness(250);
        queue(&mut app, pet, 50);
        app.update();
        assert_eq!(friendship_of(&app, pet), u8::MAX);
    }

    #[test]
    fn an_unchanged_number_does_not_resync() {
        let (mut app, pet) = harness(255);
        queue(&mut app, pet, 10);
        app.update();
        assert!(
            app.world()
                .resource::<simgrid::PendingRosterSyncs>()
                .0
                .is_empty(),
            "a clamped no-op must not cost a roster sync"
        );
    }

    #[test]
    fn devotion_is_reachable_by_raising_a_pet() {
        // Not a balance assertion — a guard that the constants leave FRIENDSHIP_DEVOTED
        // reachable at all. A base-70 pet must be able to close the gap within a plausible
        // number of levels, or the reader in the damage formula is decorative.
        let gap = simgrid::FRIENDSHIP_DEVOTED as i32 - 70;
        let per_level = simgrid::FRIENDSHIP_PER_LEVEL as i32;
        assert!(
            gap / per_level < 40,
            "{} levels to devotion is out of reach before the level ceiling",
            gap / per_level
        );
    }
}
