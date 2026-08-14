//! Where a creature wants to go next, decided without touching the engine.
//!
//! Godot owns collision: it calls `move_and_slide` and reports back how far the
//! body actually travelled. This module owns everything upstream of that --
//! waypoints, formation slots, avoidance, and noticing that a body has stopped
//! getting anywhere and doing something about it.

#[cfg(feature = "client")]
pub mod bridge;
pub mod field;
#[cfg(test)]
mod field_tests;
#[cfg(test)]
mod tests;

/// Flat 2D vector. Steering is a ground-plane problem; height is the engine's.
pub type Vec2 = [f32; 2];

fn add(a: Vec2, b: Vec2) -> Vec2 {
    [a[0] + b[0], a[1] + b[1]]
}

fn sub(a: Vec2, b: Vec2) -> Vec2 {
    [a[0] - b[0], a[1] - b[1]]
}

fn scale(v: Vec2, k: f32) -> Vec2 {
    [v[0] * k, v[1] * k]
}

fn length(v: Vec2) -> f32 {
    (v[0] * v[0] + v[1] * v[1]).sqrt()
}

fn normalize(v: Vec2) -> Vec2 {
    let len = length(v);
    if len < 1e-6 {
        [0.0, 0.0]
    } else {
        scale(v, 1.0 / len)
    }
}

fn rotate(v: Vec2, angle: f32) -> Vec2 {
    let (s, c) = angle.sin_cos();
    [v[0] * c - v[1] * s, v[0] * s + v[1] * c]
}

/// Deterministic per-creature noise. `rand` would tie the sim's motion to the
/// order the OS seeded it, which two ends of a session cannot agree on.
#[derive(Clone, Copy, Debug)]
pub struct Rng(u32);

impl Rng {
    /// Scrambles the seed first. Creatures are seeded by spawn index, so 0,1,2,3
    /// has to produce four unrelated wanders rather than four near-identical ones.
    pub fn new(seed: u32) -> Self {
        let mut x = seed ^ 0x9e37_79b9;
        x ^= x >> 16;
        x = x.wrapping_mul(0x85eb_ca6b);
        x ^= x >> 13;
        x = x.wrapping_mul(0xc2b2_ae35);
        x ^= x >> 16;
        Self(x | 1)
    }

    pub fn next_f32(&mut self) -> f32 {
        self.0 ^= self.0 << 13;
        self.0 ^= self.0 >> 17;
        self.0 ^= self.0 << 5;
        (self.0 >> 8) as f32 / 16_777_216.0
    }

    pub fn range(&mut self, from: f32, to: f32) -> f32 {
        from + (to - from) * self.next_f32()
    }
}

/// Everything the creature is allowed to know about the world this tick.
#[derive(Clone, Debug, Default)]
pub struct Sense {
    pub position: Vec2,
    /// Where the body is pointing, flat.
    pub facing: Vec2,
    /// Distance actually travelled since the last tick, after collision.
    pub travelled: f32,
    /// Other creatures, and anything else worth stepping around.
    pub neighbours: Vec<Vec2>,
    /// The leader, when following. Also an obstacle: a follower that ignores it
    /// walks into it, and a capsule pushed into a capsule climbs.
    pub leader: Option<Vec2>,
    pub leader_facing: Vec2,
    pub leader_speed: f32,
    /// Which way the flow field says to go, when one covers this creature.
    /// `None` means steer straight at the target, which is right in the open.
    pub route: Option<Vec2>,
}

/// Tuning. Defaults match what the GDScript patrol shipped with.
#[derive(Clone, Copy, Debug)]
pub struct Config {
    pub speed: f32,
    pub max_speed: f32,
    pub roam_radius: f32,
    pub arrive_distance: f32,
    pub separation: f32,
    pub separation_strength: f32,
    /// Nothing may come closer than this to the leader. The bug this fixes is a
    /// follower settling inside the player and riding up over their capsule.
    pub personal_space: f32,
    pub formation_distance: f32,
    pub formation_spacing: f32,
    pub formation_columns: i32,
    pub rank_depth: f32,
    pub hold_radius: f32,
    pub leader_idle_speed: f32,
    pub follow_deadzone: f32,
    pub follow_release: f32,
    pub sprint_distance: f32,
    pub pause_min: f32,
    pub pause_max: f32,
    /// Below this much travel per second, while wanting to move, counts as stuck.
    pub stuck_speed: f32,
    /// Seconds of that before the creature does something about it.
    pub stuck_time: f32,
    /// How long it commits to a sidestep once it gives up on going straight.
    pub unstick_time: f32,
    /// Waypoints further than this from home are abandoned rather than chased.
    pub give_up_time: f32,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            speed: 2.6,
            max_speed: 7.5,
            roam_radius: 22.0,
            arrive_distance: 2.0,
            separation: 9.0,
            separation_strength: 1.6,
            personal_space: 3.0,
            formation_distance: 7.0,
            formation_spacing: 9.0,
            formation_columns: 2,
            rank_depth: 9.0,
            hold_radius: 14.0,
            leader_idle_speed: 0.4,
            follow_deadzone: 3.5,
            follow_release: 1.8,
            sprint_distance: 14.0,
            pause_min: 0.8,
            pause_max: 2.6,
            stuck_speed: 0.35,
            stuck_time: 0.9,
            unstick_time: 1.2,
            give_up_time: 12.0,
        }
    }
}

