use combat::ability::Payload;
use combat::{
    Ability, Aim, Denial, Effect, EffectKind, Health, Millis, Modifiers, Outcome, Readiness,
    Resource, Rng, Shape, Stats, Timer, combine, resolve, usable,
};

fn attacker() -> Stats {
    Stats {
        power: 10,
        accuracy: 1000,
        crit_chance: 0,
        ..Stats::default()
    }
}

fn defender() -> Stats {
    Stats {
        armor: 0,
        evasion: 0,
        ..Stats::default()
    }
}

#[test]
fn same_seed_reaches_the_same_verdict() {
    let ability = Ability::attack(25, 200);
    let attacker = Stats {
        crit_chance: 400,
        accuracy: 700,
        ..attacker()
    };

    let roll = |seed| {
        let mut rng = Rng::new(seed, 0);
        (0..64)
            .map(|_| {
                resolve(
                    &ability,
                    &attacker,
                    &defender(),
                    Modifiers::default(),
                    &mut rng,
                )
            })
            .collect::<Vec<_>>()
    };

    assert_eq!(roll(99), roll(99));
    assert_ne!(roll(99), roll(100));
}

#[test]
fn armor_reduces_damage_but_never_below_the_floor() {
    let ability = Ability::attack(20, 200);
    let mut rng = Rng::new(1, 0);

    let light = resolve(
        &ability,
        &attacker(),
        &Stats {
            armor: 10,
            ..defender()
        },
        Modifiers::default(),
        &mut rng,
    );
    assert_eq!(light.damage(), 20);

    // Armour far beyond the damage still leaves a connected hit doing
    // something, or enough of it makes a character unkillable.
    let heavy = resolve(
        &ability,
        &attacker(),
        &Stats {
            armor: 9_000,
            ..defender()
        },
        Modifiers::default(),
        &mut rng,
    );
    assert_eq!(heavy.damage(), 1);
}

#[test]
fn a_crit_multiplies_before_armor() {
    let ability = Ability::attack(20, 200);
    let attacker = Stats {
        crit_chance: 1000,
        crit_multiplier: 2000,
        ..attacker()
    };
    let mut rng = Rng::new(3, 0);

    let outcome = resolve(
        &ability,
        &attacker,
        &Stats {
            armor: 10,
            ..defender()
        },
        Modifiers::default(),
        &mut rng,
    );

    // (20 + 10) doubled, then 10 armour. Applying armour first would give 40.
    assert_eq!(
        outcome,
        Outcome::Hit {
            damage: 50,
            crit: true,
            absorbed: 0,
        }
    );
}

#[test]
fn evasion_can_never_make_a_character_untouchable() {
    let ability = Ability::attack(10, 200);
    let untouchable = Stats {
        evasion: u16::MAX,
        ..defender()
    };
    let mut rng = Rng::new(11, 0);

    let hits = (0..4000)
        .filter(|_| {
            !resolve(
                &ability,
                &attacker(),
                &untouchable,
                Modifiers::default(),
                &mut rng,
            )
            .is_miss()
        })
        .count();

    // Floored at 5%, so a few hundred of four thousand should land.
    assert!(hits > 100, "expected the 5% floor to land hits, got {hits}");
    assert!(hits < 400, "floor should stay near 5%, got {hits}");
}

#[test]
fn a_shield_absorbs_and_reports_what_it_swallowed() {
    let ability = Ability::attack(30, 200);
    let mut rng = Rng::new(5, 0);

    let outcome = resolve(
        &ability,
        &attacker(),
        &defender(),
        Modifiers {
            absorb: 25,
            ..Modifiers::default()
        },
        &mut rng,
    );

    assert_eq!(
        outcome,
        Outcome::Hit {
            damage: 15,
            crit: false,
            absorbed: 25,
        }
    );
}

#[test]
fn stacked_reductions_multiply_rather_than_reaching_zero() {
    let shields = [Effect::new(EffectKind::Shielded, 5, Millis(1000)); 4];
    let combined = combine(Modifiers::default(), shields);

    assert!(
        combined.taken > 0,
        "no amount of stacking should reach immunity"
    );
    assert!(
        combined.taken < 1000,
        "stacked shields should still reduce damage, got {}",
        combined.taken
    );
}

#[test]
fn a_dot_deals_the_same_damage_however_often_it_is_ticked() {
    let build = || Effect::new(EffectKind::Burning, 3, Millis(4000));

    let mut once_per_second = build();
    let coarse: i32 = (0..4).map(|_| once_per_second.tick(Millis(1000))).sum();

    let mut per_frame = build();
    let fine: i32 = (0..240).map(|_| per_frame.tick(Millis(16))).sum();

    // 4 per second, 3 stacks, 4 seconds. The fine ticks lose the last partial
    // frame (240 * 16ms is 3840ms), so allow that one step of slack.
    assert_eq!(coarse, 48);
    assert!(
        (coarse - fine).abs() <= 2,
        "tick rate changed the total: {coarse} vs {fine}"
    );
}

