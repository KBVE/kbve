use super::field::{BLOCKED, Deck, Field, Grid};
use super::{Vec2, add, length, scale, sub};

fn grid(width: usize, height: usize) -> Grid {
    Grid::new([0.0, 0.0], 1.0, width, height)
}

/// Follows the field from `start` and returns the path, or None if it stalls.
fn walk(field: &Field, start: Vec2, steps: usize) -> Option<Vec<Vec2>> {
    let mut at = start;
    let mut path = vec![at];
    for _ in 0..steps {
        if length(sub(field.goal(), at)) < 1.0 {
            return Some(path);
        }
        let dir = field.direction_at(at)?;
        // Collision is Godot's job in the real game; here it is this, so the
        // test measures routing rather than how far a point may drift.
        let next = add(at, scale(dir, 0.5));
        let (nx, ny) = field.grid.cell_of(next);
        if field.grid.cost(nx, ny) == BLOCKED {
            let slide = if field.grid.cost(
                field.grid.cell_of([next[0], at[1]]).0,
                field.grid.cell_of([next[0], at[1]]).1,
            ) < BLOCKED
            {
                [next[0], at[1]]
            } else {
                [at[0], next[1]]
            };
            let (sx, sy) = field.grid.cell_of(slide);
            if field.grid.cost(sx, sy) == BLOCKED {
                return None;
            }
            at = slide;
        } else {
            at = next;
        }
        path.push(at);
    }
    None
}

#[test]
fn open_ground_routes_straight() {
    let mut field = Field::new(grid(32, 32));
    field.build([30.5, 16.5]);
    let path = walk(&field, [1.5, 16.5], 200).expect("never arrived");
    for point in &path {
        assert!((point[1] - 16.5).abs() < 2.0, "wandered off: {point:?}");
    }
}

/// The case steering cannot do: a wall long enough that sidestepping fails.
#[test]
fn routes_around_a_wall() {
    let mut g = grid(32, 32);
    // Wall across the middle with a gap at the top.
    for y in 0..26 {
        g.set_cost(16, y, BLOCKED);
    }
    // A creature has width, so the field it follows must keep it off the wall.
    g.inflate(1.0);
    let mut field = Field::new(g);
    field.build([30.5, 5.5]);

    let path = walk(&field, [2.5, 5.5], 1000).expect("never got round the wall");
    let cells: Vec<(usize, usize)> = path.iter().map(|p| field.grid.cell_of(*p)).collect();
    assert!(
        cells.iter().any(|(x, y)| *x == 16 && *y >= 26),
        "did not use the gap"
    );
    for (x, y) in &cells {
        assert!(
            field.grid.cost(*x, *y) < BLOCKED,
            "walked through the wall at {x},{y}"
        );
    }
}

#[test]
fn a_sealed_goal_is_unreachable_rather_than_wrong() {
    let mut g = grid(24, 24);
    for i in 8..16 {
        g.set_cost(i, 8, BLOCKED);
        g.set_cost(i, 15, BLOCKED);
        g.set_cost(8, i, BLOCKED);
        g.set_cost(15, i, BLOCKED);
    }
    let mut field = Field::new(g);
    field.build([11.5, 11.5]);
    assert!(field.direction_at([2.5, 2.5]).is_none());
    assert!(field.distance_at([2.5, 2.5]).is_infinite());
}

#[test]
fn off_grid_has_no_opinion() {
    let mut field = Field::new(grid(16, 16));
    field.build([8.5, 8.5]);
    assert!(field.direction_at([-5.0, 8.5]).is_none());
    assert!(field.direction_at([100.0, 8.5]).is_none());
}

#[test]
fn prefers_cheap_ground_to_the_short_way() {
    let mut g = grid(32, 12);
    // A straight line of expensive ground between start and goal.
    for x in 0..32 {
        g.set_cost(x, 6, 200);
    }
    let mut field = Field::new(g);
    field.build([28.5, 6.5]);
    let path = walk(&field, [2.5, 6.5], 400).expect("never arrived");
    let in_mud = path
        .iter()
        .filter(|p| {
            let (x, y) = field.grid.cell_of(**p);
            field.grid.cost(x, y) > 100
        })
        .count();
    assert!(
        in_mud * 4 < path.len(),
        "ploughed through the costly strip: {in_mud} of {} steps",
        path.len()
    );
}

