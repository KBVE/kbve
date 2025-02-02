use godot::prelude::*;
use godot::classes::{ Node, Timer };

pub trait TimerExt {
  fn with_name(self, name: &str) -> Self;
  fn with_wait_time(self, time: f64) -> Self;
  fn with_one_shot(self, one_shot: bool) -> Self;
  fn with_autostart(self, autostart: bool) -> Self;
  fn with_paused(self, paused: bool) -> Self;
  fn restart(self, time: f64) -> Self;
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
    self
  }
}
