use crate::constants::{MOTOR_DT, MOTOR_MAX_STEPS};

/// Exponential approach toward a target. Mirrors `approach` in
/// `character/CharacterMotor.ts` — two copies of a curve this small is exactly
/// how authoritative and predicted motion quietly diverge.
#[inline]
pub fn approach(current: f32, target: f32, accel: f32, dt: f32) -> f32 {
    current + (target - current) * (1.0 - (-accel * dt).exp())
}

/// Turns a variable frame delta into whole simulation steps. Mirrors
/// `FixedStep` in `character/CharacterMotor.ts`.
pub struct FixedStep {
    acc: f32,
    pub dt: f32,
    pub max_steps: u32,
}

impl Default for FixedStep {
    fn default() -> Self {
        Self::new(MOTOR_DT, MOTOR_MAX_STEPS)
    }
}

impl FixedStep {
    pub fn new(dt: f32, max_steps: u32) -> Self {
        Self {
            acc: 0.0,
            dt,
            max_steps,
        }
    }

    pub fn run(&mut self, frame_dt: f32, mut step: impl FnMut(f32)) -> u32 {
        self.acc += frame_dt;
        let mut n = 0;
        while self.acc >= self.dt && n < self.max_steps {
            self.acc -= self.dt;
            step(self.dt);
            n += 1;
        }
        if n >= self.max_steps {
            self.acc = 0.0;
        }
        n
    }

    pub fn pending(&self) -> f32 {
        self.acc
    }

    pub fn reset(&mut self) {
        self.acc = 0.0;
    }
}
