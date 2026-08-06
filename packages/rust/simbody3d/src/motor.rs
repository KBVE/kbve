use crate::config::StepConfig;

/// Exponential approach toward a target.
///
/// Consumers that also predict this motion client-side must use this exact
/// curve — two copies of a formula this small is how authoritative and
/// predicted motion quietly diverge.
#[inline]
pub fn approach(current: f32, target: f32, accel: f32, dt: f32) -> f32 {
    current + (target - current) * (1.0 - (-accel * dt).exp())
}

/// Turns a variable frame delta into whole simulation steps, so travel is a
/// function of elapsed time rather than of how often the caller ticks.
pub struct FixedStep {
    acc: f32,
    pub dt: f32,
    pub max_steps: u32,
}

impl Default for FixedStep {
    fn default() -> Self {
        Self::from_config(StepConfig::default())
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

    pub fn from_config(cfg: StepConfig) -> Self {
        Self::new(cfg.dt, cfg.max_steps)
    }

    /// Runs whole steps for the elapsed time; returns how many ran. Past
    /// `max_steps` the backlog is dropped rather than repaid in one burst.
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
