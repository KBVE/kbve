//! A cost grid and the flow field integrated over it.
//!
//! Steering can sidestep an obstacle; it cannot route around one. It has no
//! idea a rock is the near end of a ridge, so it bounces along the face of it.
//! A flow field knows, because the cost of every cell is measured from the goal
//! outwards rather than guessed from where the creature happens to stand.
//!
//! The field is per goal, not per creature. Followers all want the same place,
//! so they share one integration; that is the property that makes this scale
//! where per-agent pathing does not.

use super::{Vec2, add, length, normalize, scale, sub};
use std::cmp::Ordering;
use std::collections::BinaryHeap;

/// Cost of a cell nothing may enter.
pub const BLOCKED: u8 = 255;
/// Diagonal steps cost more, or the field prefers staircases to straight lines.
const DIAGONAL: f32 = std::f32::consts::SQRT_2;

/// Traversal cost over a square of world, one byte per cell.
#[derive(Clone, Debug)]
pub struct Grid {
    pub origin: Vec2,
    pub cell: f32,
    pub width: usize,
    pub height: usize,
    cost: Vec<u8>,
}

impl Grid {
    pub fn new(origin: Vec2, cell: f32, width: usize, height: usize) -> Self {
        Self {
            origin,
            cell: cell.max(1e-3),
            width,
            height,
            cost: vec![1; width * height],
        }
    }

    pub fn index(&self, x: usize, y: usize) -> usize {
        y * self.width + x
    }

    pub fn cost(&self, x: usize, y: usize) -> u8 {
        self.cost[self.index(x, y)]
    }

    pub fn set_cost(&mut self, x: usize, y: usize, cost: u8) {
        let i = self.index(x, y);
        self.cost[i] = cost;
    }

    pub fn fill(&mut self, cost: u8) {
        self.cost.iter_mut().for_each(|c| *c = cost);
    }

    /// Cell containing a world point, clamped to the grid.
    pub fn cell_of(&self, at: Vec2) -> (usize, usize) {
        let local = sub(at, self.origin);
        let x = (local[0] / self.cell).floor().max(0.0) as usize;
        let y = (local[1] / self.cell).floor().max(0.0) as usize;
        (x.min(self.width - 1), y.min(self.height - 1))
    }

    /// True when the point is outside the grid, where the field knows nothing.
    pub fn outside(&self, at: Vec2) -> bool {
        let local = sub(at, self.origin);
        local[0] < 0.0
            || local[1] < 0.0
            || local[0] >= self.width as f32 * self.cell
            || local[1] >= self.height as f32 * self.cell
    }

    pub fn centre_of(&self, x: usize, y: usize) -> Vec2 {
        [
            self.origin[0] + (x as f32 + 0.5) * self.cell,
            self.origin[1] + (y as f32 + 0.5) * self.cell,
        ]
    }

    /// Marks a disc impassable, which is how a rock or a tree gets into the grid.
    pub fn block_disc(&mut self, centre: Vec2, radius: f32) {
        self.stamp_disc(centre, radius, BLOCKED);
    }

    /// Grows every blocked region by `radius` of world.
    ///
    /// The field routes a point, and a creature is not one. Without this a mech
    /// two units wide is steered down a line that only its centre fits through,
    /// and it spends the whole way scraping the thing it was routed around.
    pub fn inflate(&mut self, radius: f32) {
        let steps = (radius / self.cell).ceil() as usize;
        for _ in 0..steps {
            let before = self.cost.clone();
            for y in 0..self.height {
                for x in 0..self.width {
                    if before[self.index(x, y)] == BLOCKED {
                        continue;
                    }
                    let touches =
                        [(1i32, 0i32), (-1, 0), (0, 1), (0, -1)]
                            .iter()
                            .any(|(dx, dy)| {
                                let nx = x as i32 + dx;
                                let ny = y as i32 + dy;
                                nx >= 0
                                    && ny >= 0
                                    && nx < self.width as i32
                                    && ny < self.height as i32
                                    && before[self.index(nx as usize, ny as usize)] == BLOCKED
                            });
                    if touches {
                        let i = self.index(x, y);
                        self.cost[i] = BLOCKED;
                    }
                }
            }
        }
    }

