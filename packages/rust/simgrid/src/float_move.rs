pub const WALK_SPEED: f32 = 3.4;
pub const RUN_SPEED: f32 = 6.6;
pub const MOVE_ACCEL: f32 = 18.0;
pub const MOVE_FRICTION: f32 = 60.0;
pub const BODY_RADIUS: f32 = 0.34;
pub const COLLISION_SKIN: f32 = 0.01;
pub const STOP_SPEED: f32 = 1.5;
pub const MAX_MOVE_STEP: f32 = 0.2;

#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct FloatBody {
    pub x: f32,
    pub y: f32,
    pub vx: f32,
    pub vy: f32,
}

impl FloatBody {
    pub fn at(x: f32, y: f32) -> Self {
        Self {
            x,
            y,
            vx: 0.0,
            vy: 0.0,
        }
    }

    pub fn speed(&self) -> f32 {
        self.vx.hypot(self.vy)
    }

    pub fn tile(&self) -> (i32, i32) {
        (tile_at(self.x), tile_at(self.y))
    }
}

#[derive(Clone, Copy)]
enum Axis {
    X,
    Y,
}

fn tile_at(v: f32) -> i32 {
    (v + 0.5).floor() as i32
}

fn get(b: &FloatBody, a: Axis) -> f32 {
    match a {
        Axis::X => b.x,
        Axis::Y => b.y,
    }
}

fn set(b: &mut FloatBody, a: Axis, v: f32) {
    match a {
        Axis::X => b.x = v,
        Axis::Y => b.y = v,
    }
}

fn set_vel(b: &mut FloatBody, a: Axis, v: f32) {
    match a {
        Axis::X => b.vx = v,
        Axis::Y => b.vy = v,
    }
}

fn other(a: Axis) -> Axis {
    match a {
        Axis::X => Axis::Y,
        Axis::Y => Axis::X,
    }
}

fn exp_decay(rate: f32, dt: f32) -> f32 {
    (-rate * dt).exp()
}

pub fn step_float(
    b: &mut FloatBody,
    ix: f32,
    iy: f32,
    speed: f32,
    is_blocked: &impl Fn(i32, i32) -> bool,
    dt_ms: f32,
) {
    let dt = dt_ms.min(50.0) / 1000.0;
    let mag = ix.hypot(iy);

    if mag > 0.0 {
        let nx = ix / mag;
        let ny = iy / mag;
        let scale = mag.min(1.0);
        accelerate(b, nx * speed * scale, ny * speed * scale, MOVE_ACCEL, dt);
    } else {
        b.vx = 0.0;
        b.vy = 0.0;
    }

    integrate(b, dt, is_blocked);
}

/// Velocity ease toward a target velocity, shared accel model used by both the
/// player intent step and NPC steering. `rate` is the per-second response rate
/// (higher = snappier); the player path passes `MOVE_ACCEL`, steered NPCs pass
/// their `MoveProfile` accel/friction.
fn accelerate(b: &mut FloatBody, target_vx: f32, target_vy: f32, rate: f32, dt: f32) {
    let response = 1.0 - exp_decay(rate, dt);
    b.vx += (target_vx - b.vx) * response;
    b.vy += (target_vy - b.vy) * response;
}

/// Sub-stepped collision integration, shared by every step variant.
fn integrate(b: &mut FloatBody, dt: f32, is_blocked: &impl Fn(i32, i32) -> bool) {
    move_axis_sub(b, Axis::X, b.vx * dt, is_blocked);
    move_axis_sub(b, Axis::Y, b.vy * dt, is_blocked);
}

/// Unit intent vector from the body toward (tx,ty). Zero when already on target.
pub fn seek(b: &FloatBody, tx: f32, ty: f32) -> (f32, f32) {
    let dx = tx - b.x;
    let dy = ty - b.y;
    let d = dx.hypot(dy);
    if d > 1e-4 {
        (dx / d, dy / d)
    } else {
        (0.0, 0.0)
    }
}

