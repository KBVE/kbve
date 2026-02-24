use crate::data::abstract_data_map::AbstractDataMap;
use dashmap::DashMap;
use godot::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserData {
    pub username: String,
    pub email: String,
    pub opacity: f32,
    pub fullscreen: bool,
    pub theme: Option<String>,
    pub global_music_volume: f32,
    pub global_effects_volume: f32,
    pub global_sfx_volume: f32,
}

impl AbstractDataMap for UserData {}

impl UserData {
    pub fn new(
        username: &str,
        email: &str,
        opacity: f32,
        fullscreen: bool,
        theme: Option<String>,
        global_music_volume: f32,
        global_effects_volume: f32,
        global_sfx_volume: f32,
    ) -> Self {
        Self {
            username: username.to_string(),
            email: email.to_string(),
            opacity,
            fullscreen,
            theme,
            global_music_volume,
            global_effects_volume,
            global_sfx_volume,
        }
    }
}

pub struct UserDataCache {
    map: DashMap<String, Variant>,
}

impl UserDataCache {
    pub fn new() -> Self {
        Self {
            map: DashMap::new(),
        }
    }

    pub fn insert<T: ToGodot>(&self, key: &str, value: T) {
        self.map.insert(key.to_string(), value.to_variant());
    }

    pub fn get<T: FromGodot>(&self, key: &str) -> Option<T> {
        self.map
            .get(&key.to_string())
            .map(|r| T::from_variant(r.value()))
    }

    pub fn contains(&self, key: &str) -> bool {
        self.map.contains_key(&key.to_string())
    }

    pub fn remove(&self, key: &str) -> Option<Variant> {
        self.map.remove(&key.to_string()).map(|(_, v)| v)
    }

    pub fn update<T: ToGodot>(&self, key: &str, value: T) -> bool {
        if self.contains(key) {
            self.insert(key, value);
            true
        } else {
            false
        }
    }

    // User Saving + File
    pub fn save_new_user_data(&mut self, file_path: &str) -> UserData {
        godot_warn!("[UserDataCache] Creating new default user data...");

        let default_data = UserData::new(
            "Player",
            "guest@kbve.com",
            0.55,
            false,
            Some("dark".to_string()),
            0.0,
            0.0,
            0.0,
        );

        self.save_user_data(&default_data);
        self.save_to_file(file_path, &default_data);

        godot_print!("[UserDataCache] New user data saved successfully.");

        default_data
    }

    pub fn save_to_file(&self, file_path: &str, user_data: &UserData) {
        if user_data.to_save_gfile_json(file_path) {
            godot_print!("[UserDataCache] Successfully saved user settings.");
        } else {
            godot_error!(
                "[UserDataCache] ERROR: Failed to save user settings to `{}`!",
                file_path
            );
        }
    }

    pub fn load_from_file(&mut self, file_path: &str) -> Option<UserData> {
        godot_print!("[UserDataCache] Attempting to load file: {}", file_path);

        if let Some(user_data) = UserData::from_load_gfile_json(file_path) {
            godot_print!("[UserDataCache] Successfully loaded user settings.");
            self.save_user_data(&user_data);
            Some(user_data)
        } else {
            godot_error!(
                "[UserDataCache] ERROR: Failed to load from file: {}!",
                file_path
            );
            None
        }
    }

    pub fn save_user_data(&mut self, user_data: &UserData) {
        godot_print!("[UserDataCache] Storing user data in cache...");
        let new_map = user_data.to_variant_map();
        self.map = new_map;
        godot_print!("[UserDataCache] User data successfully cached.");
    }

    pub fn load_user_data(&self) -> Option<UserData> {
        UserData::from_variant_map(&self.map)
    }
}
