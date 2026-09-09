#![cfg(feature = "bevy")]

use core::time::Duration;

use bevy::prelude::*;
use combat::plugin::{
    AbilityBar, ActiveEffects, CombatPlugin, CombatRng, Combatant, Dead, Died, UseAbility,
};
use combat::{Ability, Effect, EffectKind, Millis, Rng, Stats};

/// An app with a clock this test drives itself.
///
/// Deliberately without `TimePlugin`: it would set the delta from the wall
/// clock, and a test loop runs a frame in microseconds -- which rounds to zero
/// milliseconds, so no cooldown would ever tick and every one of these tests
/// would pass by never advancing anything.
fn app() -> App {
    let mut app = App::new();
    app.add_plugins(CombatPlugin);
    app.init_resource::<Time>();
    // A fixed seed, so a test about death is not also a test about luck.
    app.insert_resource(CombatRng(Rng::new(1, 0)));
    app
}

/// Runs one frame worth `step` of game time.
fn tick(app: &mut App, step: Millis) {
    app.world_mut()
        .resource_mut::<Time>()
        .advance_by(Duration::from_millis(step.0 as u64));
    app.update();
}

/// Takes the deaths announced since the last call.
///
/// Drained rather than read: bevy keeps two frames of messages, so reading
/// would report a death from the previous frame again and make a passing test
/// out of a double-announcement.
fn deaths(app: &mut App) -> Vec<Died> {
    app.world_mut()
        .resource_mut::<Messages<Died>>()
        .drain()
        .collect()
}

fn spawn(app: &mut App, health: i32, ability: Ability) -> Entity {
    app.world_mut()
        .spawn((
            Combatant::new(
                health,
                100,
                Stats {
                    accuracy: 1000,
                    crit_chance: 0,
                    ..Stats::default()
                },
            ),
            ActiveEffects::default(),
            AbilityBar::new([ability]),
        ))
        .id()
}

#[test]
fn an_ability_does_not_land_on_something_already_dead() {
    let mut app = app();
    let attacker = spawn(&mut app, 100, Ability::attack(500, 10_000));
    let victim = spawn(&mut app, 10, Ability::attack(1, 100));

    let request = UseAbility {
        caster: attacker,
        slot: 0,
        target: Some(victim),
    };

    app.world_mut().write_message(request);
    tick(&mut app, Millis(16));

    assert_eq!(deaths(&mut app).len(), 1, "the killing blow announces once");
    let at_death = app
        .world()
        .get::<Combatant>(victim)
        .unwrap()
        .health
        .current();
    assert!(at_death <= 0);

    // A second request, of the kind that is already in flight when something
    // else lands the killing blow.
    app.world_mut().write_message(request);
    tick(&mut app, Millis(16));

    assert!(deaths(&mut app).is_empty(), "a corpse does not die twice");
    assert_eq!(
        app.world()
            .get::<Combatant>(victim)
            .unwrap()
            .health
            .current(),
        at_death,
        "a corpse takes no further damage"
    );
}

#[test]
fn a_lethal_effect_announces_one_death_however_long_it_keeps_ticking() {
    let mut app = app();
    let victim = spawn(&mut app, 3, Ability::attack(1, 100));

    app.world_mut()
        .entity_mut(victim)
        .get_mut::<ActiveEffects>()
        .unwrap()
        .0
        .push(Effect::new(EffectKind::Burning, 5, Millis(10_000)));

    let mut announced = 0;
    for _ in 0..20 {
        tick(&mut app, Millis(250));
        announced += deaths(&mut app).len();
    }

    assert_eq!(announced, 1, "the effect kills once, not every tick");
    assert!(app.world().get::<Dead>(victim).is_some());
}

#[test]
fn a_cooldown_measured_in_game_time_expires_after_that_much_game_time() {
    let mut app = app();
    let caster = spawn(
        &mut app,
        100,
        Ability {
            cooldown: Millis(1000),
            ..Ability::attack(5, 10_000)
        },
    );
    let victim = spawn(&mut app, 10_000, Ability::attack(1, 100));

    let request = UseAbility {
        caster,
        slot: 0,
        target: Some(victim),
    };

    let health = |app: &App| {
        app.world()
            .get::<Combatant>(victim)
            .unwrap()
            .health
            .current()
    };

    app.world_mut().write_message(request);
    tick(&mut app, Millis(16));
    let after_first = health(&app);
    assert!(after_first < 10_000, "the first use lands");

    // Straight away again: refused, and nothing changes.
    app.world_mut().write_message(request);
    tick(&mut app, Millis(100));
    assert_eq!(health(&app), after_first, "still on cooldown");

    // Past the cooldown, and it lands again.
    tick(&mut app, Millis(1500));
    app.world_mut().write_message(request);
    tick(&mut app, Millis(16));
    assert!(health(&app) < after_first, "the cooldown expired");
}
