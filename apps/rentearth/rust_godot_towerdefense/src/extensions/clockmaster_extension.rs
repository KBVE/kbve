use godot::prelude::*;
use godot::engine::{ Node, Timer };

pub trait ClockMasterExt {
  fn get_or_create_timer(&mut self, key: &str, wait_time: f64) -> Gd<Timer>;
  fn remove_timer(&mut self, key: &str);
}

impl ClockMasterExt for Gd<Node> {
  fn get_or_create_timer(&mut self, key: &str, wait_time: f64) -> Gd<Timer> {
    let timer_key = GString::from(key);

    if let Some(timer) = self.try_get_node_as::<Timer>(timer_key.as_str()) {
      let mut existing_timer = timer.clone();
      existing_timer.stop();
      existing_timer.set_wait_time(wait_time);
      existing_timer.call_deferred("start", &[]);
      return existing_timer;
    }

    let mut new_timer = Timer::new_alloc();
    new_timer.set_name(timer_key.as_str());
    new_timer.set_wait_time(wait_time);
    new_timer.set_one_shot(true);

    self.add_child(new_timer.clone().upcast::<Node>());

    new_timer.call_deferred("start", &[]);

    godot_print!("[ClockMasterExt] Timer '{}' created with wait_time: {}", key, wait_time);

    new_timer
  }

  fn remove_timer(&mut self, key: &str) {
    let timer_key = GString::from(key);
    if let Some(timer) = self.try_get_node_as::<Timer>(timer_key.as_str()) {
      let mut timer = timer.clone();
      timer.queue_free();
      godot_print!("[ClockMasterExt] Timer '{}' removed.", key);
    }
  }
}
