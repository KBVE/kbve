use super::*;

/// A neighbour the size the real mechs measure, 0.6 to 1.1 across the capsule.
fn near(position: Vec2, velocity: Vec2) -> Neighbour {
    Neighbour {
        position,
        velocity,
        radius: CREATURE_RADIUS,
    }
}

fn sense_at(position: Vec2) -> Sense {
    Sense {
        position,
        facing: [0.0, 1.0],
        velocity: [0.0, 0.0],
        travelled: 1.0,
        neighbours: Vec::new(),
        leader: None,
        leader_facing: [0.0, 1.0],
        leader_speed: 0.0,
        route: None,
        route_blocked: false,
    }
}

/// Walks the creature the way Godot would, but with a wall: `blocked` means
/// `move_and_slide` gave it nothing, which is exactly what the engine reports
/// when a body is pressed into a rock.
fn walk(
    patrol: &mut Patrol,
    sense: &mut Sense,
    ticks: u32,
    delta: f32,
    blocked: bool,
) -> Vec<Mode> {
    let mut modes = Vec::new();
    for _ in 0..ticks {
        let step = patrol.step(sense, delta);
        if !blocked {
            sense.position = add(sense.position, scale(step.wish, delta));
            sense.travelled = length(scale(step.wish, delta));
        } else {
            sense.travelled = 0.0;
        }
        if length(step.face) > 1e-3 {
            sense.facing = step.face;
        }
        modes.push(step.mode);
    }
    modes
}

#[test]
fn roams_toward_its_waypoint() {
    let mut patrol = Patrol::new([0.0, 0.0], 7, Config::default());
    let mut sense = sense_at([0.0, 0.0]);
    let target = patrol.target();
    let before = length(sub(target, sense.position));
    walk(&mut patrol, &mut sense, 30, 1.0 / 60.0, false);
    let after = length(sub(patrol.target(), sense.position));
    assert!(after < before, "got no closer: {before} -> {after}");
}

/// The reported bug: two creatures trading the same patch of ground move the
/// whole time and get nowhere, so the speed test never fires and they walk on
/// the spot for the rest of the session.
///
/// Driven directly rather than through `walk`, because the whole point is that
/// `travelled` stays high: a body oscillating at walking pace looks identical to
/// one making good progress if speed is all anybody measures.
#[test]
fn a_creature_going_back_and_forth_is_noticed_as_stuck() {
    let mut patrol = Patrol::new([0.0, 0.0], 11, Config::default());
    let mut sense = sense_at([0.0, 0.0]);
    let delta = 1.0 / 60.0;
    let swing = 0.35;
    let mut modes = Vec::new();
    for tick in 0..240 {
        let step = patrol.step(&sense, delta);
        // Back and forth across the same half metre, at a pace well over
        // `stuck_speed`, so only net displacement can tell this apart from walking.
        let side = if (tick / 30) % 2 == 0 { 1.0 } else { -1.0 };
        let before = sense.position;
        sense.position = [swing * side, 0.0];
        sense.travelled = length(sub(sense.position, before)).max(0.02);
        if length(step.face) > 1e-3 {
            sense.facing = step.face;
        }
        modes.push(step.mode);
    }
    assert!(
        modes.contains(&Mode::Unsticking),
        "never noticed it was going nowhere"
    );
}

/// The other half: a creature actually covering ground must never be shoved for
/// it, however slowly it is going.
#[test]
fn a_creature_making_headway_is_left_alone() {
    let mut patrol = Patrol::new([0.0, 0.0], 5, Config::default());
    let mut sense = sense_at([0.0, 0.0]);
    let delta = 1.0 / 60.0;
    let crawl = Config::default().stuck_speed * 1.5;
    let mut modes = Vec::new();
    for _ in 0..600 {
        let step = patrol.step(&sense, delta);
        let heading = normalize(step.face);
        sense.position = add(sense.position, scale(heading, crawl * delta));
        sense.travelled = crawl * delta;
        if length(step.face) > 1e-3 {
            sense.facing = step.face;
        }
        modes.push(step.mode);
    }
    assert!(
        !modes.contains(&Mode::Unsticking),
        "shoved a creature that was getting somewhere"
    );
}

