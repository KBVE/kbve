use crate::manager::game_manager::GameManager;
use godot::classes::{AudioStream, AudioStreamPlayer, Timer};
use godot::prelude::*;

#[derive(GodotClass)]
#[class(base = Node)]
pub struct MusicManager {
    base: Base<Node>,
    audio: Option<Gd<AudioStreamPlayer>>,
    secondary_audio: Option<Gd<AudioStreamPlayer>>,
    effects: Option<Gd<AudioStreamPlayer>>,
    sfx: Option<Gd<AudioStreamPlayer>>,
    game_manager: Option<Gd<GameManager>>,
    global_music_volume: f32,
    global_effects_volume: f32,
    global_sfx_volume: f32,
}

#[godot_api]
impl INode for MusicManager {
    fn init(base: Base<Node>) -> Self {
        MusicManager {
            base,
            audio: None,
            secondary_audio: None,
            effects: None,
            sfx: None,
            game_manager: None,
            global_music_volume: 0.0,
            global_effects_volume: 0.0,
            global_sfx_volume: 0.0,
        }
    }

    fn ready(&mut self) {
        godot_print!("[MusicManager] Ready! Searching for GameManager...");

        if let Some(parent) = self.base().get_parent() {
            let game_manager = parent.cast::<GameManager>();

            if game_manager.clone().upcast::<Node>().is_instance_valid() {
                godot_print!("[MusicManager] GameManager found! Linking...");
                self.game_manager = Some(game_manager);
            } else {
                godot_warn!("[MusicManager] Parent is not a GameManager!");
            }
        } else {
            godot_warn!("[MusicManager] Parent Node not found!");
        }

        self.audio = self.get_or_create_audio_player("PrimaryAudioPlayer");
        self.secondary_audio = self.get_or_create_audio_player("SecondaryAudioPlayer");
        self.effects = self.get_or_create_audio_player("EffectsAudioPlayer");
        self.sfx = self.get_or_create_audio_player("SFXAudioPlayer");

        let callable = self.base().callable("play_effect");
        self.base_mut().connect("effect_play_requested", &callable);

        let sfx_callable = self.base().callable("play_sfx");
        self.base_mut().connect("sfx_play_requested", &sfx_callable);
    }
}

#[godot_api]
impl MusicManager {
    #[signal]
    fn global_music_volume_changed(volume_db: f32);

    #[signal]
    fn global_effects_volume_changed(volume_db: f32);

    #[signal]
    fn global_sfx_volume_changed(volume_db: f32);

    #[signal]
    fn effect_play_requested(effect_path: GString);

    #[signal]
    fn sfx_play_requested(sfx_path: GString);

    //  [INTERNAL]
    fn internal_get_or_create_audio_cache(&mut self, audio_path: &str) -> Option<Gd<AudioStream>> {
        let game_manager = self.game_manager.as_ref()?.bind();
        let cache_manager = game_manager.internal_get_cache_manager().bind();
        if let Some(audio) = cache_manager.internal_audio_cache().get(audio_path) {
            return Some(audio);
        }

        let audio_stream: Gd<AudioStream> = load::<AudioStream>(audio_path);
        if !audio_stream.is_instance_valid() {
            godot_warn!("Failed to load AudioStream from path: {}", audio_path);
            return None;
        }

        cache_manager
            .internal_audio_cache()
            .insert(audio_path, audio_stream.clone());

        Some(audio_stream)
    }

    #[func]
    pub fn request_play_effect(&mut self, effect_path: GString) {
        self.base_mut()
            .emit_signal("effect_play_requested", &[effect_path.to_variant()]);
    }

    #[func]
    pub fn request_play_sfx(&mut self, sfx_path: GString) {
        self.base_mut()
            .emit_signal("sfx_play_requested", &[sfx_path.to_variant()]);
    }

