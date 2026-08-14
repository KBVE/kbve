use super::field::{BLOCKED, Field, Grid};
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
        if field.grid.cost(nx, ny) >= BLOCKED {
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
            if field.grid.cost(sx, sy) >= BLOCKED {
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
    let mut g = grid(128, 128);
    for y in 0..100 {
        g.set_cost(64, y, BLOCKED);
    }
    let mut field = Field::new(g);
    let runs = 200;
    let start = Instant::now();
    for i in 0..runs {
        field.build([120.5, 8.5 + (i % 5) as f32]);
    }
    let each = start.elapsed().as_secs_f64() * 1000.0 / runs as f64;
    std::fs::write(
        "/tmp/field_bench.txt",
        format!("128x128 field build: {each:.3} ms\n"),
    )
    .ok();
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
