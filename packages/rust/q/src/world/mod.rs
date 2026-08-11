pub mod flora_compute;
pub mod flora_field;
pub mod grass_compute;
pub mod grass_field;
pub mod harvest;
pub mod stone_field;
pub mod stone_mesh;
pub mod terrain;
pub mod tree_field;

pub(crate) fn q_hidden(name: &str) -> bool {
    std::env::var("Q_HIDE")
        .map(|v| v.split(',').any(|s| s.trim() == name))
        .unwrap_or(false)
}

pub(crate) struct ReadyTimer(&'static str, std::time::Instant);

impl ReadyTimer {
    pub(crate) fn start(name: &'static str) -> Self {
        Self(name, std::time::Instant::now())
    }
}

impl Drop for ReadyTimer {
    fn drop(&mut self) {
        godot::global::godot_print!("[q] {} ready {}ms", self.0, self.1.elapsed().as_millis());
    }
}