/// Like `seek`, but the intent magnitude scales down linearly inside
/// `slow_radius` (0 at the target) so the body eases to a stop.
pub fn arrive(b: &FloatBody, tx: f32, ty: f32, slow_radius: f32) -> (f32, f32) {
    let dx = tx - b.x;
    let dy = ty - b.y;
    let d = dx.hypot(dy);
    if d <= 1e-4 {
        return (0.0, 0.0);
    }
    let mag = if slow_radius > 0.0 {
        (d / slow_radius).min(1.0)
    } else {
        1.0
    };
    (dx / d * mag, dy / d * mag)
}

/// Steer toward (tx,ty) with a banking turn: rotate the velocity heading toward
/// the arrive-intent heading by at most `max_turn_rate_rad_s * dt` radians, then
/// integrate via the same accel/friction model as `step_float`. `accel` is the
/// velocity steer rate, `friction` the decel rate when easing to a stop.
/// Collision handling is identical (shared `integrate`).
#[allow(clippy::too_many_arguments)]
pub fn step_steer(
    b: &mut FloatBody,
    tx: f32,
    ty: f32,
    speed: f32,
    max_turn_rate_rad_s: f32,
    accel: f32,
    friction: f32,
    slow_radius: f32,
    is_blocked: &impl Fn(i32, i32) -> bool,
    dt_ms: f32,
) {
    let dt = dt_ms.min(50.0) / 1000.0;
    let (ix, iy) = arrive(b, tx, ty, slow_radius);
    let mag = ix.hypot(iy);

    if mag <= 1e-4 {
        // On target: bleed velocity toward zero at the friction rate, then
        // integrate so any residual drift still resolves collisions.
        accelerate(b, 0.0, 0.0, friction, dt);
        integrate(b, dt, is_blocked);
        return;
    }

    let desired = iy.atan2(ix);
    // Current heading: use velocity when moving, else aim straight at the target
    // so a stationary body starts turning from the goal direction.
    let cur = if b.speed() > 1e-3 {
        b.vy.atan2(b.vx)
    } else {
        desired
    };
    let max_step = max_turn_rate_rad_s * dt;
    let heading = cur + wrap_pi(desired - cur).clamp(-max_step, max_step);

    let scale = mag.min(1.0);
    let target_vx = heading.cos() * speed * scale;
    let target_vy = heading.sin() * speed * scale;
    accelerate(b, target_vx, target_vy, accel, dt);
    integrate(b, dt, is_blocked);
}

/// Wrap an angle delta into (-PI, PI] for shortest-arc rotation.
fn wrap_pi(a: f32) -> f32 {
    use core::f32::consts::PI;
    let mut a = a % (2.0 * PI);
    if a > PI {
        a -= 2.0 * PI;
    } else if a <= -PI {
        a += 2.0 * PI;
    }
    a
}

fn move_axis_sub(
    b: &mut FloatBody,
    axis: Axis,
    delta: f32,
    is_blocked: &impl Fn(i32, i32) -> bool,
) -> bool {
    if delta == 0.0 {
        return false;
    }
    let steps = (delta.abs() / MAX_MOVE_STEP).ceil().max(1.0) as u32;
    let step = delta / steps as f32;
    for _ in 0..steps {
        if move_axis(b, axis, step, is_blocked) {
            return true;
        }
    }
    false
}