    #[func]
    pub fn set_global_music_volume(&mut self, volume_db: f32) {
        self.global_music_volume = volume_db.clamp(-80.0, 0.0);
        godot_print!(
            "Global music volume set to: {} dB",
            self.global_music_volume
        );
        let volume_variant = self.global_music_volume.to_variant();

        self.base_mut()
            .emit_signal("global_music_volume_changed", &[volume_variant]);
    }

    #[func]
    pub fn set_global_effects_volume(&mut self, volume_db: f32) {
        self.global_effects_volume = volume_db.clamp(-80.0, 0.0);
        godot_print!(
            "Global effects volume set to: {} dB",
            self.global_effects_volume
        );
        let volume_variant = self.global_effects_volume.to_variant();

        self.base_mut()
            .emit_signal("global_effects_volume_changed", &[volume_variant]);
    }

    #[func]
    pub fn set_global_sfx_volume(&mut self, volume_db: f32) {
        self.global_sfx_volume = volume_db.clamp(-80.0, 0.0);
        godot_print!("Global SFX volume set to: {} dB", self.global_sfx_volume);
        let volume_variant = self.global_sfx_volume.to_variant();
        self.base_mut()
            .emit_signal("global_sfx_volume_changed", &[volume_variant]);
    }

    #[func]
    pub fn play_effect(&mut self, effect_path: GString) {
        let effect_path = effect_path.to_string();
        let audio_stream = self.get_or_cache_effect(&effect_path);
        if let Some(effects_player) = self.effects.as_mut() {
            if let Some(audio_stream) = audio_stream {
                if effects_player.is_playing() {
                    return;
                }

                effects_player.set_stream(&audio_stream);
                effects_player.set_volume_db(self.global_effects_volume);
                effects_player.play();
            }
        } else {
            godot_warn!("Effects audio player is not initialized.");
        }
    }

    fn get_or_cache_sfx(&mut self, sfx_path: &str) -> Option<Gd<AudioStream>> {
        self.internal_get_or_create_audio_cache(sfx_path)
    }

    fn get_or_cache_effect(&mut self, effect_path: &str) -> Option<Gd<AudioStream>> {
        self.internal_get_or_create_audio_cache(effect_path)
    }

    #[func]
    pub fn adjust_sfx_volume(&mut self, volume_db: f32) {
        self.global_sfx_volume = volume_db.clamp(-80.0, 0.0);
        godot_print!("SFX volume adjusted to: {} dB", self.global_sfx_volume);

        if let Some(sfx_player) = self.sfx.as_mut() {
            sfx_player.set_volume_db(self.global_sfx_volume);
        }

        let volume_variant = self.global_sfx_volume.to_variant();
        self.base_mut()
            .emit_signal("global_sfx_volume_changed", &[volume_variant]);
    }

    #[func]
    pub fn adjust_music_volume(&mut self, volume_db: f32) {
        self.global_music_volume = volume_db.clamp(-80.0, 0.0);
        godot_print!("Music volume adjusted to: {} dB", self.global_music_volume);

        if let Some(audio) = self.audio.as_mut() {
            audio.set_volume_db(self.global_music_volume);
        }

        if let Some(secondary_audio) = self.secondary_audio.as_mut() {
            secondary_audio.set_volume_db(self.global_music_volume);
        }

        let volume_variant = self.global_music_volume.to_variant();
        self.base_mut()
            .emit_signal("global_music_volume_changed", &[volume_variant]);
    }

    #[func]
    pub fn adjust_effects_volume(&mut self, volume_db: f32) {
        self.global_effects_volume = volume_db.clamp(-80.0, 0.0);
        godot_print!(
            "Effects volume adjusted to: {} dB",
            self.global_effects_volume
        );

        if let Some(effects) = self.effects.as_mut() {
            effects.set_volume_db(self.global_effects_volume);
        }

        let volume_variant = self.global_effects_volume.to_variant();
        self.base_mut()
            .emit_signal("global_effects_volume_changed", &[volume_variant]);
    }

