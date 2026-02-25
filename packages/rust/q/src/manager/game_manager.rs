use crate::debug_print;
use godot::classes::ICanvasLayer;
use godot::prelude::*;

use crate::core::bridge::EventBridge;
use crate::data::cache::CacheManager;
use crate::data::user_data::UserDataCache;
use crate::extensions::timer_extension::ClockMaster;
use crate::manager::browser_manager::BrowserManager;
use crate::manager::entity_manager::EntityManager;
use crate::manager::gui_manager::GUIManager;
use crate::manager::music_manager::MusicManager;

#[derive(GodotClass)]
#[class(base = Node)]
pub struct GameManager {
    base: Base<Node>,
    user_data_cache: Option<UserDataCache>,
    cache_manager: Gd<CacheManager>,
    clock_master: Gd<ClockMaster>,
    music_manager: Gd<MusicManager>,
    gui_manager: Gd<GUIManager>,
    browser_manager: Gd<BrowserManager>,
    entity_manager: Gd<EntityManager>,
    event_bridge: Gd<EventBridge>,
}

#[godot_api]
impl INode for GameManager {
    fn init(base: Base<Self::Base>) -> Self {
        debug_print!("[GameManager] Initializing...");

        let user_data_cache = Some(UserDataCache::new());

        let clock_master = Gd::from_init_fn(|base| ClockMaster::init(base));
        let cache_manager = Gd::from_init_fn(|base| CacheManager::init(base));
        let music_manager = Gd::from_init_fn(|base| MusicManager::init(base));
        let gui_manager = Gd::from_init_fn(|base| GUIManager::init(base));
        let browser_manager = Gd::from_init_fn(|base| BrowserManager::init(base));
        let entity_manager = Gd::from_init_fn(|base| EntityManager::init(base));
        let event_bridge = Gd::from_init_fn(|base| EventBridge::init(base));

        Self {
            base,
            user_data_cache,
            cache_manager,
            clock_master,
            music_manager,
            gui_manager,
            browser_manager,
            entity_manager,
            event_bridge,
        }
    }

    fn ready(&mut self) {
        debug_print!("[GameManager] Ready! Adding children...");

        let cache_manager = self.cache_manager.clone();
        let clock_master = self.clock_master.clone();
        let music_manager = self.music_manager.clone();
        let gui_manager = self.gui_manager.clone();
        let browser_manager = self.browser_manager.clone();
        let entity_manager = self.entity_manager.clone();
        let event_bridge = self.event_bridge.clone();

        {
            let mut base = self.base_mut();
            base.add_child(&cache_manager.upcast::<Node>());
            base.add_child(&clock_master.upcast::<Node>());
            base.add_child(&music_manager.upcast::<Node>());
            base.add_child(&gui_manager.upcast::<Node>());
            base.add_child(&browser_manager.upcast::<Node>());
            base.add_child(&entity_manager.upcast::<Node>());
            base.add_child(&event_bridge.upcast::<Node>());
        }

        debug_print!("[GameManager] All children added successfully.");
    }
}

#[godot_api]
impl GameManager {
    #[signal]
    fn game_started();

    #[signal]
    fn game_paused();

    #[signal]
    fn game_resumed();

    #[signal]
    fn game_exited();

    // [INTERNAL] Rust functions
    pub fn internal_get_music_manager(&self) -> &Gd<MusicManager> {
        &self.music_manager
    }

    pub fn internal_get_clock_master(&self) -> &Gd<ClockMaster> {
        &self.clock_master
    }

    pub fn internal_get_cache_manager(&self) -> &Gd<CacheManager> {
        &self.cache_manager
    }

    #[func]
    pub fn get_music_manager(&self) -> Gd<MusicManager> {
        self.music_manager.clone()
    }

    #[func]
    pub fn get_clock_master(&self) -> Gd<ClockMaster> {
        self.clock_master.clone()
    }

    #[func]
    pub fn get_cache_manager(&self) -> Gd<CacheManager> {
        self.cache_manager.clone()
    }

    #[func]
    pub fn load_user_settings(&mut self) {
        let Some(user_data_cache) = self.user_data_cache.as_mut() else {
            godot_error!("[GameManager] ERROR: user_data_cache is None!");
            return;
        };

        let file_path = "user://settings.json";
        debug_print!("[GameManager] Loading settings from: {}", file_path);

        match user_data_cache.load_from_file(file_path) {
            Some(data) => {
                debug_print!("[GameManager] Settings loaded successfully.");
                drop(data);
            }
            None => {
                godot_warn!("[GameManager] Settings file not found. Creating default settings...");
                user_data_cache.save_new_user_data(file_path);
            }
        }
    }

    #[func]
    pub fn save_user_settings(&mut self) {
        let file_path = "user://settings.json";

        let Some(user_data_cache) = self.user_data_cache.as_mut() else {
            godot_error!("[GameManager] ERROR: user_data_cache is None! Cannot save settings.");
            return;
        };

        let Some(user_data) = user_data_cache.load_user_data() else {
            godot_error!("[GameManager] ERROR: Could not retrieve user data from cache!");
            return;
        };

        user_data_cache.save_to_file(file_path, &user_data);

        debug_print!("[GameManager] User settings saved.");
    }

    #[func]
    pub fn update_setting(&mut self, key: GString, value: Variant) {
        let key_str = key.to_string();
        let user_data_cache = self.user_data_cache.get_or_insert_with(UserDataCache::new);

        user_data_cache.insert(&key_str, value.clone());
        self.save_user_settings();

        debug_print!("[GameManager] Updated setting: {} -> {:?}", key_str, value);
    }

    #[func]
    fn start_game(&mut self) {
        self.base_mut().emit_signal("game_started", &[]);
        debug_print!("[GameManager] Game Started!");
    }

    #[func]
    fn pause_game(&mut self) {
        self.base_mut().emit_signal("game_paused", &[]);
        if let Some(mut scene_tree) = self.base().get_tree() {
            scene_tree.set_pause(true);
        }
        debug_print!("[GameManager] Game Paused.");
    }

    #[func]
    fn resume_game(&mut self) {
        self.base_mut().emit_signal("game_resumed", &[]);
        if let Some(mut scene_tree) = self.base().get_tree() {
            scene_tree.set_pause(false);
        }
        debug_print!("[GameManager] Game Resumed.");
    }

    #[func]
    fn exit_game(&mut self) {
        self.base_mut().emit_signal("game_exited", &[]);
        debug_print!("[GameManager] Exiting Game...");

        if let Some(mut scene_tree) = self.base().get_tree() {
            scene_tree.quit();
        }
    }

    #[func]
    pub fn get_player_position(&self) -> Vector2 {
        self.entity_manager.bind().get_local_player_position()
    }
}
