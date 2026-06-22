pub const WALK_SPEED: f32 = 3.4;
pub const RUN_SPEED: f32 = 6.6;
pub const MOVE_ACCEL: f32 = 18.0;
pub const MOVE_FRICTION: f32 = 30.0;
pub const BODY_RADIUS: f32 = 0.34;
pub const COLLISION_SKIN: f32 = 0.01;
pub const STOP_SPEED: f32 = 2.0;
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
        let target_vx = nx * speed * scale;
        let target_vy = ny * speed * scale;
        let response = 1.0 - exp_decay(MOVE_ACCEL, dt);
        b.vx += (target_vx - b.vx) * response;
        b.vy += (target_vy - b.vy) * response;
    } else {
        b.vx = 0.0;
        b.vy = 0.0;
    }

    move_axis_sub(b, Axis::X, b.vx * dt, is_blocked);
    move_axis_sub(b, Axis::Y, b.vy * dt, is_blocked);
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