    /// Raises the cost of a disc without closing it, for ground a creature may
    /// cross but would rather not.
    pub fn stamp_disc(&mut self, centre: Vec2, radius: f32, cost: u8) {
        if radius <= 0.0 {
            return;
        }
        let min = sub(centre, [radius, radius]);
        let max = [centre[0] + radius, centre[1] + radius];
        let (x0, y0) = self.cell_of(min);
        let (x1, y1) = self.cell_of(max);
        for y in y0..=y1 {
            for x in x0..=x1 {
                if length(sub(self.centre_of(x, y), centre)) <= radius {
                    let i = self.index(x, y);
                    self.cost[i] = self.cost[i].max(cost);
                }
            }
        }
    }
}

#[derive(Copy, Clone, PartialEq)]
struct Visit {
    distance: f32,
    cell: u32,
}

impl Eq for Visit {}

impl Ord for Visit {
    fn cmp(&self, other: &Self) -> Ordering {
        // Reversed: BinaryHeap is a max-heap and Dijkstra wants the nearest.
        // Distances are finite and non-negative here, so this never sees a NaN.
        other
            .distance
            .partial_cmp(&self.distance)
            .unwrap_or(Ordering::Equal)
    }
}

impl PartialOrd for Visit {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

/// A grid plus the route to one goal across it.
#[derive(Clone, Debug)]
pub struct Field {
    pub grid: Grid,
    distance: Vec<f32>,
    flow: Vec<Vec2>,
    goal: Vec2,
}

impl Field {
    pub fn new(grid: Grid) -> Self {
        let cells = grid.width * grid.height;
        Self {
            grid,
            distance: vec![f32::INFINITY; cells],
            flow: vec![[0.0, 0.0]; cells],
            goal: [0.0, 0.0],
        }
    }

    pub fn goal(&self) -> Vec2 {
        self.goal
    }

    /// Distance to the goal through the cheapest route, or infinity if the cell
    /// cannot reach it at all.
    pub fn distance_at(&self, at: Vec2) -> f32 {
        if self.grid.outside(at) {
            return f32::INFINITY;
        }
        let (x, y) = self.grid.cell_of(at);
        self.distance[self.grid.index(x, y)]
    }

    /// Integrates the whole grid outward from `goal`.
    ///
    /// Dijkstra rather than a wavefront pass: cell costs vary, so the cheapest
    /// route is not always the one with fewest steps, and a wavefront would
    /// walk creatures through the expensive ground it is meant to avoid.
    pub fn build(&mut self, goal: Vec2) {
        self.goal = goal;
        self.distance.iter_mut().for_each(|d| *d = f32::INFINITY);
        let (gx, gy) = self.grid.cell_of(goal);
        let start = self.grid.index(gx, gy);

        let mut heap: BinaryHeap<Visit> = BinaryHeap::with_capacity(self.grid.width * 4);
        // A goal standing in something impassable would integrate nothing, so it
        // is seeded regardless and the cost applies from its neighbours out.
        self.distance[start] = 0.0;
        heap.push(Visit {
            distance: 0.0,
            cell: start as u32,
        });

        while let Some(Visit { distance, cell }) = heap.pop() {
            let cell = cell as usize;
            if distance > self.distance[cell] {
                continue;
            }
            let cx = cell % self.grid.width;
            let cy = cell / self.grid.width;
            for (dx, dy) in [
                (1i32, 0i32),
                (-1, 0),
                (0, 1),
                (0, -1),
                (1, 1),
                (1, -1),
                (-1, 1),
                (-1, -1),
            ] {
                let nx = cx as i32 + dx;
                let ny = cy as i32 + dy;
                if nx < 0 || ny < 0 || nx >= self.grid.width as i32 || ny >= self.grid.height as i32
                {
                    continue;
                }
                let (nx, ny) = (nx as usize, ny as usize);
                let cost = self.grid.cost(nx, ny);
                if cost == BLOCKED {
                    continue;
                }
                // Diagonals may not cut a corner between two blocked cells.
                if dx != 0
                    && dy != 0
                    && (self.grid.cost((cx as i32 + dx) as usize, cy) == BLOCKED
                        || self.grid.cost(cx, (cy as i32 + dy) as usize) == BLOCKED)
                {
                    continue;
                }
                let step = if dx != 0 && dy != 0 { DIAGONAL } else { 1.0 };
                let next = distance + step * (1.0 + cost as f32 * 0.05);
                let ni = self.grid.index(nx, ny);
                if next < self.distance[ni] {
                    self.distance[ni] = next;
                    heap.push(Visit {
                        distance: next,
                        cell: ni as u32,
                    });
                }
            }
        }

        self.bake_flow();
    }

