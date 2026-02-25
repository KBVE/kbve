use godot::prelude::*;

mod core;
mod data;
mod entity;
mod extensions;
mod macros;
mod manager;
mod threads;

#[cfg(any(target_os = "macos", target_os = "windows", target_os = "linux"))]
mod platform;

struct Q;

#[gdextension]
unsafe impl ExtensionLibrary for Q {
    #[cfg(any(target_os = "macos", target_os = "windows", target_os = "linux"))]
    fn on_level_init(level: InitLevel) {
        use crate::threads::runtime::RuntimeManager;
        match level {
            InitLevel::Scene => {
                let mut engine = godot::classes::Engine::singleton();
                engine.register_singleton(RuntimeManager::SINGLETON, &RuntimeManager::new_alloc());
            }
            _ => (),
        }
    }

    #[cfg(any(target_os = "macos", target_os = "windows", target_os = "linux"))]
    fn on_level_deinit(level: InitLevel) {
        use crate::threads::runtime::RuntimeManager;
        match level {
            InitLevel::Scene => {
                let mut engine = godot::classes::Engine::singleton();
                if let Some(singleton) = engine.get_singleton(RuntimeManager::SINGLETON) {
                    engine.unregister_singleton(RuntimeManager::SINGLETON);
                    singleton.free();
                } else {
                    godot_warn!(
                        "Failed to find & free singleton -> {}",
                        RuntimeManager::SINGLETON
                    );
                }
            }
            _ => (),
        }
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
    fn on_level_init(_level: InitLevel) {}

    #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
    fn on_level_deinit(_level: InitLevel) {}
}
