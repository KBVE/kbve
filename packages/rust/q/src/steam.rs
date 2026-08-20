//! Steamworks bridge. `QSteam` registers on every client build so the class
//! list is identical with and without the `steam` feature; only the feature
//! carries the SDK, so the itch flavor answers `is_available() == false` and
//! every call degrades to a no-op instead of a missing class.

use godot::classes::Node;
use godot::prelude::*;

#[cfg(feature = "steam")]
struct Backend {
    client: steamworks::Client,
}

#[derive(GodotClass)]
#[class(base=Node)]
pub struct QSteam {
    base: Base<Node>,
    /// 480 is Valve's Spacewar test app; replace once the partner app exists.
    #[export]
    app_id: u32,
    #[cfg(feature = "steam")]
    backend: Option<Backend>,
}

#[godot_api]
impl INode for QSteam {
    fn init(base: Base<Node>) -> Self {
        Self {
            base,
            app_id: 480,
            #[cfg(feature = "steam")]
            backend: None,
        }
    }

    fn ready(&mut self) {
        self.start();
    }

    fn process(&mut self, _delta: f64) {
        #[cfg(feature = "steam")]
        if let Some(backend) = &self.backend {
            backend.client.run_callbacks();
        }
    }
}

#[godot_api]
impl QSteam {
    #[signal]
    fn steam_initialized(available: bool);

    #[func]
    fn is_available(&self) -> bool {
        #[cfg(feature = "steam")]
        {
            self.backend.is_some()
        }
        #[cfg(not(feature = "steam"))]
        {
            false
        }
    }

    #[func]
    fn steam_id(&self) -> GString {
        #[cfg(feature = "steam")]
        if let Some(backend) = &self.backend {
            return GString::from(backend.client.user().steam_id().raw().to_string().as_str());
        }
        GString::new()
    }

    #[func]
    fn persona_name(&self) -> GString {
        #[cfg(feature = "steam")]
        if let Some(backend) = &self.backend {
            return GString::from(backend.client.friends().name().as_str());
        }
        GString::new()
    }

    #[func]
    fn overlay_enabled(&self) -> bool {
        #[cfg(feature = "steam")]
        if let Some(backend) = &self.backend {
            return backend.client.utils().is_overlay_enabled();
        }
        false
    }

    #[func]
    fn set_achievement(&self, name: GString) -> bool {
        #[cfg(feature = "steam")]
        if let Some(backend) = &self.backend {
            let stats = backend.client.user_stats();
            if stats.achievement(&name.to_string()).set().is_ok() {
                return stats.store_stats().is_ok();
            }
            return false;
        }
        let _ = name;
        false
    }

    #[func]
    fn clear_achievement(&self, name: GString) -> bool {
        #[cfg(feature = "steam")]
        if let Some(backend) = &self.backend {
            let stats = backend.client.user_stats();
            if stats.achievement(&name.to_string()).clear().is_ok() {
                return stats.store_stats().is_ok();
            }
            return false;
        }
        let _ = name;
        false
    }

    #[func]
    fn set_rich_presence(&self, key: GString, value: GString) -> bool {
        #[cfg(feature = "steam")]
        if let Some(backend) = &self.backend {
            return backend
                .client
                .friends()
                .set_rich_presence(&key.to_string(), Some(&value.to_string()));
        }
        let _ = (key, value);
        false
    }

    #[func]
    fn clear_rich_presence(&self) {
        #[cfg(feature = "steam")]
        if let Some(backend) = &self.backend {
            backend.client.friends().set_rich_presence("", None);
        }
    }
}

impl QSteam {
    #[cfg(feature = "steam")]
    fn start(&mut self) {
        match steamworks::Client::init_app(self.app_id) {
            Ok(client) => {
                let own_id = client.user().steam_id().raw();
                client.user_stats().request_user_stats(own_id);
                godot_print!("QSteam: initialized (app {})", self.app_id);
                self.backend = Some(Backend { client });
                self.signals().steam_initialized().emit(true);
            }
            Err(err) => {
                godot_warn!("QSteam: init failed (app {}): {err}", self.app_id);
                self.signals().steam_initialized().emit(false);
            }
        }
    }

    #[cfg(not(feature = "steam"))]
    fn start(&mut self) {
        self.signals().steam_initialized().emit(false);
    }
}
