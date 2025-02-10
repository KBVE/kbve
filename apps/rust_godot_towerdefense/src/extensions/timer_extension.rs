use godot::prelude::*;
use godot::classes::{ Node, Timer };

pub trait TimerExt {
  fn with_name(self, name: &str) -> Self;
  fn with_wait_time(self, time: f64) -> Self;
  fn with_one_shot(self, one_shot: bool) -> Self;
  fn with_autostart(self, autostart: bool) -> Self;
  fn with_paused(self, paused: bool) -> Self;
  fn restart(self, time: f64) -> Self;
  fn ensure_timer(base: &mut Gd<Node>, key: &GString, wait_time: f64) -> Gd<Timer>;
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

  fn ensure_timer(base: &mut Gd<Node>, key: &GString, wait_time: f64) -> Gd<Timer> {
    let timer_key = format!("Timer_{}", key);

    let mut timer = if let Some(mut existing_timer) = base.try_get_node_as::<Timer>(timer_key.as_str()) {
      existing_timer.stop();
      existing_timer.set_wait_time(wait_time);
      existing_timer
    } else {
      let mut new_timer = Timer::new_alloc()
        .with_name(&timer_key)
        .with_one_shot(true)
        .with_wait_time(wait_time)
        .with_autostart(true);

      base.add_child(&new_timer.clone().upcast::<Node>());
      godot_print!("[TimerExt] Added new timer: {}", timer_key);
      new_timer
    };

    if !timer.is_connected("timeout", &base.callable("hide_avatar_message")) {
      timer.connect("timeout", &base.callable("hide_avatar_message").bind(&[key.to_variant()]));
    }

    godot_print!("[TimerExt] Timer '{}' started with wait_time: {}", timer_key, wait_time);

    timer
  }
}
