use super::sim::{Command, Sim, TICK_HZ, World};
use super::*;

fn tough() -> Attributes {
    Attributes::new(5, 3, 2)
}

#[test]
fn pools_are_read_off_the_attributes() {
    let vitals = Vitals::new(tough());
    assert_eq!(vitals.pool(PoolKind::Health).max(), 60.0 + 8.0 * 5.0);
    assert_eq!(vitals.pool(PoolKind::Mana).max(), 20.0 + 6.0 * 2.0);
    assert_eq!(vitals.pool(PoolKind::Energy).max(), 50.0 + 6.0 * 3.0);
    assert_eq!(vitals.pool(PoolKind::Health).fraction(), 1.0);
}

#[test]
fn nobody_has_a_zeroth_point_in_anything() {
    let floored = Attributes::new(0, 0, 0);
    assert_eq!(floored.strength, MIN_RANK);
    assert!(Vitals::new(floored).pool(PoolKind::Health).max() > 0.0);
}

#[test]
fn a_spend_is_all_of_it_or_none_of_it() {
    let mut vitals = Vitals::new(tough());
    let full = vitals.pool(PoolKind::Mana).current();
    assert!(!vitals.spend(PoolKind::Mana, full + 1.0));
    assert_eq!(vitals.pool(PoolKind::Mana).current(), full);
    assert!(vitals.spend(PoolKind::Mana, 5.0));
    assert_eq!(vitals.pool(PoolKind::Mana).current(), full - 5.0);
}

#[test]
fn a_drain_takes_what_is_there() {
    let mut vitals = Vitals::new(tough());
    let full = vitals.pool(PoolKind::Energy).current();
    assert_eq!(vitals.drain(PoolKind::Energy, full + 10.0), full);
    assert!(vitals.pool(PoolKind::Energy).is_empty());
    assert_eq!(vitals.pool(PoolKind::Energy).fraction(), 0.0);
}

#[test]
fn regen_fills_towards_the_ceiling_and_stops_there() {
    let mut vitals = Vitals::new(tough());
    vitals.drain(PoolKind::Energy, 1000.0);
    for _ in 0..10 {
        vitals.tick(1.0);
    }
    let energy = vitals.pool(PoolKind::Energy);
    assert_eq!(energy.current(), energy.max());
}

#[test]
fn a_downed_character_does_not_quietly_heal_back_up() {
    let mut vitals = Vitals::new(tough());
    assert_eq!(vitals.damage(1000.0), Some(VitalEvent::Downed));
    assert!(vitals.is_down());
    for _ in 0..100 {
        assert_eq!(vitals.tick(1.0), None);
    }
    assert!(vitals.pool(PoolKind::Health).is_empty());
    assert!(vitals.is_down());
}

#[test]
fn getting_up_is_somebody_elses_decision() {
    let mut vitals = Vitals::new(tough());
    vitals.damage(1000.0);
    assert_eq!(vitals.revive(0.5), Some(VitalEvent::Revived));
    assert!(!vitals.is_down());
    assert_eq!(
        vitals.pool(PoolKind::Health).current(),
        vitals.pool(PoolKind::Health).max() * 0.5
    );
    assert_eq!(vitals.revive(0.5), None, "reviving twice is not an event");
}

#[test]
fn a_body_that_grows_tougher_is_not_also_suddenly_hurt() {
    let mut vitals = Vitals::new(tough());
    vitals.damage(20.0);
    let before = vitals.pool(PoolKind::Health).current();
    let ceiling = vitals.pool(PoolKind::Health).max();
    vitals.award(10_000);
    assert_eq!(
        vitals.invest(Attribute::Strength),
        Some(VitalEvent::Invested(Attribute::Strength))
    );
    let after = vitals.pool(PoolKind::Health);
    assert_eq!(after.max(), ceiling + HEALTH_PER_STRENGTH);
    assert_eq!(after.current(), before + HEALTH_PER_STRENGTH);
}

#[test]
fn an_investment_that_cannot_be_afforded_is_refused_rather_than_owed() {
    let mut vitals = Vitals::new(tough());
    let cost = vitals.attributes.next_cost(Attribute::Will);
    vitals.award(cost - 1);
    assert_eq!(vitals.invest(Attribute::Will), None);
    assert_eq!(vitals.experience(), cost - 1);
    assert_eq!(vitals.attributes.will, tough().will);

    vitals.award(1);
    assert!(vitals.invest(Attribute::Will).is_some());
    assert_eq!(vitals.experience(), 0);
    assert_eq!(vitals.attributes.will, tough().will + 1);
}

#[test]
fn each_rank_costs_more_than_the_one_under_it() {
    let mut vitals = Vitals::new(Attributes::new(1, 1, 1));
    let first = vitals.attributes.next_cost(Attribute::Skill);
    vitals.award(100_000);
    vitals.invest(Attribute::Skill);
    assert!(vitals.attributes.next_cost(Attribute::Skill) > first);
}

#[test]
fn a_command_naming_nobody_is_dropped_rather_than_spawning_them() {
    let mut world = World::new();
    world.apply(Command::Damage {
        id: 7,
        amount: 10.0,
    });
    assert!(world.is_empty());
}

#[test]
fn the_world_reports_what_happened_exactly_once() {
    let mut world = World::new();
    world.apply(Command::Spawn {
        id: 1,
        attributes: tough(),
    });
    world.apply(Command::Damage {
        id: 1,
        amount: 10_000.0,
    });
    world.step(1.0 / TICK_HZ as f32);

    let first = world.snapshot();
    assert_eq!(first.events, vec![(1, VitalEvent::Downed)]);
    assert!(first.row(1).expect("the character is in the world").down);

    world.step(1.0 / TICK_HZ as f32);
    assert!(
        world.snapshot().events.is_empty(),
        "the same news arrived twice"
    );
}

#[test]
fn a_snapshot_carries_the_whole_world_in_a_settled_order() {
    let mut world = World::new();
    for id in [9, 3, 5] {
        world.apply(Command::Spawn {
            id,
            attributes: tough(),
        });
    }
    world.step(0.05);
    let ids: Vec<_> = world.snapshot().rows.iter().map(|row| row.id).collect();
    assert_eq!(ids, vec![3, 5, 9]);
}

#[test]
fn the_thread_steps_the_world_and_answers_with_it() {
    let sim = Sim::spawn(TICK_HZ);
    sim.send(Command::Spawn {
        id: 42,
        attributes: tough(),
    });
    sim.send(Command::Drain {
        id: 42,
        pool: PoolKind::Energy,
        amount: 20.0,
    });

    // Polled until both commands have landed rather than reading the first snapshot with
    // the character in it. The two were sent from this thread at slightly different
    // instants, so the tick that picks up the spawn need not be the one that picks up the
    // drain -- order is kept, but a pair sent together is not atomic across a tick.
    let mut seen = None;
    for _ in 0..400 {
        if let Some(row) = sim.latest().as_ref().and_then(|s| s.row(42)).copied() {
            seen = Some(row);
            if row.energy < row.energy_max {
                break;
            }
        }
        std::thread::sleep(std::time::Duration::from_millis(5));
    }

    let row = seen.expect("the sim never reported the character it was told to spawn");
    assert!(row.energy < row.energy_max, "the drain never landed");
    assert_eq!(row.health, row.health_max);
}
