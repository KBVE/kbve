use super::*;
use crate::worldgen::HeightParams;

fn hgen() -> HeightGen {
    HeightGen::new(&HeightParams::default())
}

fn seed() -> u32 {
    hgen().seed()
}

/// The property everything else rests on. A landmark is a place in the world, not a
/// place in the window that happened to be baked -- walk away and back and it has to
/// be the same building on the same ground.
#[test]
fn a_landmark_does_not_move_with_the_window() {
    let g = hgen();
    let home = in_window(seed(), &g, [0.0, 0.0], 512.0);
    assert!(!home.is_empty(), "nothing was placed near the origin");

    for origin in [[256.0f32, 0.0], [-128.0, 320.0], [64.0, -448.0]] {
        let away = in_window(seed(), &g, origin, 512.0);
        for mark in &home {
            let Some(same) = away
                .iter()
                .find(|m| m.kind == mark.kind && m.cell == mark.cell)
            else {
                continue;
            };
            assert_eq!(
                same.centre[0].to_bits(),
                mark.centre[0].to_bits(),
                "{:?} in cell {:?} moved for window {origin:?}",
                mark.kind,
                mark.cell
            );
            assert_eq!(same.centre[1].to_bits(), mark.centre[1].to_bits());
            assert_eq!(same.pad_y.to_bits(), mark.pad_y.to_bits());
        }
    }
}

/// Two machines simulating the same world derive the same buildings from the seed
/// alone, which is the whole reason none of this is sent over the wire.
#[test]
fn the_same_seed_builds_the_same_place() {
    let g = hgen();
    let a = in_window(seed(), &g, [1000.0, -2000.0], 400.0);
    let b = in_window(seed(), &g, [1000.0, -2000.0], 400.0);
    assert_eq!(a, b);
    for mark in &a {
        assert_eq!(mark.slabs(&g), mark.slabs(&g));
    }
}

/// A different seed has to be a different world, or the levelling is decoration.
#[test]
fn another_seed_builds_somewhere_else() {
    let g = hgen();
    let mine = in_window(seed(), &g, [0.0, 0.0], 1500.0);
    let theirs = in_window(seed() ^ 0x5eed, &g, [0.0, 0.0], 1500.0);
    assert_ne!(mine, theirs);
}

/// The lookup inside the height function reads one cell per kind. That is only sound
/// while a capital's levelled ground cannot leave the cell it was drawn in.
#[test]
fn a_capitals_pad_stays_inside_its_own_cell() {
    let g = hgen();
    let mut seen = 0;
    for cx in -4..=4 {
        for cz in -4..=4 {
            let Some(mark) = capital_in_cell(seed(), &g, cx, cz) else {
                continue;
            };
            seen += 1;
            let reach = WALL_HALF + 6.0 + PAD_FEATHER;
            let (lo_x, hi_x) = (cx as f32 * CELL, (cx + 1) as f32 * CELL);
            let (lo_z, hi_z) = (cz as f32 * CELL, (cz + 1) as f32 * CELL);
            assert!(
                mark.centre[0] - reach > lo_x && mark.centre[0] + reach < hi_x,
                "capital {:?} leaks out of cell x {cx}",
                mark.centre
            );
            assert!(
                mark.centre[1] - reach > lo_z && mark.centre[1] + reach < hi_z,
                "capital {:?} leaks out of cell z {cz}",
                mark.centre
            );
        }
    }
    assert!(
        seen > 10,
        "too few capitals to have tested anything: {seen}"
    );
}

/// Sitting outside the river's own column is not enough. The column beside it reaches
/// all the way to `x = 0` and the channel wanders most of the way out to meet it, so a
/// capital drawn carelessly stands in the water and dams it.
#[test]
fn a_capital_never_dams_the_river() {
    let g = hgen();
    let mut seen = 0;
    for cx in -5..=5 {
        for cz in -5..=5 {
            let Some(mark) = capital_in_cell(seed(), &g, cx, cz) else {
                continue;
            };
            seen += 1;
            for k in [-1.0f32, -0.5, 0.0, 0.5, 1.0] {
                let z = mark.centre[1] + k * (WALL_HALF + PAD_FEATHER);
                let mid = g.river_x(z);
                assert!(
                    g.height(mid, z) < g.water_level(),
                    "capital at {:?} raised the channel at z {z} to {}",
                    mark.centre,
                    g.height(mid, z)
                );
            }
        }
    }
    assert!(
        seen > 10,
        "too few capitals to have tested anything: {seen}"
    );
}

/// Somewhere to stand. A harbour whose floor is under the water is a harbour nobody
/// can walk on, and the quay is the one pad placed deliberately next to the river.
#[test]
fn a_harbour_stands_above_the_water() {
    let g = hgen();
    for cz in -6..=6 {
        let mark = harbour_in_row(seed(), &g, cz);
        assert!(
            mark.pad_y > g.water_level() + 1.0,
            "harbour in row {cz} has its floor at {} under water {}",
            mark.pad_y,
            g.water_level()
        );
    }
}