#[test]
fn diagonals_do_not_cut_blocked_corners() {
    let mut g = grid(8, 8);
    g.set_cost(4, 3, BLOCKED);
    g.set_cost(3, 4, BLOCKED);
    let mut field = Field::new(g);
    field.build([3.5, 3.5]);
    // Reaching the goal from the far corner must not slip between the two
    // blocked cells, so its distance has to exceed the diagonal shortcut.
    let d = field.distance_at([4.5, 4.5]);
    assert!(d > 1.5, "cut the corner: {d}");
}

#[test]
fn blocking_a_disc_closes_it() {
    let mut g = grid(32, 32);
    g.block_disc([16.0, 16.0], 4.0);
    assert_eq!(g.cost(16, 16), BLOCKED);
    assert!(g.cost(0, 0) < BLOCKED);
}

#[test]
fn rebuild_is_skipped_for_a_goal_that_barely_moved() {
    let mut field = Field::new(grid(32, 32));
    field.build([16.5, 16.5]);
    assert!(!field.rebuild_if_moved([16.6, 16.5], 1.0));
    assert!(field.rebuild_if_moved([25.5, 16.5], 1.0));
}

#[test]
fn water_and_cliffs_are_stamped_out() {
    let res = 32usize;
    let extent = 16.0f32;
    let mut heights = vec![5.0f32; res * res];
    // A trench of water down one column, and a cliff at another.
    for y in 0..res {
        heights[y * res + 8] = -1.0;
        heights[y * res + 20] = 60.0;
    }
    let mut field = Field::new(Grid::new([-extent, -extent], 1.0, 32, 32));
    field.stamp_terrain(&heights, res, extent, 0.0, 4.0);
    let (_, row) = field.grid.cell_of([0.0, 0.0]);
    let blocked_at =
        |from: usize, to: usize| (from..=to).any(|x| field.grid.cost(x, row) == BLOCKED);
    assert!(blocked_at(7, 9), "water stayed walkable");
    assert!(blocked_at(18, 22), "cliff stayed walkable");
}

/// The same trench and cliff, in a grid nowhere near the world origin. The
/// streaming world hands this exact shape to the field: a heightmap covering
/// the terrain window, wherever the window is. A mapping that quietly assumed
/// the origin read the wrong heights for every relocated cell -- ground here
/// was judged by ground a kilometre away.
#[test]
fn terrain_stamps_the_same_wherever_the_grid_sits() {
    let res = 32usize;
    let extent = 16.0f32;
    let centre = [1024.0f32, -512.0];
    let mut heights = vec![5.0f32; res * res];
    for y in 0..res {
        heights[y * res + 8] = -1.0;
        heights[y * res + 20] = 60.0;
    }
    let mut field = Field::new(Grid::new(
        [centre[0] - extent, centre[1] - extent],
        1.0,
        32,
        32,
    ));
    field.stamp_terrain(&heights, res, extent, 0.0, 4.0);
    let (_, row) = field.grid.cell_of(centre);
    let blocked_at =
        |from: usize, to: usize| (from..=to).any(|x| field.grid.cost(x, row) == BLOCKED);
    assert!(blocked_at(7, 9), "water stayed walkable in a moved window");
    assert!(
        blocked_at(18, 22),
        "cliff stayed walkable in a moved window"
    );
    let open = (0..32)
        .filter(|x| field.grid.cost(*x, row) != BLOCKED)
        .count();
    assert!(
        open > 20,
        "a moved window closed ground that is flat and dry"
    );
}

#[test]
fn building_is_deterministic() {
    let build = || {
        let mut g = grid(48, 48);
        for y in 0..30 {
            g.set_cost(24, y, BLOCKED);
        }
        let mut f = Field::new(g);
        f.build([40.5, 8.5]);
        f
    };
    let a = build();
    let b = build();
    for y in 0..48 {
        for x in 0..48 {
            let at = a.grid.centre_of(x, y);
            let da = a.distance_at(at);
            let db = b.distance_at(at);
            assert_eq!(da.to_bits(), db.to_bits(), "cell {x},{y} differs");
        }
    }
}