/// What the creature is doing, for animation and for tests to assert on.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Mode {
    Roaming,
    Paused,
    Following,
    Holding,
    /// Committed to a sidestep after failing to make progress.
    Unsticking,
}

/// The answer Godot acts on.
#[derive(Clone, Copy, Debug)]
pub struct Step {
    /// Velocity to drive, ground plane.
    pub wish: Vec2,
    /// Direction to turn toward.
    pub face: Vec2,
    pub mode: Mode,
}

/// One creature's steering state.
#[derive(Clone, Debug)]
pub struct Patrol {
    pub config: Config,
    pub slot: i32,
    pub count: i32,
    home: Vec2,
    target: Vec2,
    pause: f32,
    holding: bool,
    stuck_for: f32,
    unstick_for: f32,
    unstick_dir: Vec2,
    chasing_for: f32,
    rng: Rng,
    mode: Mode,
}

impl Patrol {
    pub fn new(home: Vec2, seed: u32, config: Config) -> Self {
        let mut patrol = Self {
            config,
            slot: 0,
            count: 1,
            home,
            target: home,
            pause: 0.0,
            holding: false,
            stuck_for: 0.0,
            unstick_for: 0.0,
            unstick_dir: [0.0, 0.0],
            chasing_for: 0.0,
            rng: Rng::new(seed),
            mode: Mode::Roaming,
        };
        patrol.pick_target();
        patrol
    }

    pub fn mode(&self) -> Mode {
        self.mode
    }

    pub fn target(&self) -> Vec2 {
        self.target
    }

    pub fn set_home(&mut self, home: Vec2) {
        self.home = home;
        self.pick_target();
    }

    fn pick_target(&mut self) {
        let angle = self.rng.range(0.0, std::f32::consts::TAU);
        let radius = self.rng.next_f32().sqrt() * self.config.roam_radius;
        self.target = add(self.home, [angle.cos() * radius, angle.sin() * radius]);
        self.chasing_for = 0.0;
    }

    /// Where this creature's rank sits behind the leader.
    fn formation_slot(&self, leader: Vec2, leader_facing: Vec2) -> Vec2 {
        let forward = normalize(leader_facing);
        let back = scale(forward, -1.0);
        let side = [-forward[1], forward[0]];
        let columns = self.config.formation_columns.max(1);
        let row = self.slot / columns;
        let col = self.slot % columns;
        let in_row = columns.min(self.count - row * columns).max(1);
        let lateral = self.config.formation_spacing * (col as f32 - (in_row - 1) as f32 * 0.5);
        add(
            leader,
            add(
                scale(
                    back,
                    self.config.formation_distance + row as f32 * self.config.rank_depth,
                ),
                scale(side, lateral),
            ),
        )
    }

    /// Push away from anything too close, including the leader.
    ///
    /// The leader gets its own radius because it is usually the player, and a
    /// creature is allowed to crowd another creature far more than it is
    /// allowed to crowd the person playing.
    fn avoid(&self, sense: &Sense) -> Vec2 {
        let mut push = [0.0f32, 0.0];
        for other in &sense.neighbours {
            let away = sub(sense.position, *other);
            let distance = length(away);
            if distance < 1e-3 || distance >= self.config.separation {
                continue;
            }
            push = add(
                push,
                scale(
                    scale(away, 1.0 / distance),
                    1.0 - distance / self.config.separation,
                ),
            );
        }
        if let Some(leader) = sense.leader {
            let away = sub(sense.position, leader);
            let distance = length(away);
            let space = self.config.personal_space;
            if distance < space {
                // Overlapping exactly still has to produce a direction, or the
                // creature stays put and the engine resolves it by climbing.
                let out = if distance < 1e-3 {
                    normalize(scale(sense.facing, -1.0))
                } else {
                    scale(away, 1.0 / distance)
                };
                let urgency = 1.0 - distance / space;
                push = add(push, scale(out, 1.0 + urgency * 3.0));
            }
        }
        push
    }