/// The reported bug: a creature pressed into something must stop leaning on it.
#[test]
fn a_blocked_creature_stops_pushing_and_turns_away() {
    let mut patrol = Patrol::new([0.0, 0.0], 3, Config::default());
    let mut sense = sense_at([0.0, 0.0]);
    let heading = sense.facing;
    let modes = walk(&mut patrol, &mut sense, 120, 1.0 / 60.0, true);
    assert!(
        modes.contains(&Mode::Unsticking),
        "never noticed it was stuck"
    );
    let turned = normalize(sense.facing);
    let dot = turned[0] * heading[0] + turned[1] * heading[1];
    assert!(dot < 0.95, "kept facing the obstacle: dot {dot}");
}

#[test]
fn unsticking_commits_to_one_direction() {
    let mut patrol = Patrol::new([0.0, 0.0], 11, Config::default());
    let mut sense = sense_at([0.0, 0.0]);
    walk(&mut patrol, &mut sense, 60, 1.0 / 60.0, true);
    let mut seen: Vec<Vec2> = Vec::new();
    for _ in 0..30 {
        let step = patrol.step(&sense, 1.0 / 60.0);
        sense.travelled = 0.0;
        if step.mode == Mode::Unsticking {
            seen.push(step.face);
        }
    }
    if seen.len() > 1 {
        let first = seen[0];
        for face in &seen[1..] {
            let dot = first[0] * face[0] + first[1] * face[1];
            assert!(dot > 0.9, "sidestep flip-flopped: {first:?} vs {face:?}");
        }
    }
}

#[test]
fn a_creature_that_can_move_is_never_called_stuck() {
    let mut patrol = Patrol::new([0.0, 0.0], 5, Config::default());
    let mut sense = sense_at([0.0, 0.0]);
    let modes = walk(&mut patrol, &mut sense, 240, 1.0 / 60.0, false);
    assert!(
        !modes.contains(&Mode::Unsticking),
        "sidestepped while walking fine"
    );
}

#[test]
fn gives_up_on_a_waypoint_it_never_reaches() {
    let config = Config {
        give_up_time: 2.0,
        ..Default::default()
    };
    // Fast enough to never trip the stuck check, but pinned in place.
    let mut patrol = Patrol::new([0.0, 0.0], 9, config);
    let first = patrol.target();
    let mut sense = sense_at([0.0, 0.0]);
    for _ in 0..200 {
        patrol.step(&sense, 1.0 / 60.0);
        sense.travelled = 1.0;
    }
    assert_ne!(first, patrol.target(), "kept chasing the same waypoint");
}

/// The reported bug: Stan walking on top of the player.
#[test]
fn never_settles_inside_the_leader() {
    let config = Config::default();
    let mut patrol = Patrol::new([0.0, 0.0], 13, config);
    patrol.slot = 3;
    patrol.count = 4;
    let mut sense = Sense {
        position: [0.2, 0.1],
        facing: [0.0, 1.0],
        velocity: [0.0, 0.0],
        travelled: 0.0,
        neighbours: Vec::new(),
        leader: Some([0.0, 0.0]),
        leader_facing: [0.0, 1.0],
        leader_speed: 0.0,
        route: None,
        route_blocked: false,
    };
    let mut closest = f32::MAX;
    for i in 0..600 {
        let step = patrol.step(&sense, 1.0 / 60.0);
        sense.position = add(sense.position, scale(step.wish, 1.0 / 60.0));
        sense.travelled = length(scale(step.wish, 1.0 / 60.0));
        if i > 120 {
            closest = closest.min(length(sub(sense.position, [0.0, 0.0])));
        }
    }
    assert!(
        closest > config.personal_space * 0.6,
        "ended up on the player: closest {closest}"
    );
}