#[test]
#[ignore]
fn bench_build() {
    use std::time::Instant;
    let mut out = String::new();
    for n in [128usize, 256, 512] {
        let mut g = grid(n, n);
        for y in 0..(n * 3 / 4) {
            g.set_cost(n / 2, y, BLOCKED);
        }
        let mut field = Field::new(g);
        let runs = 50;
        let start = Instant::now();
        for i in 0..runs {
            field.build([n as f32 - 8.5, 8.5 + (i % 5) as f32]);
        }
        let each = start.elapsed().as_secs_f64() * 1000.0 / runs as f64;
        out.push_str(&format!("{n}x{n} build: {each:.3} ms\n"));
    }
    std::fs::write("/tmp/field_bench.txt", out).ok();
}

#[test]
fn inflating_keeps_a_body_off_the_wall() {
    let mut g = grid(16, 16);
    g.set_cost(8, 8, BLOCKED);
    g.inflate(1.0);
    assert_eq!(g.cost(7, 8), BLOCKED, "did not grow");
    assert_eq!(g.cost(9, 8), BLOCKED);
    assert!(g.cost(5, 8) < BLOCKED, "grew too far");
}

#[test]
fn inflating_can_seal_a_gap_too_narrow_to_fit() {
    let mut g = grid(16, 16);
    for y in 0..16 {
        if y != 8 {
            g.set_cost(8, y, BLOCKED);
        }
    }
    g.inflate(1.0);
    let mut field = Field::new(g);
    field.build([12.5, 8.5]);
    // A one-cell gap does not admit a two-cell body, and the field must say so
    // rather than route into it.
    assert!(field.distance_at([2.5, 8.5]).is_infinite());
}

/// A trunk is much narrower than a cell, and one of them is not a wall.
#[test]
fn a_lone_trunk_costs_rather_than_closes() {
    let mut g = Grid::new([0.0, 0.0], 4.0, 16, 16);
    let before = g.cost(8, 8);
    g.stamp_coverage(&[34.0, 34.0, 0.4], 0.5, 200.0);
    assert!(g.cost(8, 8) < BLOCKED, "one tree walled off a whole cell");
    assert!(g.cost(8, 8) > before, "one tree cost nothing at all");
}

/// The same trunks, packed: coverage adds up and the cell closes.
#[test]
fn a_thicket_closes_the_cell() {
    let mut g = Grid::new([0.0, 0.0], 4.0, 16, 16);
    let mut discs = Vec::new();
    for i in 0..5 {
        for j in 0..5 {
            discs.extend_from_slice(&[32.4 + i as f32 * 0.8, 32.4 + j as f32 * 0.8, 0.45]);
        }
    }
    g.stamp_coverage(&discs, 0.35, 200.0);
    assert_eq!(g.cost(8, 8), BLOCKED, "a wood of 25 trunks stayed open");
}

/// `stamp_disc` tests the cell centre, so an off-centre trunk is invisible to
/// it. Coverage is the reason this stamp exists.
#[test]
fn an_off_centre_trunk_is_not_missed() {
    let mut g = Grid::new([0.0, 0.0], 4.0, 8, 8);
    let corner = [16.3f32, 16.3];
    let mut by_centre = g.clone();
    by_centre.stamp_disc(corner, 0.5, 60);
    assert_eq!(by_centre.cost(4, 4), 1, "test no longer measures anything");
    g.stamp_coverage(&[corner[0], corner[1], 0.5], 0.5, 400.0);
    assert!(g.cost(4, 4) > 1, "missed the trunk near the cell edge");
}

#[test]
fn coverage_off_the_grid_is_ignored() {
    let mut g = Grid::new([0.0, 0.0], 4.0, 8, 8);
    g.stamp_coverage(&[-500.0, -500.0, 3.0, 900.0, 12.0, 3.0], 0.2, 400.0);
    for y in 0..8 {
        for x in 0..8 {
            assert_eq!(g.cost(x, y), 1, "cell {x},{y} took cost from off-grid");
        }
    }
}

#[test]
fn a_rock_wider_than_a_cell_closes_it() {
    let mut g = Grid::new([0.0, 0.0], 4.0, 16, 16);
    g.stamp_coverage(&[34.0, 34.0, 5.0], 0.6, 200.0);
    assert_eq!(g.cost(8, 8), BLOCKED);
    assert!(g.cost(2, 2) < BLOCKED, "closed ground nowhere near it");
}