    fn get_or_create_audio_player(&mut self, name: &str) -> Option<Gd<AudioStreamPlayer>> {
        if let Some(player) = self.base().try_get_node_as::<AudioStreamPlayer>(name) {
            Some(player)
        } else {
            let mut new_player = AudioStreamPlayer::new_alloc();
            new_player.set_name(name);
            new_player.set_autoplay(false);
            self.base_mut().add_child(&new_player);
            Some(new_player)
        }
    }

    #[func]
    pub fn load_music(&mut self, track_path: GString) {
        if let (Some(primary), Some(secondary)) = (&self.audio, &self.secondary_audio) {
            let idle = if !primary.is_playing() {
                primary
            } else if !secondary.is_playing() {
                secondary
            } else {
                godot_warn!("Both audio players are active. Cannot load a new track.");
                return;
            };

            let audio_stream: Gd<AudioStream> = load::<AudioStream>(&track_path);
            if !audio_stream.is_instance_valid() {
                godot_warn!("Failed to load audio stream from path: {}", track_path);
                return;
            }

            let mut idle_instance = idle.clone();
            idle_instance.set_stream(&audio_stream.clone());
            idle_instance.set_volume_db(self.global_music_volume);
            idle_instance.play();
        }
    }

    #[func]
    pub fn on_fade_complete(&mut self) {
        let (primary_name, secondary_name, primary_is_playing) =
            match (&self.audio, &self.secondary_audio) {
                (Some(primary), Some(secondary)) => (
                    primary.get_name(),
                    secondary.get_name(),
                    primary.is_playing(),
                ),
                _ => {
                    return;
                }
            };

        let (active_name, idle_name) = if primary_is_playing {
            (primary_name, secondary_name)
        } else {
            (secondary_name, primary_name)
        };

        let mut active_player = self
            .base_mut()
            .get_node_as::<AudioStreamPlayer>(active_name.arg());
        active_player.stop();

        let mut idle_player = self
            .base_mut()
            .get_node_as::<AudioStreamPlayer>(idle_name.arg());
        idle_player.set_volume_db(self.global_music_volume);
    }

    #[func]
    pub fn blend_music(&mut self, next_track_path: GString, blend_duration: f32) {
        let (primary_name, secondary_name, primary_is_playing) =
            match (&self.audio, &self.secondary_audio) {
                (Some(primary), Some(secondary)) => (
                    primary.get_name(),
                    secondary.get_name(),
                    primary.is_playing(),
                ),
                _ => {
                    godot_warn!("Audio players are not initialized for blending.");
                    return;
                }
            };

        let idle_name = if primary_is_playing {
            secondary_name
        } else {
            primary_name
        };

        let audio_stream: Gd<AudioStream> = load::<AudioStream>(&next_track_path);

        {
            let base = self.base_mut();
            let idle_player = base.get_node_as::<AudioStreamPlayer>(idle_name.arg());
            if idle_player.is_instance_valid() {
                let mut idle_player = idle_player;
                idle_player.set_stream(&audio_stream);
                idle_player.set_volume_db(-80.0);
                idle_player.play();
            } else {
                godot_warn!("Idle player not found.");
                return;
            }
        }

        {
            let mut base = self.base_mut();
            let mut fade_timer = base
                .try_get_node_as::<Timer>("fade_timer")
                .unwrap_or_else(|| {
                    let mut new_timer = Timer::new_alloc();
                    new_timer.set_name("fade_timer");
                    new_timer.set_one_shot(true);
                    base.add_child(&new_timer);
                    new_timer
                });

            fade_timer.set_wait_time(blend_duration as f64);
            fade_timer.start();

            if !fade_timer.is_connected("timeout", &base.callable("on_fade_complete")) {
                fade_timer.connect("timeout", &base.callable("on_fade_complete"));
            }
        }
    }
}
