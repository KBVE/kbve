#[cfg(feature = "client")]
pub mod bridge;

#[cfg(test)]
mod tests;

pub type Vec2 = [f32; 2];

pub const HOURS_PER_DAY: f32 = 24.0;
pub const WALK_SPEED: f32 = 1.0;

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Stop {
    pub at: Vec2,
    pub hour: f32,
}

impl Stop {
    pub fn new(at: Vec2, hour: f32) -> Self {
        Self {
            at,
            hour: hour.rem_euclid(HOURS_PER_DAY),
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Where {
    pub at: Vec2,
    pub heading: Vec2,
    pub walking: bool,
    pub stop: usize,
    pub stood: f32,
}

#[derive(Clone, Debug, Default)]
pub struct Day {
    stops: Vec<Stop>,
    speed: f32,
    hour_seconds: f32,
}

impl Day {
    pub fn new(hour_seconds: f32) -> Self {
        Self {
            stops: Vec::new(),
            speed: WALK_SPEED,
            hour_seconds: hour_seconds.max(0.001),
        }
    }

    pub fn push(&mut self, stop: Stop) {
        self.stops.push(stop);
        self.stops.sort_by(|a, b| {
            a.hour
                .partial_cmp(&b.hour)
                .unwrap_or(std::cmp::Ordering::Equal)
        });
    }

    pub fn stops(&self) -> &[Stop] {
        &self.stops
    }

    pub fn set_speed(&mut self, speed: f32) {
        self.speed = speed.max(0.01);
    }

    pub fn set_hour_seconds(&mut self, seconds: f32) {
        self.hour_seconds = seconds.max(0.001);
    }

    pub fn at(&self, hour: f32) -> Option<Where> {
        if self.stops.is_empty() {
            return None;
        }
        let hour = hour.rem_euclid(HOURS_PER_DAY);
        let stop = self.current(hour);
        let heading_for = self.stops[stop];
        let from = self.stops[self.before(stop)].at;
        let to = heading_for.at;

        let step = [to[0] - from[0], to[1] - from[1]];
        let far = (step[0] * step[0] + step[1] * step[1]).sqrt();
        let since = self.since(hour, heading_for.hour);
        if far < 1e-4 {
            return Some(Where {
                at: to,
                heading: [0.0, 0.0],
                walking: false,
                stop,
                stood: since,
            });
        }

        let walked = since * self.speed;
        if walked >= far {
            return Some(Where {
                at: to,
                heading: [0.0, 0.0],
                walking: false,
                stop,
                stood: since - far / self.speed,
            });
        }
        let heading = [step[0] / far, step[1] / far];
        Some(Where {
            at: [from[0] + heading[0] * walked, from[1] + heading[1] * walked],
            heading,
            walking: true,
            stop,
            stood: 0.0,
        })
    }

    fn since(&self, hour: f32, from_hour: f32) -> f32 {
        (hour - from_hour).rem_euclid(HOURS_PER_DAY) * self.hour_seconds
    }

    fn current(&self, hour: f32) -> usize {
        let mut found = self.stops.len() - 1;
        for (i, stop) in self.stops.iter().enumerate() {
            if stop.hour <= hour {
                found = i;
            }
        }
        found
    }

    fn before(&self, stop: usize) -> usize {
        if stop == 0 {
            self.stops.len() - 1
        } else {
            stop - 1
        }
    }
}