/// Cost from trees must never reach BLOCKED by accident: below the ratio the
/// ground is walkable, and the field has to keep saying so.
#[test]
fn coverage_cost_stays_walkable() {
    let mut g = Grid::new([0.0, 0.0], 4.0, 8, 8);
    let mut discs = Vec::new();
    for i in 0..8 {
        discs.extend_from_slice(&[15.0 + i as f32 * 0.2, 15.0, 0.5]);
    }
    g.stamp_coverage(&discs, 0.9, 100_000.0);
    assert!(g.cost(3, 3) < BLOCKED, "cost saturated into a wall");
}

#[test]
fn coverage_is_deterministic() {
    let discs: Vec<f32> = (0..60)
        .flat_map(|i| {
            let f = i as f32;
            [
                10.0 + f * 0.7,
                12.0 + (f * 0.31).sin() * 6.0,
                0.3 + f * 0.01,
            ]
        })
        .collect();
    let build = || {
        let mut g = Grid::new([0.0, 0.0], 4.0, 24, 24);
        g.stamp_coverage(&discs, 0.4, 180.0);
        g
    };
    let (a, b) = (build(), build());
    for y in 0..24 {
        for x in 0..24 {
            assert_eq!(a.cost(x, y), b.cost(x, y), "cell {x},{y} differs");
        }
    }
}

/// Trees are not allowed to seal a route the terrain left open unless they
/// really do fill it, so a scattered wood stays walkable.
#[test]
fn a_scattered_wood_can_still_be_walked_through() {
    let mut g = grid(48, 48);
    let mut discs = Vec::new();
    for i in 0..40 {
        for j in 0..12 {
            discs.extend_from_slice(&[6.0 + i as f32, 18.0 + j as f32 * 1.5, 0.35]);
        }
    }
    g.stamp_coverage(&discs, 0.5, 150.0);
    let mut field = Field::new(g);
    field.build([24.5, 44.5]);
    assert!(
        field.distance_at([24.5, 2.5]).is_finite(),
        "a wood of thin trunks became a wall"
    );
}

#[test]
fn a_body_inside_an_obstacle_is_shown_the_way_out() {
    let mut g = grid(24, 24);
    g.block_disc([12.0, 12.0], 3.0);
    let mut field = Field::new(g);
    field.build([22.5, 12.5]);
    let dir = field
        .direction_at([12.0, 12.0])
        .expect("stranded inside the rock");
    assert!(length(dir) > 0.9, "no way out: {dir:?}");
}

/// A bridge is a structure the ground under it denies: the terrain says water,
/// so every other stamp closes the one place the river can be crossed.
#[test]
fn a_bridge_reopens_a_crossing_the_water_closed() {
    let mut g = grid(48, 48);
    // A river down the middle, blocked as water would be.
    for y in 0..48 {
        for x in 22..26 {
            g.set_cost(x, y, BLOCKED);
        }
    }
    let mut field = Field::new(g);
    field.build([40.5, 24.5]);
    assert!(
        field.distance_at([6.5, 24.5]).is_infinite(),
        "test river was not a barrier to begin with"
    );

    field.grid.open_path([18.0, 24.5], [30.0, 24.5], 1.6, 20);
    field.build([40.5, 24.5]);
    assert!(
        field.distance_at([6.5, 24.5]).is_finite(),
        "the bridge did not reopen the crossing"
    );
    let path = walk(&field, [6.5, 24.5], 600).expect("never crossed");
    assert!(
        path.iter().any(|p| p[0] > 26.0),
        "never reached the far bank"
    );
}