#[test]
fn an_effect_stops_dealing_damage_once_it_expires() {
    let mut poison = Effect::new(EffectKind::Poison, 1, Millis(1000));
    assert_eq!(poison.tick(Millis(1000)), 2);
    assert!(poison.is_expired());
    assert_eq!(poison.tick(Millis(1000)), 0);
}

#[test]
fn refreshing_keeps_the_longer_duration_and_adds_stacks() {
    let mut bleed = Effect::new(EffectKind::Bleed, 1, Millis(5000));
    bleed.refresh(2, Millis(1000));

    assert_eq!(bleed.stacks, 3);
    assert_eq!(bleed.remaining(), Millis(5000));
}

#[test]
fn a_shorter_cooldown_cannot_cut_a_longer_one_short() {
    let mut timer = Timer::new(Millis(5000));
    timer.start(Millis(500));
    assert_eq!(timer.remaining(), Millis(5000));
}

#[test]
fn a_timer_reports_completion_exactly_once() {
    let mut timer = Timer::new(Millis(100));
    assert!(!timer.tick(Millis(60)));
    assert!(timer.tick(Millis(60)));
    assert!(!timer.tick(Millis(60)));
}

#[test]
fn spending_is_all_or_nothing() {
    let mut mana = Resource::new(30);
    assert!(!mana.spend(50));
    assert_eq!(mana.current(), 30, "a failed cast must not drain the pool");
    assert!(mana.spend(30));
    assert_eq!(mana.current(), 0);
}

#[test]
fn health_reports_overkill() {
    let mut health = Health::new(50);
    assert_eq!(health.damage(80), 30);
    assert!(health.is_dead());
    assert_eq!(health.heal(10), 0, "the dead do not heal passively");
}

fn ready() -> Readiness {
    Readiness {
        cooldown: Timer::READY,
        global_cooldown: Timer::READY,
        resource: Resource::new(100),
        health: Health::new(100),
        stunned: false,
        casting: false,
    }
}

#[test]
fn a_cone_needs_no_target_but_a_targeted_ability_does() {
    let swing = Ability::swing(10, 250, 90);
    let bolt = Ability::attack(10, 3000);

    assert_eq!(usable(&swing, &ready(), Aim::NONE), Ok(()));
    assert_eq!(usable(&bolt, &ready(), Aim::NONE), Err(Denial::NoTarget));
    assert_eq!(usable(&bolt, &ready(), Aim::at(500)), Ok(()));
    assert_eq!(
        usable(&bolt, &ready(), Aim::at(9000)),
        Err(Denial::OutOfRange)
    );

    // A selected target whose distance nothing can measure -- a headless
    // simulation with no transforms -- is a target, not the absence of one.
    assert_eq!(usable(&bolt, &ready(), Aim::unmeasured()), Ok(()));
}

#[test]
fn denials_are_reported_in_the_order_a_player_should_hear_them() {
    let ability = Ability {
        cost: 500,
        ..Ability::attack(10, 200)
    };

    let stunned_and_broke = Readiness {
        stunned: true,
        ..ready()
    };
    assert_eq!(
        usable(&ability, &stunned_and_broke, Aim::at(100)),
        Err(Denial::Stunned)
    );

    let dead = Readiness {
        health: {
            let mut health = Health::new(10);
            health.damage(20);
            health
        },
        stunned: true,
        ..ready()
    };
    assert_eq!(usable(&ability, &dead, Aim::at(100)), Err(Denial::Dead));

    assert_eq!(
        usable(&ability, &ready(), Aim::at(100)),
        Err(Denial::NotEnoughResource)
    );
}

#[test]
fn an_off_global_ability_ignores_the_global_cooldown() {
    let state = Readiness {
        global_cooldown: Timer::new(Millis(1500)),
        ..ready()
    };

    let normal = Ability::attack(10, 200);
    assert_eq!(
        usable(&normal, &state, Aim::at(100)),
        Err(Denial::GlobalCooldown)
    );

    let instant = Ability {
        on_global_cooldown: false,
        ..normal
    };
    assert_eq!(usable(&instant, &state, Aim::at(100)), Ok(()));
}

#[test]
fn applying_an_effect_deals_no_damage_of_its_own() {
    let curse = Ability {
        payload: Payload::Apply {
            kind: EffectKind::Weakened,
            stacks: 2,
            duration: Millis(8000),
        },
        shape: Shape::Target,
        ..Ability::attack(0, 3000)
    };

    let mut rng = Rng::new(2, 0);
    let outcome = resolve(
        &curse,
        &attacker(),
        &defender(),
        Modifiers::default(),
        &mut rng,
    );

    assert_eq!(outcome, Outcome::Applied);
    assert_eq!(outcome.damage(), 0);
}
