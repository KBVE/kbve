//! Owner-initiated roster mutations: choose the battle lead, release a pet, rename a
//! pet. simgrid owns the mechanism (`PetBank`, `PendingRosterOps`); the policy lives
//! here because the duel-busy check needs [`crate::duel::ActiveDuels`].
//!
//! Every op — applied or rejected — ends in a roster re-sync to the owner, so a client
//! that guessed wrong is corrected by the next frame instead of drifting.

use bevy::prelude::*;
use simgrid::sim::{PendingRosterOps, RosterOp};

/// Drain this frame's roster ops. Ops are rejected while the owner is in a duel: the
/// live `BattleState` holds copies of the roster's pets, so releasing or re-leading
/// mid-battle would desync the two.
pub fn apply_roster_ops(
    bcast: Res<simgrid::Outbound>,
    duels: Res<crate::duel::ActiveDuels>,
    mut ops: ResMut<PendingRosterOps>,
    mut bank: simgrid::PetBank,
    mut players: Query<(&simgrid::PlayerSlotTag, &mut simgrid::PetRoster)>,
) {
    if ops.0.is_empty() {
        return;
    }
    for (slot, op) in std::mem::take(&mut ops.0) {
        let Some((_, mut roster)) = players.iter_mut().find(|(tag, _)| tag.0 == slot) else {
            continue;
        };
        if duels.by_slot.contains_key(&slot.0) {
            simgrid::send_roster_sync(
                &bcast,
                slot,
                &bank.snapshot(&roster),
                roster.active,
                Some(&crate::game::NPC_DB),
            );
            continue;
        }
        let mut renamed: Option<(usize, String)> = None;
        match op {
            RosterOp::SetActive { idx } => {
                bank.set_active(&mut roster, idx);
            }
            RosterOp::Release { idx } => {
                bank.release(&mut roster, idx);
            }
            RosterOp::Rename { idx, name } => {
                if let Some(applied) = bank.rename(&roster, idx, &name) {
                    renamed = Some((idx, applied));
                }
            }
        }
        let mut snaps = bank.snapshot(&roster);
        // `rename` inserts through Commands, invisible to `snapshot` until the next sync
        // point — patch it in so this frame's sync isn't a frame behind the rename.
        if let Some((idx, applied)) = renamed
            && let Some(snap) = snaps.get_mut(idx)
        {
            snap.nickname = applied;
        }
        simgrid::send_roster_sync(
            &bcast,
            slot,
            &snaps,
            roster.active,
            Some(&crate::game::NPC_DB),
        );
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use simgrid::proto::{PetRosterSync, PlayerSlot};
    use tokio::sync::mpsc::UnboundedReceiver;

    const SLOT: PlayerSlot = PlayerSlot(1);

    fn snap(id: &str, nickname: &str) -> simgrid::PetSnapshot {
        simgrid::PetSnapshot {
            id: id.into(),
            species_ref: "mechamutt".into(),
            nickname: nickname.into(),
            level: 5,
            xp: 0,
            vitals: simgrid::PetVitals {
                hp: 30,
                max_hp: 30,
                attack: 10,
                defense: 10,
                sp_attack: 10,
                sp_defense: 10,
                speed: 10,
            },
            moves: vec![],
        }
    }

    #[derive(bevy::prelude::Resource, Default)]
    struct SeedPets(Vec<simgrid::PetSnapshot>);

    /// Mint the seeded pets into the player's roster on the first update, then clear the
    /// seed so later frames are no-ops.
    fn seed_pets(
        mut seed: ResMut<SeedPets>,
        mut bank: simgrid::PetBank,
        mut players: Query<&mut simgrid::PetRoster>,
    ) {
        if seed.0.is_empty() {
            return;
        }
        let Some(mut roster) = players.iter_mut().next() else {
            return;
        };
        for s in std::mem::take(&mut seed.0) {
            bank.add(&mut roster, s);
        }
    }

    /// An app with one player at `SLOT` owning a pet per name, both systems registered,
    /// and the outbound receiver so the emitted sync can be inspected. One `update` has
    /// already run, so the seeded pet entities are real and queryable.
    fn harness(
        names: &[&str],
    ) -> (
        bevy::app::App,
        UnboundedReceiver<simgrid::proto::ServerEvent>,
    ) {
        let mut app = bevy::app::App::new();
        let (tx, rx) = tokio::sync::mpsc::unbounded_channel();
        app.insert_resource(simgrid::Outbound { tx });
        app.insert_resource(simgrid::PendingPets::default());
        app.insert_resource(PendingRosterOps::default());
        app.insert_resource(crate::duel::ActiveDuels::default());
        app.insert_resource(SeedPets(names.iter().map(|n| snap(n, n)).collect()));
        app.world_mut()
            .spawn((simgrid::PlayerSlotTag(SLOT), simgrid::PetRoster::default()));
        app.add_systems(bevy::prelude::Update, (seed_pets, apply_roster_ops).chain());
        app.update();
        (app, rx)
    }

    /// The last roster sync the system emitted, decoded.
    fn last_sync(rx: &mut UnboundedReceiver<simgrid::proto::ServerEvent>) -> PetRosterSync {
        let mut found = None;
        while let Ok(ev) = rx.try_recv() {
            if let simgrid::proto::ServerEvent::Ephemeral { kind, payload, .. } = ev
                && kind == simgrid::proto::EPHEMERAL_PET_ROSTER
            {
                found = Some(simgrid::proto::decode_inner(&payload).expect("decode"));
            }
        }
        found.expect("a roster sync was emitted")
    }

    fn run_op(app: &mut bevy::app::App, op: RosterOp) {
        app.world_mut()
            .resource_mut::<PendingRosterOps>()
            .0
            .push((SLOT, op));
        app.update();
    }

    #[test]
    fn set_active_moves_the_lead_and_syncs() {
        let (mut app, mut rx) = harness(&["a", "b", "c"]);
        run_op(&mut app, RosterOp::SetActive { idx: 2 });
        assert_eq!(last_sync(&mut rx).active, Some(2));
    }

    #[test]
    fn set_active_out_of_range_is_rejected_but_still_syncs() {
        let (mut app, mut rx) = harness(&["a", "b"]);
        run_op(&mut app, RosterOp::SetActive { idx: 9 });
        // `add` made slot 0 the lead; the bogus index must not have moved it, and the
        // client still gets a sync so an optimistic UI snaps back.
        assert_eq!(last_sync(&mut rx).active, Some(0));
    }

    #[test]
    fn release_drops_the_slot_and_fixes_the_lead() {
        let (mut app, mut rx) = harness(&["a", "b", "c"]);
        run_op(&mut app, RosterOp::SetActive { idx: 2 });
        run_op(&mut app, RosterOp::Release { idx: 0 });
        let sync = last_sync(&mut rx);
        assert_eq!(sync.pets.len(), 2);
        assert_eq!(
            sync.pets
                .iter()
                .map(|p| p.nickname.as_str())
                .collect::<Vec<_>>(),
            ["b", "c"]
        );
        // The lead was index 2; removing an earlier slot must shift it down, not orphan it.
        assert_eq!(sync.active, Some(1));
    }

    #[test]
    fn rename_is_visible_in_the_same_frame_sync() {
        let (mut app, mut rx) = harness(&["a", "b"]);
        run_op(
            &mut app,
            RosterOp::Rename {
                idx: 1,
                name: "  Bolt  ".into(),
            },
        );
        // Trimmed, and patched into this frame's sync even though the component insert is
        // still queued in Commands.
        assert_eq!(last_sync(&mut rx).pets[1].nickname, "Bolt");
    }

    #[test]
    fn rename_to_blank_is_rejected() {
        let (mut app, mut rx) = harness(&["a"]);
        run_op(
            &mut app,
            RosterOp::Rename {
                idx: 0,
                name: "   ".into(),
            },
        );
        assert_eq!(last_sync(&mut rx).pets[0].nickname, "a");
    }

    #[test]
    fn ops_are_rejected_while_the_owner_is_dueling() {
        let (mut app, mut rx) = harness(&["a", "b"]);
        app.world_mut()
            .resource_mut::<crate::duel::ActiveDuels>()
            .by_slot
            .insert(SLOT.0, 1);
        run_op(&mut app, RosterOp::Release { idx: 0 });
        let sync = last_sync(&mut rx);
        // Nothing released — the live BattleState holds copies of these pets.
        assert_eq!(sync.pets.len(), 2);
        assert_eq!(sync.active, Some(0));
    }
}