/// The levelling must stop short of the channel. A pad that reached the middle of the
/// river would fill it in, and the harbour would stand on a field.
#[test]
fn the_quay_does_not_fill_the_river_in() {
    let g = hgen();
    for cz in -4..=4 {
        let mark = harbour_in_row(seed(), &g, cz);
        let z = mark.centre[1];
        let mid = g.river_x(z);
        for k in [-1.0f32, -0.5, 0.0, 0.5, 1.0] {
            let x = mid + k * 4.0;
            assert!(
                g.height(x, z) < g.water_level(),
                "harbour in row {cz} raised the channel at {x} to {}",
                g.height(x, z)
            );
        }
    }
}

/// The point of levelling: what somebody standing in the courtyard walks on is flat.
#[test]
fn a_capitals_courtyard_is_flat() {
    let g = hgen();
    let mark = in_window(seed(), &g, [0.0, 0.0], 2000.0)
        .into_iter()
        .find(|m| m.kind == LandmarkKind::Capital)
        .expect("no capital within two cells of the origin");

    for dx in [-40.0f32, -20.0, 0.0, 20.0, 40.0] {
        for dz in [-40.0f32, -20.0, 0.0, 20.0, 40.0] {
            let h = g.height(mark.centre[0] + dx, mark.centre[1] + dz);
            assert!(
                (h - mark.pad_y).abs() < 0.01,
                "courtyard at {dx},{dz} is {h}, floor is {}",
                mark.pad_y
            );
        }
    }
}

/// Levelling is local. Ground nobody built on has to bake exactly as it did before
/// any of this existed, or every landmark quietly reshapes the whole world.
#[test]
fn open_country_is_the_ground_it_always_was() {
    let g = hgen();
    let mut checked = 0;
    for x in [-460.0f32, -170.0, 210.0, 620.0] {
        for z in [-380.0f32, 120.0, 540.0] {
            if pad_at(seed(), &g, x, z).is_some() {
                continue;
            }
            checked += 1;
            assert_eq!(g.height(x, z).to_bits(), g.base_height(x, z).to_bits());
        }
    }
    assert!(checked > 6, "almost everything was a landmark: {checked}");
}

/// A wall with no way through is a wall creatures grind against. The gate has to be a
/// real gap in the stone, not a line drawn over it.
#[test]
fn the_gate_is_a_hole_in_the_wall() {
    let g = hgen();
    let mark = in_window(seed(), &g, [0.0, 0.0], 2000.0)
        .into_iter()
        .find(|m| m.kind == LandmarkKind::Capital)
        .expect("no capital near the origin");

    let gate_x = mark.centre[0] + WALL_HALF * mark.gate;
    let inside = |x: f32, z: f32| {
        mark.slabs(&g).into_iter().any(|s| {
            (x - s.centre[0]).abs() <= s.half_extents[0]
                && (z - s.centre[2]).abs() <= s.half_extents[2]
        })
    };
    assert!(!inside(gate_x, mark.centre[1]), "the gateway is walled up");
    assert!(
        inside(gate_x, mark.centre[1] + GATE_HALF + 12.0),
        "the wall beside the gateway is missing"
    );
}

/// Somebody standing inside a keep is somebody who can never walk out of it, and the
/// blockout is solid boxes rather than buildings with doors.
#[test]
fn nobody_is_posted_inside_a_building() {
    let g = hgen();
    let mut checked = 0;
    for mark in in_window(seed(), &g, [0.0, 0.0], 3000.0) {
        let slabs = mark.slabs(&g);
        for post in mark.posts(&g) {
            checked += 1;
            for slab in &slabs {
                let inside = (post.at[0] - slab.centre[0]).abs() < slab.half_extents[0]
                    && (post.at[1] - slab.centre[2]).abs() < slab.half_extents[2];
                assert!(
                    !inside,
                    "{:?} at {:?} is standing inside a {:?} of {:?}",
                    post.role, post.at, slab.half_extents, mark.kind
                );
            }
        }
    }
    assert!(
        checked > 8,
        "too few posts to have tested anything: {checked}"
    );
}

/// The ground under a pier is river. Somebody put on the deck is put on the water the
/// moment anything asks the terrain how high it is there, so the dockhands stand at
/// the landward end of the timber rather than out on it.
#[test]
fn nobody_is_posted_on_the_water() {
    let g = hgen();
    for cz in -4..=4 {
        let mark = harbour_in_row(seed(), &g, cz);
        for post in mark.posts(&g) {
            let h = g.height(post.at[0], post.at[1]);
            assert!(
                h > g.water_level(),
                "{:?} at {:?} is standing in the river at {h}",
                post.role,
                post.at
            );
        }
    }
}

/// The point of levelling the ground is that what stands on it stands level. A post on
/// the feathered edge of a pad is on a slope somebody slides down.
#[test]
fn everybody_is_posted_on_the_levelled_ground() {
    let g = hgen();
    for mark in in_window(seed(), &g, [0.0, 0.0], 3000.0) {
        for post in mark.posts(&g) {
            let h = g.height(post.at[0], post.at[1]);
            assert!(
                (h - mark.pad_y).abs() < 0.05,
                "{:?} at {:?} stands at {h}, but the floor is {}",
                post.role,
                post.at,
                mark.pad_y
            );
        }
    }
}

