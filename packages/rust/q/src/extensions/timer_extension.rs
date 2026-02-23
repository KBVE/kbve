use crate::data::cache::ResourceCache;
use godot::builtin::Callable;
use godot::classes::{Node, Timer};
use godot::global::Error;
use godot::prelude::*;

pub trait TimerExt {
    fn with_name(self, name: &str) -> Self;
    fn with_wait_time(self, time: f64) -> Self;
    fn with_one_shot(self, one_shot: bool) -> Self;
    fn with_autostart(self, autostart: bool) -> Self;
    fn with_paused(self, paused: bool) -> Self;
    fn restart(self, time: f64) -> Self;
    fn with_connection(self, target: Gd<Node>, method: &str, args: &[Variant]) -> Self;
}

impl TimerExt for Gd<Timer> {
    fn with_name(mut self, name: &str) -> Self {
        self.set_name(name);
        self
    }

    fn with_wait_time(mut self, time: f64) -> Self {
        self.set_wait_time(time);
        self
    }

    fn with_one_shot(mut self, one_shot: bool) -> Self {
        self.set_one_shot(one_shot);
        self
    }

    fn with_autostart(mut self, autostart: bool) -> Self {
        self.set_autostart(autostart);
        self
    }

    fn with_paused(mut self, paused: bool) -> Self {
        self.set_paused(paused);
        self
    }

    fn restart(mut self, time: f64) -> Self {
        self.stop();
        self.set_wait_time(time);
        self.start();
        self.set_autostart(true);
        self
    }

    fn with_connection(mut self, target: Gd<Node>, method: &str, args: &[Variant]) -> Self {
        let callable = Callable::from_object_method(&target, method).bind(args);
        let result = self.connect("timeout", &callable);
        if result != Error::OK {
            godot_warn!(
                "[TimerExt] Failed to connect timeout signal to '{}'",
                method
            );
        } else {
            godot_print!("[TimerExt] Connected timeout signal to '{}'", method);
        }

        self
    }
}

#[derive(GodotClass)]
#[class(base = Node)]
pub struct ClockMaster {
    base: Base<Node>,
    timer_cache: ResourceCache<Timer>,
}

#[godot_api]
impl INode for ClockMaster {
    fn init(base: Base<Node>) -> Self {
        Self {
            base,
            timer_cache: ResourceCache::new(),
        }
    }
}

#[godot_api]
impl ClockMaster {
    pub fn ensure_timer(&mut self, key: GString, wait_time: f64) -> Gd<Timer> {
        let timer_key = key.to_string();

        if let Some(mut timer) = self.timer_cache.get(&timer_key) {
            if timer.get_wait_time() != wait_time {
                timer.set_wait_time(wait_time);
            }
            return timer;
        }

        let new_timer = Timer::new_alloc()
            .with_name(&timer_key)
            .with_wait_time(wait_time)
            .with_one_shot(true);

        let stored_timer = new_timer.clone();

        {
            let mut guard = self.base_mut();
            guard.add_child(&new_timer);
        }

        self.timer_cache.insert(&timer_key, stored_timer);

        godot_print!(
            "[ClockMaster] Timer '{}' Ensured from Timer Extension. (Wait Time: {})",
            key,
            wait_time
        );

        new_timer
    }

    #[func]
    pub fn on_timer_timeout(&mut self, key: GString) {
        godot_print!("[ClockMaster] Timer '{}' timed out.", key);

        if let Some(mut timer) = self.timer_cache.get(&key.to_string()) {
            timer.stop();
        } else {
            godot_warn!("[ClockMaster] Timer '{}' not found in cache.", key);
        }
    }

    #[func]
    pub fn destroy_timer(&mut self, key: GString) {
        let timer_key = key.to_string();
        if let Some(mut timer) = self.timer_cache.remove(&timer_key) {
            godot_print!("[ClockMaster] Destroying Timer '{}'", timer_key);
            timer.queue_free(); // godot::prelude::Node::queue_free + https://godot-rust.github.io/docs/gdext/master/godot/classes/struct.Timer.html -> queue_free(&mut self)
        } else {
            godot_warn!(
                "[ClockMaster] Cant destroy Timer '{}' as it was not found.",
                key
            );
        }
    }
}