/// Starting exactly on top of the leader still has to produce a way out.
#[test]
fn pushes_out_of_an_exact_overlap() {
    let mut patrol = Patrol::new([0.0, 0.0], 17, Config::default());
    let sense = Sense {
        position: [0.0, 0.0],
        facing: [0.0, 1.0],
        velocity: [0.0, 0.0],
        travelled: 0.0,
        neighbours: Vec::new(),
        leader: Some([0.0, 0.0]),
        leader_facing: [0.0, 1.0],
        leader_speed: 0.0,
        route: None,
        route_blocked: false,
    };
    let step = patrol.step(&sense, 1.0 / 60.0);
    assert!(
        length(step.wish) > 0.1,
        "no way out of an overlap: {:?}",
        step.wish
    );
    assert!(step.wish[0].is_finite() && step.wish[1].is_finite());
}

#[test]
fn holds_station_behind_a_standing_leader() {
    let mut patrol = Patrol::new([0.0, 0.0], 19, Config::default());
    patrol.slot = 0;
    patrol.count = 1;
    let mut sense = Sense {
        position: [0.0, -7.0],
        facing: [0.0, 1.0],
        velocity: [0.0, 0.0],
        travelled: 0.0,
        neighbours: Vec::new(),
        leader: Some([0.0, 0.0]),
        leader_facing: [0.0, 1.0],
        leader_speed: 0.0,
        route: None,
        route_blocked: false,
    };
    let mut modes = Vec::new();
    for _ in 0..120 {
        let step = patrol.step(&sense, 1.0 / 60.0);
        sense.position = add(sense.position, scale(step.wish, 1.0 / 60.0));
        sense.travelled = length(scale(step.wish, 1.0 / 60.0));
        modes.push(step.mode);
    }
    assert!(modes.contains(&Mode::Holding), "never settled: {modes:?}");
}

#[test]
fn formation_slots_do_not_share_a_spot() {
    let config = Config::default();
    let mut seen: Vec<Vec2> = Vec::new();
    for slot in 0..4 {
        let mut patrol = Patrol::new([0.0, 0.0], 23, config);
        patrol.slot = slot;
        patrol.count = 4;
        let at = patrol.formation_slot([0.0, 0.0], [0.0, 1.0]);
        for other in &seen {
            assert!(
                length(sub(at, *other)) > 1.0,
                "slot {slot} lands on another: {at:?}"
            );
        }
        seen.push(at);
    }
}

#[test]
fn separation_pushes_apart_not_together() {
    let patrol = Patrol::new([0.0, 0.0], 29, Config::default());
    let sense = Sense {
        position: [0.0, 0.0],
        facing: [0.0, 1.0],
        travelled: 0.0,
        velocity: [0.0, 0.0],
        neighbours: vec![near([2.0, 0.0], [0.0, 0.0])],
        leader: None,
        leader_facing: [0.0, 1.0],
        leader_speed: 0.0,
        route: None,
        route_blocked: false,
    };
    let push = patrol.avoid(&sense);
    assert!(push[0] < 0.0, "pushed toward the neighbour: {push:?}");
}

#[test]
fn stepping_is_deterministic() {
    let build = || {
        let mut p = Patrol::new([0.0, 0.0], 31, Config::default());
        p.slot = 2;
        p.count = 4;
        p
    };
    let mut a = build();
    let mut b = build();
    let mut sa = sense_at([0.0, 0.0]);
    let mut sb = sense_at([0.0, 0.0]);
    walk(&mut a, &mut sa, 300, 1.0 / 60.0, false);
    walk(&mut b, &mut sb, 300, 1.0 / 60.0, false);
    assert_eq!(sa.position[0].to_bits(), sb.position[0].to_bits());
    assert_eq!(sa.position[1].to_bits(), sb.position[1].to_bits());
}

/// Spawn index is the seed, so adjacent seeds must not wander as one.
#[test]
fn different_seeds_wander_differently() {
    let mut a = Patrol::new([0.0, 0.0], 0, Config::default());
    let mut b = Patrol::new([0.0, 0.0], 1, Config::default());
    let mut sa = sense_at([0.0, 0.0]);
    let mut sb = sense_at([0.0, 0.0]);
    walk(&mut a, &mut sa, 300, 1.0 / 60.0, false);
    walk(&mut b, &mut sb, 300, 1.0 / 60.0, false);
    assert!(length(sub(sa.position, sb.position)) > 0.5, "moved as one");
}