    /// Notices a body that wants to move but is not moving, and commits to a
    /// sidestep rather than leaning on the obstacle for ever.
    fn update_stuck(&mut self, sense: &Sense, delta: f32, wants_to_move: bool) -> bool {
        if self.unstick_for > 0.0 {
            self.unstick_for -= delta;
            return true;
        }
        let speed = sense.travelled / delta.max(1e-4);
        if wants_to_move && speed < self.config.stuck_speed {
            self.stuck_for += delta;
        } else {
            self.stuck_for = 0.0;
        }
        if self.stuck_for >= self.config.stuck_time {
            self.stuck_for = 0.0;
            self.unstick_for = self.config.unstick_time;
            // Turn a consistent way for the whole commit, so it clears the
            // obstacle instead of jittering left and right against it.
            let turn = if self.rng.next_f32() < 0.5 { 1.2 } else { -1.2 };
            let base = if length(sense.facing) > 1e-3 {
                sense.facing
            } else {
                [1.0, 0.0]
            };
            self.unstick_dir = rotate(normalize(base), turn);
            return true;
        }
        false
    }

    /// Advances one tick and says what the body should do.
    pub fn step(&mut self, sense: &Sense, delta: f32) -> Step {
        let avoid = scale(self.avoid(sense), self.config.separation_strength);

        if self.unstick_for > 0.0 {
            self.unstick_for -= delta;
            if self.unstick_for <= 0.0 {
                // Whatever it was heading for is behind an obstacle, so it stops
                // being the plan.
                self.pick_target();
            }
            self.mode = Mode::Unsticking;
            let wish = add(scale(self.unstick_dir, self.config.speed), avoid);
            return Step {
                wish,
                face: self.unstick_dir,
                mode: Mode::Unsticking,
            };
        }

        match sense.leader {
            Some(leader) => self.follow(sense, leader, avoid, delta),
            None => self.roam(sense, avoid, delta),
        }
    }

    fn follow(&mut self, sense: &Sense, leader: Vec2, avoid: Vec2, delta: f32) -> Step {
        let slot = self.formation_slot(leader, sense.leader_facing);
        let to_slot = sub(slot, sense.position);
        let gap = length(to_slot);
        let lead_gap = length(sub(leader, sense.position));

        let settled = sense.leader_speed <= self.config.leader_idle_speed
            && lead_gap <= self.config.hold_radius;
        self.holding = if self.holding {
            settled && lead_gap <= self.config.hold_radius * self.config.follow_release
        } else {
            settled
                && gap
                    <= self
                        .config
                        .follow_deadzone
                        .max(self.config.hold_radius * 0.5)
        };

        // Crowding the leader overrides holding station: standing still on top
        // of the player is the one outcome that must not survive.
        let crowding = lead_gap < self.config.personal_space;

        if (self.holding || gap <= self.config.follow_deadzone) && !crowding {
            self.stuck_for = 0.0;
            self.mode = Mode::Holding;
            return Step {
                wish: avoid,
                face: normalize(sense.leader_facing),
                mode: Mode::Holding,
            };
        }

        if crowding {
            self.mode = Mode::Following;
            return Step {
                wish: avoid,
                face: normalize(sense.leader_facing),
                mode: Mode::Following,
            };
        }

        let dir = sense.route.unwrap_or_else(|| normalize(to_slot));
        if self.update_stuck(sense, delta, true) {
            self.mode = Mode::Unsticking;
            return Step {
                wish: add(scale(self.unstick_dir, self.config.speed), avoid),
                face: self.unstick_dir,
                mode: Mode::Unsticking,
            };
        }

        let ramp = ((gap - self.config.follow_deadzone)
            / (self.config.sprint_distance - self.config.follow_deadzone).max(0.01))
        .clamp(0.0, 1.0);
        let wanted = self.config.speed + (self.config.max_speed - self.config.speed) * ramp;
        self.mode = Mode::Following;
        Step {
            wish: add(scale(dir, wanted), avoid),
            face: dir,
            mode: Mode::Following,
        }
    }

    fn roam(&mut self, sense: &Sense, avoid: Vec2, delta: f32) -> Step {
        if self.pause > 0.0 {
            self.pause -= delta;
            self.stuck_for = 0.0;
            self.mode = Mode::Paused;
            return Step {
                wish: avoid,
                face: normalize(sense.facing),
                mode: Mode::Paused,
            };
        }

        let to = sub(self.target, sense.position);
        if length(to) <= self.config.arrive_distance {
            self.pause = self.rng.range(self.config.pause_min, self.config.pause_max);
            self.pick_target();
            self.mode = Mode::Paused;
            return Step {
                wish: avoid,
                face: normalize(sense.facing),
                mode: Mode::Paused,
            };
        }

        // A waypoint it has been chasing for this long is behind something it
        // cannot get round, whatever the reason.
        self.chasing_for += delta;
        if self.chasing_for >= self.config.give_up_time {
            self.pick_target();
        }

        if self.update_stuck(sense, delta, true) {
            self.mode = Mode::Unsticking;
            return Step {
                wish: add(scale(self.unstick_dir, self.config.speed), avoid),
                face: self.unstick_dir,
                mode: Mode::Unsticking,
            };
        }

        let dir = sense.route.unwrap_or_else(|| normalize(to));
        self.mode = Mode::Roaming;
        Step {
            wish: add(scale(dir, self.config.speed), avoid),
            face: dir,
            mode: Mode::Roaming,
        }
    }
}