    /// Direction of steepest descent per cell, taken once so lookups are cheap.
    fn bake_flow(&mut self) {
        for y in 0..self.grid.height {
            for x in 0..self.grid.width {
                let i = self.grid.index(x, y);
                let here = self.distance[i];
                if !here.is_finite() {
                    self.flow[i] = [0.0, 0.0];
                    continue;
                }
                let mut best = here;
                let mut best_dir = [0.0f32, 0.0];
                for (dx, dy) in [
                    (1i32, 0i32),
                    (-1, 0),
                    (0, 1),
                    (0, -1),
                    (1, 1),
                    (1, -1),
                    (-1, 1),
                    (-1, -1),
                ] {
                    let nx = x as i32 + dx;
                    let ny = y as i32 + dy;
                    if nx < 0
                        || ny < 0
                        || nx >= self.grid.width as i32
                        || ny >= self.grid.height as i32
                    {
                        continue;
                    }
                    let ni = self.grid.index(nx as usize, ny as usize);
                    if self.distance[ni] < best {
                        best = self.distance[ni];
                        best_dir = normalize([dx as f32, dy as f32]);
                    }
                }
                self.flow[i] = best_dir;
            }
        }
    }

    /// Which way to walk from `at`, or `None` where the field cannot help --
    /// off the grid, or standing somewhere the goal cannot be reached from.
    ///
    /// Callers fall back to steering straight at the target, which is the right
    /// answer when there is nothing in the way.
    pub fn direction_at(&self, at: Vec2) -> Option<Vec2> {
        if self.grid.outside(at) {
            return None;
        }
        let (x, y) = self.grid.cell_of(at);
        let i = self.grid.index(x, y);
        if !self.distance[i].is_finite() {
            return self.escape_from(x, y, at);
        }
        // Inside the goal's own cell the gradient is flat, so aim at the goal
        // itself rather than handing back a zero.
        if self.distance[i] <= 0.0 {
            let to = sub(self.goal, at);
            return if length(to) > 1e-4 {
                Some(normalize(to))
            } else {
                None
            };
        }
        // Where routes converge -- either side of a gap, say -- neighbouring
        // cells point at each other and the blend cancels. The cell's own flow
        // is never ambiguous, so it is what the blend falls back to.
        let blended = self.sample_flow(at);
        let dir = if length(blended) < 0.25 {
            self.flow[i]
        } else {
            blended
        };
        if length(dir) < 1e-4 {
            return None;
        }
        Some(normalize(dir))
    }

    /// Nearest way out for a body standing somewhere the field cannot route
    /// from -- inside a rock it spawned in, or shoved into one by a crowd.
    ///
    /// Without this such a body is told `None` for ever and stands there. The
    /// search is a widening ring so it leaves by the shortest side.
    fn escape_from(&self, x: usize, y: usize, at: Vec2) -> Option<Vec2> {
        const RINGS: i32 = 6;
        for ring in 1..=RINGS {
            // Ranked by progress toward the goal, not by proximity. Leaving by
            // the nearest side is usually leaving the way it came in, and the
            // flow there points straight back through the obstacle, which is a
            // body bouncing in and out of a rock for ever.
            let mut best: Option<(f32, Vec2)> = None;
            for dy in -ring..=ring {
                for dx in -ring..=ring {
                    if dx.abs() != ring && dy.abs() != ring {
                        continue;
                    }
                    let nx = x as i32 + dx;
                    let ny = y as i32 + dy;
                    if nx < 0
                        || ny < 0
                        || nx >= self.grid.width as i32
                        || ny >= self.grid.height as i32
                    {
                        continue;
                    }
                    let ni = self.grid.index(nx as usize, ny as usize);
                    if !self.distance[ni].is_finite() {
                        continue;
                    }
                    let to = sub(self.grid.centre_of(nx as usize, ny as usize), at);
                    if length(to) <= 1e-4 {
                        continue;
                    }
                    let rank = self.distance[ni];
                    if best.is_none_or(|(br, _)| rank < br) {
                        best = Some((rank, to));
                    }
                }
            }
            if let Some((_, to)) = best {
                return Some(normalize(to));
            }
        }
        None
    }