/// A routed creature walks the way the field says, not the way the target is.
#[test]
fn a_route_overrides_the_straight_line() {
    let mut patrol = Patrol::new([0.0, 0.0], 43, Config::default());
    let mut sense = sense_at([0.0, 0.0]);
    // Target is somewhere ahead; the field says go hard right instead.
    sense.route = Some([1.0, 0.0]);
    let step = patrol.step(&sense, 1.0 / 60.0);
    assert!(
        step.face[0] > 0.9,
        "ignored the route and went its own way: {:?}",
        step.face
    );
}

#[test]
fn without_a_route_it_still_steers_at_the_target() {
    let mut patrol = Patrol::new([0.0, 0.0], 43, Config::default());
    let sense = sense_at([0.0, 0.0]);
    let to = normalize(sub(patrol.target(), sense.position));
    let step = patrol.step(&sense, 1.0 / 60.0);
    let dot = step.face[0] * to[0] + step.face[1] * to[1];
    assert!(dot > 0.9, "did not aim at its waypoint: {dot}");
}

/// Drives two creatures at once, each seeing the other, and reports the closest
/// they ever came. This is the shape of the reported bug: they arrive at the
/// same spot at the same time and the engine resolves it by shoving.
fn pair(a_from: Vec2, a_to: Vec2, b_from: Vec2, b_to: Vec2, ticks: u32) -> (f32, Vec2, Vec2) {
    let delta = 1.0 / 60.0;
    let config = Config {
        radius: 1.0,
        ..Default::default()
    };
    let build = |home: Vec2, target: Vec2, seed: u32| {
        let mut p = Patrol::new(home, seed, config);
        p.target = target;
        p
    };
    let mut a = build(a_from, a_to, 101);
    let mut b = build(b_from, b_to, 202);
    let mut sa = Sense {
        position: a_from,
        facing: normalize(sub(a_to, a_from)),
        velocity: [0.0, 0.0],
        travelled: 1.0,
        neighbours: Vec::new(),
        leader: None,
        leader_facing: [0.0, 1.0],
        leader_speed: 0.0,
        route: None,
        route_blocked: false,
    };
    let mut sb = Sense {
        position: b_from,
        facing: normalize(sub(b_to, b_from)),
        ..sa.clone()
    };
    sb.position = b_from;
    let mut closest = f32::MAX;
    for _ in 0..ticks {
        sa.neighbours = vec![near(sb.position, sb.velocity)];
        sb.neighbours = vec![near(sa.position, sa.velocity)];
        let step_a = a.step(&sa, delta);
        let step_b = b.step(&sb, delta);
        for (sense, step) in [(&mut sa, step_a), (&mut sb, step_b)] {
            sense.velocity = step.wish;
            sense.position = add(sense.position, scale(step.wish, delta));
            sense.travelled = length(scale(step.wish, delta));
            if length(step.face) > 1e-3 {
                sense.facing = step.face;
            }
        }
        closest = closest.min(length(sub(sa.position, sb.position)));
    }
    (closest, sa.position, sb.position)
}

/// The reported bug: two creatures walking into each other.
#[test]
fn a_head_on_pair_passes_rather_than_collides() {
    let (closest, a, b) = pair([-20.0, 0.0], [20.0, 0.0], [20.0, 0.0], [-20.0, 0.0], 900);
    assert!(closest > 2.0, "walked into each other: closest {closest}");
    assert!(a[0] > 0.0 && b[0] < 0.0, "never got past: {a:?} {b:?}");
}

/// Head-on is also where a purely positional push deadlocks: both are shoved
/// straight backwards, so neither ever steps aside.
#[test]
fn a_head_on_pair_does_not_deadlock() {
    let (_, a, b) = pair([-14.0, 0.0], [14.0, 0.0], [14.0, 0.0], [-14.0, 0.0], 600);
    assert!(length(sub(a, b)) > 8.0, "stalled nose to nose: {a:?} {b:?}");
}

#[test]
fn crossing_paths_do_not_meet_in_the_middle() {
    let (closest, ..) = pair([-20.0, 0.0], [20.0, 0.0], [0.0, -20.0], [0.0, 20.0], 900);
    assert!(closest > 2.0, "met at the crossing: closest {closest}");
}

