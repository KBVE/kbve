use super::*;

fn sense_at(position: Vec2) -> Sense {
    Sense {
        position,
        facing: [0.0, 1.0],
        travelled: 1.0,
        neighbours: Vec::new(),
        leader: None,
        leader_facing: [0.0, 1.0],
        leader_speed: 0.0,
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
    let mut config = Config::default();
    config.give_up_time = 2.0;
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
        travelled: 0.0,
        neighbours: Vec::new(),
        leader: Some([0.0, 0.0]),
        leader_facing: [0.0, 1.0],
        leader_speed: 0.0,
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
        travelled: 0.0,
        neighbours: Vec::new(),
        leader: Some([0.0, 0.0]),
        leader_facing: [0.0, 1.0],
        leader_speed: 0.0,
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
        travelled: 0.0,
        neighbours: Vec::new(),
        leader: Some([0.0, 0.0]),
        leader_facing: [0.0, 1.0],
        leader_speed: 0.0,
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
        neighbours: vec![[2.0, 0.0]],
        leader: None,
        leader_facing: [0.0, 1.0],
        leader_speed: 0.0,
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