    /// Blends the flow of the four cells around a point.
    ///
    /// Per-cell flow walks everything down the middle of a column of cells and
    /// turns in steps; interpolating gives a continuous direction, which is what
    /// keeps a body off the corners it would otherwise clip.
    fn sample_flow(&self, at: Vec2) -> Vec2 {
        let local = sub(at, self.grid.origin);
        let fx = local[0] / self.grid.cell - 0.5;
        let fy = local[1] / self.grid.cell - 0.5;
        let x0 = fx.floor();
        let y0 = fy.floor();
        let tx = fx - x0;
        let ty = fy - y0;
        let mut out = [0.0f32, 0.0];
        for (ox, oy, w) in [
            (0.0, 0.0, (1.0 - tx) * (1.0 - ty)),
            (1.0, 0.0, tx * (1.0 - ty)),
            (0.0, 1.0, (1.0 - tx) * ty),
            (1.0, 1.0, tx * ty),
        ] {
            if w <= 0.0 {
                continue;
            }
            let cx = x0 + ox;
            let cy = y0 + oy;
            if cx < 0.0 || cy < 0.0 || cx >= self.grid.width as f32 || cy >= self.grid.height as f32
            {
                continue;
            }
            let i = self.grid.index(cx as usize, cy as usize);
            // Unreachable cells carry no direction, so they must not dilute the
            // ones that do.
            if !self.distance[i].is_finite() {
                continue;
            }
            out = add(out, scale(self.flow[i], w));
        }
        out
    }

    /// Rebuilds only if the goal has moved far enough to matter, which is what
    /// keeps a field following a walking player affordable.
    pub fn rebuild_if_moved(&mut self, goal: Vec2, slack: f32) -> bool {
        if length(sub(goal, self.goal)) <= slack && self.distance_at(goal).is_finite() {
            return false;
        }
        self.build(goal);
        true
    }

    /// Marks every cell whose ground is too steep or too low to walk.
    ///
    /// `heights` is the square height grid the terrain already keeps on the CPU;
    /// this reads it rather than asking the engine anything.
    pub fn stamp_terrain(
        &mut self,
        heights: &[f32],
        res: usize,
        extent: f32,
        water_level: f32,
        max_slope: f32,
    ) {
        if res < 2 || heights.len() < res * res {
            return;
        }
        let step = extent * 2.0 / (res - 1) as f32;
        for y in 0..self.grid.height {
            for x in 0..self.grid.width {
                let at = self.grid.centre_of(x, y);
                let u = ((at[0] + extent) / (extent * 2.0)).clamp(0.0, 1.0);
                let v = ((at[1] + extent) / (extent * 2.0)).clamp(0.0, 1.0);
                let px = ((u * (res - 1) as f32) as usize).min(res - 1);
                let py = ((v * (res - 1) as f32) as usize).min(res - 1);
                let h = heights[py * res + px];
                if h <= water_level {
                    self.grid.set_cost(x, y, BLOCKED);
                    continue;
                }
                let rx = (px + 1).min(res - 1);
                let ry = (py + 1).min(res - 1);
                let dx = (heights[py * res + rx] - h).abs();
                let dy = (heights[ry * res + px] - h).abs();
                let slope = dx.max(dy) / step;
                if slope >= max_slope {
                    self.grid.set_cost(x, y, BLOCKED);
                } else {
                    // Walkable but leaning: worth avoiding when flat ground is
                    // available, which is what stops paths hugging a hillside.
                    let lean = (slope / max_slope).clamp(0.0, 1.0);
                    let cost = (1.0 + lean * 30.0) as u8;
                    self.grid.set_cost(x, y, self.grid.cost(x, y).max(cost));
                }
            }
        }
    }
}