/// Avoidance must not become propulsion: a body wedged in a crowd is pushed
/// out, not fired out.
#[test]
fn a_crowd_cannot_shove_faster_than_a_run() {
    let config = Config::default();
    let patrol = Patrol::new([0.0, 0.0], 37, config);
    let mut sense = sense_at([0.0, 0.0]);
    sense.neighbours = (0..8)
        .map(|i| {
            let angle = i as f32 * std::f32::consts::TAU / 8.0;
            near([angle.cos() * 0.6, angle.sin() * 0.6], [0.0, 0.0])
        })
        .collect();
    sense.leader = Some([0.1, 0.0]);
    let push = patrol.avoid(&sense);
    assert!(
        length(push) <= config.max_speed + 1e-3,
        "shoved at {} against a top speed of {}",
        length(push),
        config.max_speed
    );
}

/// Contact avoidance has to beat a sprint, which is exactly what the linear
/// falloff it replaced did not do.
#[test]
fn touching_pushes_harder_than_the_creature_can_run() {
    let config = Config::default();
    let patrol = Patrol::new([0.0, 0.0], 41, config);
    let mut sense = sense_at([0.0, 0.0]);
    sense.neighbours = vec![near([1.4, 0.0], [0.0, 0.0])];
    let push = patrol.avoid(&sense);
    assert!(push[0] < 0.0, "pushed the wrong way: {push:?}");
    assert!(
        length(push) > config.speed,
        "a touch pushed {} against a walk of {}",
        length(push),
        config.speed
    );
}

/// Somebody walking away is not a collision, and treating them as one makes a
/// column of followers refuse to close up.
#[test]
fn a_neighbour_walking_away_is_not_dodged() {
    let patrol = Patrol::new([0.0, 0.0], 43, Config::default());
    let mut sense = sense_at([0.0, 0.0]);
    sense.velocity = [2.6, 0.0];
    sense.neighbours = vec![near([7.0, 0.0], [2.6, 0.0])];
    let push = patrol.avoid(&sense);
    let gentle = Patrol::new([0.0, 0.0], 43, Config::default()).crowd([-1.0, 0.0], 7.0);
    assert!(
        (length(push) - length(gentle)).abs() < 1e-4,
        "swerved round somebody it was never going to meet: {push:?}"
    );
}

#[test]
fn avoidance_is_deterministic() {
    let run = || pair([-20.0, 0.0], [20.0, 0.0], [18.0, 3.0], [-20.0, 1.0], 700);
    let (ca, aa, ba) = run();
    let (cb, ab, bb) = run();
    assert_eq!(ca.to_bits(), cb.to_bits());
    assert_eq!(aa[0].to_bits(), ab[0].to_bits());
    assert_eq!(ba[1].to_bits(), bb[1].to_bits());
}

/// Four creatures following a leader that walks out and then turns round and
/// comes back through them.
///
/// The turn is the point. Formation slots are behind the leader, so reversing
/// puts every slot on the far side of the group and all four have to cross each
/// other to reach them. Walking in a straight line never makes them meet, which
/// is why a straight-line test passes with no avoidance at all.
/// Silhouette radius the creature spawner now hands the solver, rather than the
/// capsule-sized 1.0 it used to.
const CREATURE_RADIUS: f32 = 3.2;