/// The order matters and is easy to get wrong: clearance grown off the banks
/// closes a deck narrower than it, so the bridge has to be opened last.
#[test]
fn clearance_would_close_a_bridge_opened_too_early() {
    let build = |bridge_first: bool| {
        let mut g = grid(48, 48);
        for y in 0..48 {
            for x in 22..26 {
                g.set_cost(x, y, BLOCKED);
            }
        }
        if bridge_first {
            g.open_path([18.0, 24.5], [30.0, 24.5], 1.6, 20);
            g.inflate(2.5);
        } else {
            g.inflate(2.5);
            g.open_path([18.0, 24.5], [30.0, 24.5], 1.6, 20);
        }
        let mut f = Field::new(g);
        f.build([40.5, 24.5]);
        f
    };
    assert!(
        build(true).distance_at([6.5, 24.5]).is_infinite(),
        "clearance no longer closes an early bridge, so this guards nothing"
    );
    assert!(
        build(false).distance_at([6.5, 24.5]).is_finite(),
        "opening last still left the crossing shut"
    );
}

/// Opening a crossing must not quietly open the water beside it.
#[test]
fn a_bridge_opens_only_its_own_line() {
    let mut g = grid(48, 48);
    for y in 0..48 {
        for x in 22..26 {
            g.set_cost(x, y, BLOCKED);
        }
    }
    g.open_path([18.0, 24.5], [30.0, 24.5], 1.6, 20);
    for y in 0..48 {
        if (y as f32 - 24.5).abs() < 3.0 {
            continue;
        }
        for x in 22..26 {
            assert_eq!(g.cost(x, y), BLOCKED, "opened water at {x},{y}");
        }
    }
}

/// The half of a bridge the field used to miss entirely.
///
/// `open_path` describes the line a body may walk and says nothing about the
/// structure carrying it. Approaches are railed causeways with a skirt down to
/// the ground, so most of a crossing is wall, and a field told only about the
/// line routes bodies into the side of one.
#[test]
fn a_causeway_is_a_wall_and_routes_go_round_it() {
    let mut g = grid(48, 48);
    g.block_path([8.0, 24.5], [40.0, 24.5], 2.0);
    let mut field = Field::new(g);
    field.build([24.5, 42.5]);

    let path = walk(&field, [24.5, 6.5], 900).expect("never got past the causeway");
    assert!(
        path.iter().any(|p| p[0] < 8.0 || p[0] > 40.0),
        "went through the causeway instead of round an end"
    );
}

/// The trap in blocking the structure: the clearance is grown off it in every
/// direction, the ends included, so a walkway reopened to exactly the length
/// that was closed is a tube with both mouths plugged. Nothing can get on it,
/// and everything on the far bank is stranded.
#[test]
fn a_crossing_reopened_end_to_end_is_sealed() {
    let build = |mouth: f32| {
        let mut g = grid(48, 48);
        for y in 0..48 {
            for x in 22..26 {
                g.set_cost(x, y, BLOCKED);
            }
        }
        g.block_path([14.0, 24.5], [34.0, 24.5], 2.0);
        g.inflate(2.5);
        g.open_path([14.0 - mouth, 24.5], [34.0 + mouth, 24.5], 1.6, 20);
        let mut f = Field::new(g);
        f.build([40.5, 24.5]);
        f
    };
    assert!(
        build(0.0).distance_at([6.5, 24.5]).is_infinite(),
        "sealing no longer happens, so this guards nothing"
    );
    assert!(
        build(3.5).distance_at([6.5, 24.5]).is_finite(),
        "opening past the ends still left the crossing shut"
    );
}

/// The one place a flat grid lies: the deck and the riverbed under it are the
/// same cell, so a body wading about beneath the span is told it is on a
/// perfectly good route and walks into a pier until something else moves it.
#[test]
fn a_body_under_the_deck_is_not_on_it() {
    let mut field = Field::new(grid(48, 48));
    field.set_deck(Some(Deck {
        from: [14.0, 24.5],
        to: [34.0, 24.5],
        half_width: 3.0,
        surface_y: 4.0,
        drop: 1.5,
    }));

    assert!(
        field.under_deck([24.0, -1.0, 24.5]),
        "in the river under it"
    );
    assert!(!field.under_deck([24.0, 4.1, 24.5]), "standing on the deck");
    assert!(
        !field.under_deck([24.0, -1.0, 40.0]),
        "well off to one side, so the deck says nothing about it"
    );
    assert!(
        !field.under_deck([50.0, -1.0, 24.5]),
        "past the end of the span"
    );

    field.set_deck(None);
    assert!(
        !field.under_deck([24.0, -1.0, 24.5]),
        "a world with no crossing has nothing to be under"
    );
}
