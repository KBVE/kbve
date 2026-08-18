use godot::prelude::*;

use super::{Day, Stop, Vec2};

fn flat(v: Vector3) -> Vec2 {
    [v.x, v.z]
}

fn wide(v: Vec2) -> Vector3 {
    Vector3::new(v[0], 0.0, v[1])
}

#[derive(GodotClass)]
#[class(no_init, base = RefCounted)]
pub struct QRoutine {
    base: Base<RefCounted>,
    inner: Day,
}

#[godot_api]
impl QRoutine {
    #[func]
    fn create(hour_seconds: f32) -> Gd<Self> {
        Gd::from_init_fn(|base| Self {
            base,
            inner: Day::new(hour_seconds),
        })
    }

    #[func]
    fn add_stop(&mut self, at: Vector3, hour: f32) {
        self.inner.push(Stop::new(flat(at), hour));
    }

    #[func]
    fn stop_count(&self) -> i64 {
        self.inner.stops().len() as i64
    }

    #[func]
    fn set_speed(&mut self, speed: f32) {
        self.inner.set_speed(speed);
    }

    #[func]
    fn set_hour_seconds(&mut self, seconds: f32) {
        self.inner.set_hour_seconds(seconds);
    }

    #[func]
    fn at(&self, hour: f32) -> VarDictionary {
        let mut out = VarDictionary::new();
        let Some(here) = self.inner.at(hour) else {
            return out;
        };
        out.set("at", wide(here.at));
        out.set("heading", wide(here.heading));
        out.set("walking", here.walking);
        out.set("stop", here.stop as i64);
        out
    }
}