fn column(ticks: u32) -> (f32, u32) {
    let delta = 1.0 / 60.0;
    let count = 4;
    let mut patrols: Vec<Patrol> = (0..count)
        .map(|i| {
            let mut p = Patrol::new(
                [0.0, 0.0],
                i as u32,
                Config {
                    radius: CREATURE_RADIUS,
                    ..Config::default()
                },
            );
            p.slot = i;
            p.count = count;
            p
        })
        .collect();
    // Started stacked, so avoidance is what has to spread them out.
    let mut senses: Vec<Sense> = (0..count)
        .map(|i| Sense {
            position: [i as f32 * 0.5, -2.0],
            facing: [0.0, 1.0],
            velocity: [0.0, 0.0],
            travelled: 0.0,
            neighbours: Vec::new(),
            leader: Some([0.0, 0.0]),
            leader_facing: [0.0, 1.0],
            leader_speed: 3.0,
            route: None,
            route_blocked: false,
        })
        .collect();
    let mut leader = [0.0f32, 0.0];
    let mut closest = f32::MAX;
    let mut contacts = 0u32;
    let turn = ticks / 2;
    for tick in 0..ticks {
        let heading = if tick < turn { 1.0 } else { -1.0 };
        leader[1] += 3.0 * delta * heading;
        let snapshot: Vec<(Vec2, Vec2)> = senses.iter().map(|s| (s.position, s.velocity)).collect();
        for (i, sense) in senses.iter_mut().enumerate() {
            sense.leader = Some(leader);
            sense.leader_facing = [0.0, heading];
            sense.neighbours = snapshot
                .iter()
                .enumerate()
                .filter(|(j, _)| *j != i)
                .map(|(_, (p, v))| near(*p, *v))
                .collect();
        }
        for i in 0..count as usize {
            let step = patrols[i].step(&senses[i], delta);
            senses[i].velocity = step.wish;
            senses[i].position = add(senses[i].position, scale(step.wish, delta));
            senses[i].travelled = length(scale(step.wish, delta));
            if length(step.face) > 1e-3 {
                senses[i].facing = step.face;
            }
        }
        // The first second is the pile they started in unpicking itself.
        if tick < 60 {
            continue;
        }
        for i in 0..count as usize {
            for j in i + 1..count as usize {
                let gap = length(sub(senses[i].position, senses[j].position));
                closest = closest.min(gap);
                if gap < CREATURE_RADIUS {
                    contacts += 1;
                }
            }
        }
    }
    (closest, contacts)
}

/// The reported bug at the scale it actually happens: a group of followers.
#[test]
fn a_following_group_does_not_walk_through_itself() {
    let (closest, contacts) = column(1200);
    assert!(
        contacts == 0,
        "creatures overlapped on {contacts} ticks, closest {closest}"
    );
}

/// Spread out is not the same as settled. A group that never stops shuffling
/// reads as broken even when nothing overlaps.
#[test]
fn a_following_group_settles_instead_of_shuffling() {
    let (early, _) = column(400);
    let (late, _) = column(1600);
    assert!(
        late >= early - 0.5,
        "kept jostling: closest was {early} early and {late} late"
    );
}

/// The reported bug: with a flow field in play the whole group drove at the
/// leader, because the field is integrated to the leader and not to each
/// creature's own slot. Four creatures on one point is a pile, and a pile of
/// capsules climbs -- which is what walking in the air looks like.
#[test]
fn a_route_does_not_collapse_the_formation_onto_the_leader() {
    let delta = 1.0 / 60.0;
    let count = 4;
    let leader = [0.0f32, 0.0];
    let mut patrols: Vec<Patrol> = (0..count)
        .map(|i| {
            let mut p = Patrol::new(leader, i as u32, Config::default());
            p.slot = i;
            p.count = count;
            p
        })
        .collect();
    let mut senses: Vec<Sense> = (0..count)
        .map(|i| Sense {
            position: [i as f32 * 0.5, -30.0],
            facing: [0.0, 1.0],
            velocity: [0.0, 0.0],
            travelled: 0.0,
            neighbours: Vec::new(),
            leader: Some(leader),
            leader_facing: [0.0, 1.0],
            leader_speed: 1.0,
            // A field pointing flat at the leader the whole way in, which is
            // exactly what the real one hands back.
            route: Some([0.0, 1.0]),
            route_blocked: false,
        })
        .collect();
    for _ in 0..1800 {
        let snapshot: Vec<(Vec2, Vec2)> = senses.iter().map(|s| (s.position, s.velocity)).collect();
        for i in 0..count as usize {
            senses[i].route = Some(normalize(sub(leader, senses[i].position)));
            senses[i].neighbours = snapshot
                .iter()
                .enumerate()
                .filter(|(j, _)| *j != i)
                .map(|(_, (p, v))| near(*p, *v))
                .collect();
            let step = patrols[i].step(&senses[i], delta);
            senses[i].velocity = step.wish;
            senses[i].position = add(senses[i].position, scale(step.wish, delta));
            senses[i].travelled = length(scale(step.wish, delta));
        }
    }
    // Separated is not the test -- avoidance alone achieves that, by shoving.
    // Each one has to end up at its own slot, which is what a formation is.
    for i in 0..count as usize {
        let slot = patrols[i].formation_slot(leader, [0.0, 1.0]);
        let off = length(sub(senses[i].position, slot));
        assert!(
            off < 5.0,
            "creature {i} ended {off} from its slot at {slot:?}, at {:?}",
            senses[i].position
        );
    }
}

