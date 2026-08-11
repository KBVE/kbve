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
    static HIDDEN: std::sync::OnceLock<Vec<String>> = std::sync::OnceLock::new();
    HIDDEN
        .get_or_init(|| {
            std::env::var("Q_HIDE")
                .map(|v| v.split(',').map(|s| s.trim().to_string()).collect())
                .unwrap_or_default()
        })
        .iter()
        .any(|s| s == name)
}

/// Times a block that runs on the main thread only occasionally — streaming
/// rebuilds and the like — and reports it when it is slow enough to be seen as
/// a hitch. Armed by Q_PROFILE so a normal run never pays for it.
pub(crate) struct StallTimer(&'static str, std::time::Instant);

fn profiling() -> bool {
    static V: std::sync::OnceLock<bool> = std::sync::OnceLock::new();
    *V.get_or_init(|| std::env::var("Q_PROFILE").is_ok())
}

impl StallTimer {
    pub(crate) fn start(name: &'static str) -> Option<Self> {
        // Some of these sit on per-frame paths, and env::var allocates and locks
        // the environment on every call, so the lookup happens once.
        if profiling() {
            Some(Self(name, std::time::Instant::now()))
        } else {
            None
        }
    }
}

impl Drop for StallTimer {
    fn drop(&mut self) {
        let ms = self.1.elapsed().as_micros() as f64 / 1000.0;
        if ms >= 2.0 {
            godot::global::godot_print!("[q] stall {} {:.1}ms", self.0, ms);
        }
    }
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