fn move_axis(
    b: &mut FloatBody,
    axis: Axis,
    delta: f32,
    is_blocked: &impl Fn(i32, i32) -> bool,
) -> bool {
    if delta == 0.0 {
        return false;
    }
    let target = get(b, axis) + delta;
    let dir = delta.signum();

    let edge = target + dir * BODY_RADIUS;
    let edge_tile = tile_at(edge);

    let center = get(b, other(axis));
    let o0 = tile_at(center - BODY_RADIUS);
    let o1 = tile_at(center + BODY_RADIUS);

    for o in o0..=o1 {
        let (tx, ty) = match axis {
            Axis::X => (edge_tile, o),
            Axis::Y => (o, edge_tile),
        };
        if !is_blocked(tx, ty) {
            continue;
        }

        let face_row = tile_at(center);
        let corner_only = o != face_row && {
            let (cx, cy) = match axis {
                Axis::X => (edge_tile, face_row),
                Axis::Y => (face_row, edge_tile),
            };
            !is_blocked(cx, cy)
        };

        if corner_only {
            let corner_edge = o as f32 - (o - face_row).signum() as f32 * 0.5;
            let overlap = BODY_RADIUS - (corner_edge - center).abs() + COLLISION_SKIN;
            if overlap > 0.0 {
                let nudged = get(b, other(axis)) - (o - face_row).signum() as f32 * overlap;
                set(b, other(axis), nudged);
            }
            continue;
        }

        let wall_face = edge_tile as f32 - dir * 0.5;
        set(b, axis, wall_face - dir * (BODY_RADIUS + COLLISION_SKIN));
        set_vel(b, axis, 0.0);
        return true;
    }
    set(b, axis, target);
    false
}

pub fn intent_from_axes(mx: i8, my: i8) -> (f32, f32) {
    let ix = (mx as f32 / 127.0).clamp(-1.0, 1.0);
    let iy = (my as f32 / 127.0).clamp(-1.0, 1.0);
    let mag_sq = ix * ix + iy * iy;
    if mag_sq > 1.0 {
        let inv = mag_sq.sqrt().recip();
        (ix * inv, iy * inv)
    } else {
        (ix, iy)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn never_blocked(_x: i32, _y: i32) -> bool {
        false
    }

    #[test]
    fn seek_is_unit_toward_target() {
        let b = FloatBody::at(0.0, 0.0);
        let (x, y) = seek(&b, 3.0, 4.0);
        assert!((x.hypot(y) - 1.0).abs() < 1e-4);
        assert!((x - 0.6).abs() < 1e-4 && (y - 0.8).abs() < 1e-4);
    }

    #[test]
    fn seek_zero_on_target() {
        let b = FloatBody::at(1.0, 1.0);
        let (x, y) = seek(&b, 1.0, 1.0);
        assert_eq!((x, y), (0.0, 0.0));
    }

    #[test]
    fn arrive_scales_inside_slow_radius() {
        let b = FloatBody::at(0.0, 0.0);
        let outside = arrive(&b, 10.0, 0.0, 2.0);
        assert!((outside.0.hypot(outside.1) - 1.0).abs() < 1e-4);
        let inside = arrive(&b, 1.0, 0.0, 2.0);
        assert!((inside.0.hypot(inside.1) - 0.5).abs() < 1e-4);
    }

    #[test]
    fn step_steer_caps_turn_rate() {
        // Moving +X, target straight up: heading may rotate at most rate*dt.
        let mut b = FloatBody::at(0.0, 0.0);
        b.vx = 4.0;
        b.vy = 0.0;
        let dt_ms = 50.0;
        let rate = 3.5;
        step_steer(
            &mut b,
            0.0,
            100.0,
            6.0,
            rate,
            14.0,
            30.0,
            1.5,
            &never_blocked,
            dt_ms,
        );
        let heading = b.vy.atan2(b.vx);
        let cap = rate * (dt_ms / 1000.0);
        // Heading should have rotated toward +Y but not past the per-tick cap.
        assert!(heading > 0.0);
        assert!(heading <= cap + 1e-3);
    }

    #[test]
    fn step_steer_moves_toward_target() {
        let mut b = FloatBody::at(0.0, 0.0);
        for _ in 0..40 {
            step_steer(
                &mut b,
                5.0,
                0.0,
                6.0,
                3.5,
                14.0,
                30.0,
                1.5,
                &never_blocked,
                50.0,
            );
        }
        assert!(b.x > 2.0);
    }

    #[test]
    fn wrap_pi_shortest_arc() {
        use core::f32::consts::PI;
        assert!((wrap_pi(1.5 * PI) - (-0.5 * PI)).abs() < 1e-4);
        assert!((wrap_pi(-1.5 * PI) - (0.5 * PI)).abs() < 1e-4);
    }
}