/// The other half of the bridge report: told there is no way through, a
/// creature waits at the distance it reached instead of leaning on the bank.
#[test]
fn an_unreachable_leader_is_waited_for_not_walked_at() {
    let mut patrol = Patrol::new([0.0, 0.0], 53, Config::default());
    patrol.slot = 0;
    patrol.count = 1;
    let mut sense = sense_at([0.0, -20.0]);
    sense.leader = Some([0.0, 20.0]);
    sense.leader_speed = 2.0;
    sense.route = None;
    sense.route_blocked = true;
    let start = sense.position;
    let mut modes = Vec::new();
    for _ in 0..300 {
        let step = patrol.step(&sense, 1.0 / 60.0);
        sense.velocity = step.wish;
        sense.position = add(sense.position, scale(step.wish, 1.0 / 60.0));
        sense.travelled = length(scale(step.wish, 1.0 / 60.0));
        modes.push(step.mode);
    }
    assert!(
        modes.contains(&Mode::Waiting),
        "kept pressing on: {modes:?}"
    );
    assert!(
        length(sub(sense.position, start)) < 1.0,
        "walked at an unreachable leader: {:?}",
        sense.position
    );
}

/// A blocked route must not freeze a creature that is being crowded, or a group
/// waiting at a riverbank piles into itself.
#[test]
fn waiting_still_makes_room_for_the_others() {
    let mut patrol = Patrol::new([0.0, 0.0], 59, Config::default());
    let mut sense = sense_at([0.0, 0.0]);
    sense.leader = Some([0.0, 40.0]);
    sense.route_blocked = true;
    sense.neighbours = vec![near([1.2, 0.0], [0.0, 0.0])];
    let step = patrol.step(&sense, 1.0 / 60.0).wish;
    assert!(step[0] < 0.0, "waited on top of a neighbour: {step:?}");
}

/// The close band takes over from the gentle one, so it must not hand back less
/// than the band it replaced.
///
/// `overlap` is nearly zero at the contact boundary while `crowd`, measured
/// against the far wider `separation`, is still pushing hard. Without the floor a
/// body crossing into contact is shoved *less* rather than more, and settles just
/// inside it -- and the wider the bodies, the wider that dead band gets.
#[test]
fn crossing_into_contact_never_pushes_less() {
    let config = Config {
        radius: 3.2,
        pass_margin: 0.8,
        separation: 9.0,
        separation_strength: 1.6,
        ..Default::default()
    };
    let patrol = Patrol::new([0.0, 0.0], 1, config);

    let contact = config.radius + config.radius + config.pass_margin;
    let mut sense = Sense {
        facing: [1.0, 0.0],
        ..Default::default()
    };

    // Stepped in across the boundary: the push must never fall as they close.
    let mut previous = 0.0;
    let mut distance = contact + 2.0;
    while distance > 0.5 {
        sense.position = [0.0, 0.0];
        let other = Neighbour {
            position: [distance, 0.0],
            velocity: [0.0, 0.0],
            radius: config.radius,
        };
        sense.neighbours = vec![other];
        let push = length(patrol.avoid(&sense));
        assert!(
            push >= previous - 1e-4,
            "push dropped from {previous} to {push} at {distance}, inside contact {contact}"
        );
        previous = push;
        distance -= 0.1;
    }
}