/// Facing has to mean something. Somebody looking at where they already stand has no
/// direction at all and the client spins them arbitrarily.
#[test]
fn everybody_is_looking_somewhere_else() {
    let g = hgen();
    for mark in in_window(seed(), &g, [0.0, 0.0], 3000.0) {
        for post in mark.posts(&g) {
            let d = [post.facing[0] - post.at[0], post.facing[1] - post.at[1]];
            assert!(
                (d[0] * d[0] + d[1] * d[1]).sqrt() > 1.0,
                "{:?} is looking at its own feet",
                post.role
            );
        }
    }
}

/// Both kinds have to be occupied, or half the world's built places are empty rooms.
#[test]
fn both_kinds_are_lived_in() {
    let g = hgen();
    let capital = in_window(seed(), &g, [0.0, 0.0], 3000.0)
        .into_iter()
        .find(|m| m.kind == LandmarkKind::Capital)
        .expect("no capital");
    let harbour = harbour_in_row(seed(), &g, 0);

    let roles: Vec<Role> = capital.posts(&g).iter().map(|p| p.role).collect();
    assert!(roles.contains(&Role::GateGuard));
    assert!(roles.contains(&Role::Trader));
    assert!(roles.contains(&Role::Steward));

    let roles: Vec<Role> = harbour.posts(&g).iter().map(|p| p.role).collect();
    assert!(roles.contains(&Role::Dockhand));
    assert!(roles.contains(&Role::Harbourmaster));
}

/// Posts are derived, so they must not move for the window that found them -- somebody
/// who shifts when the ground under them is re-baked is somebody who walks on the spot.
#[test]
fn a_post_does_not_move_with_the_window() {
    let g = hgen();
    let home = in_window(seed(), &g, [0.0, 0.0], 512.0);
    for origin in [[256.0f32, 0.0], [-128.0, 320.0]] {
        let away = in_window(seed(), &g, origin, 512.0);
        for mark in &home {
            let Some(same) = away
                .iter()
                .find(|m| m.kind == mark.kind && m.cell == mark.cell)
            else {
                continue;
            };
            assert_eq!(same.posts(&g), mark.posts(&g));
        }
    }
}

/// The flow field is told about a landmark as lines. Every solid box has to produce
/// one, or a building the client draws is a building creatures walk through.
#[test]
fn every_solid_becomes_a_line_the_field_can_read() {
    let g = hgen();
    for mark in in_window(seed(), &g, [0.0, 0.0], 2000.0) {
        let print = mark.footprint(&g);
        assert_eq!(print.solid.len(), mark.slabs(&g).len());
        assert!(
            !print.open.is_empty(),
            "{:?} has no way in at all",
            mark.kind
        );
        for bar in &print.solid {
            assert!(bar.half_width > 0.0);
        }
    }
}

/// A pier is over the river, so a body standing under one has ground below and timber
/// above. The field needs the same deck treatment the bridge gets.
#[test]
fn the_piers_are_decks_over_the_water() {
    let g = hgen();
    let mark = harbour_in_row(seed(), &g, 0);
    let print = mark.footprint(&g);
    assert_eq!(print.decks.len(), 3, "a harbour has three piers");
    assert!(print.deck_y > g.water_level());
    for bar in &print.decks {
        let z = bar.from[1];
        assert!(
            g.height(bar.from[0], z) < g.water_level(),
            "a pier starts on dry land instead of over the water"
        );
    }
}

/// Windows overlapping the same ground must agree on what is built on it, the same
/// way they already agree on where the stones are.
#[test]
fn overlapping_windows_agree_on_what_is_built() {
    let g = hgen();
    let a = in_window(seed(), &g, [0.0, 0.0], 600.0);
    let b = in_window(seed(), &g, [400.0, 200.0], 600.0);

    let mut shared = 0;
    for from_a in &a {
        let Some(from_b) = b
            .iter()
            .find(|m| m.kind == from_a.kind && m.cell == from_a.cell)
        else {
            continue;
        };
        assert_eq!(
            from_a, from_b,
            "cell {:?} was rebuilt differently",
            from_a.cell
        );
        shared += 1;
    }
    assert!(shared > 0, "the windows did not overlap on anything");
}

/// Pointing somebody at one has to point at one that is really there.
#[test]
fn the_nearest_of_each_kind_is_findable() {
    let g = hgen();
    let found = nearest(seed(), &g, [300.0, -200.0]);
    assert!(found.iter().any(|m| m.kind == LandmarkKind::Harbour));
    assert!(found.iter().any(|m| m.kind == LandmarkKind::Capital));
    for mark in found {
        let round = match mark.kind {
            LandmarkKind::Harbour => harbour_in_row(seed(), &g, mark.cell[1]),
            LandmarkKind::Capital => {
                capital_in_cell(seed(), &g, mark.cell[0], mark.cell[1]).expect("gone")
            }
        };
        assert_eq!(round, mark);
    }
}