/// The whole point of moving the gate inside: `wish` is travel plus avoidance
/// summed, so scaling it whole -- which is what the GDScript did -- damps the shove
/// as hard as the stride. A group following a leader who turns all turn at once, so
/// they all lose most of their separation on the same frame, which is the frame they
/// are converging on new slots.
#[test]
fn turning_does_not_damp_avoidance() {
    let cfg = Config::default();
    let mut apart = Patrol::new([0.0, 0.0], 1, cfg);
    apart.slot = 0;
    apart.count = 2;

    // Pointed hard away from where it wants to go, with somebody right on top of it.
    let mut sense = sense_at([0.0, 0.0]);
    sense.facing = [0.0, -1.0];
    sense.leader = Some([0.0, 20.0]);
    sense.leader_speed = 2.0;
    sense.neighbours = vec![near([0.4, 0.0], [0.0, 0.0])];
    let turning = apart.step(&sense, 1.0 / 60.0);

    let mut aligned = Patrol::new([0.0, 0.0], 1, cfg);
    aligned.slot = 0;
    aligned.count = 2;
    let mut facing_it = sense.clone();
    facing_it.facing = [0.0, 1.0];
    let straight = aligned.step(&facing_it, 1.0 / 60.0);

    // The push away from the neighbour is on -X. Turning must not weaken it.
    assert!(
        turning.wish[0] <= straight.wish[0] + 1e-3,
        "turning weakened the shove: {} against {}",
        turning.wish[0],
        straight.wish[0]
    );
}

/// The gate still has to do its job, or a machine slides sideways through its turn.
#[test]
fn turning_slows_travel() {
    let cfg = Config::default();
    let mut patrol = Patrol::new([0.0, 0.0], 1, cfg);
    patrol.slot = 0;
    patrol.count = 1;
    let mut sense = sense_at([0.0, 0.0]);
    sense.leader = Some([0.0, 30.0]);
    sense.leader_speed = 2.0;

    sense.facing = [0.0, 1.0];
    let ahead = patrol.step(&sense, 1.0 / 60.0).wish[1];
    sense.facing = [0.0, -1.0];
    let behind = patrol.step(&sense, 1.0 / 60.0).wish[1];

    assert!(
        behind < ahead * 0.6,
        "a body pointed backwards travelled {behind}, barely under the {ahead} it makes facing forward"
    );
}

/// Never to zero. A body that cannot move until it has finished turning can be held
/// in place by anything it happens to be pointed away from.
#[test]
fn a_body_pointed_backwards_still_moves() {
    let cfg = Config::default();
    let mut patrol = Patrol::new([0.0, 0.0], 1, cfg);
    patrol.slot = 0;
    patrol.count = 1;
    let mut sense = sense_at([0.0, 0.0]);
    sense.leader = Some([0.0, 30.0]);
    sense.leader_speed = 2.0;
    sense.facing = [0.0, -1.0];
    let step = patrol.step(&sense, 1.0 / 60.0);
    assert!(
        step.wish[1] > 0.0,
        "a backwards-facing body was gated to a standstill: {:?}",
        step.wish
    );
}

/// Unsticking is exempt, the same as it was in GDScript: a creature that has given up
/// on going straight has to move regardless of where it is pointed, or it turns away
/// from the obstacle while still leaning on it.
#[test]
fn unsticking_is_not_gated() {
    let cfg = Config::default();
    let mut patrol = Patrol::new([0.0, 0.0], 1, cfg);
    patrol.slot = 0;
    patrol.count = 1;
    let mut sense = sense_at([0.0, 0.0]);
    sense.leader = Some([0.0, 30.0]);
    sense.leader_speed = 2.0;
    sense.travelled = 0.0;
    for _ in 0..200 {
        let step = patrol.step(&sense, 1.0 / 60.0);
        if step.mode == Mode::Unsticking {
            sense.facing = scale(normalize(step.face), -1.0);
            let again = patrol.step(&sense, 1.0 / 60.0);
            assert_eq!(again.mode, Mode::Unsticking);
            assert!(
                length(again.wish) >= cfg.speed * 0.99,
                "unsticking was gated down to {}",
                length(again.wish)
            );
            return;
        }
    }
    panic!("never reached unsticking");
}
