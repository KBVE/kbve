use crate::debug_print;
use dashmap::DashMap;
use godot::classes::{AudioStream, AudioStreamPlayer};
use godot::prelude::*;

#[derive(GodotClass)]
#[class(base = Node)]
pub struct MusicManager {
    base: Base<Node>,
    audio: Option<Gd<AudioStreamPlayer>>,
    secondary_audio: Option<Gd<AudioStreamPlayer>>,
    effects: Option<Gd<AudioStreamPlayer>>,
    sfx: Option<Gd<AudioStreamPlayer>>,
    audio_cache: DashMap<String, Gd<AudioStream>>,
    global_music_volume: f32,
    global_effects_volume: f32,
    global_sfx_volume: f32,
    blend_state: Option<BlendState>,
}

struct BlendState {
    active_name: StringName,
    idle_name: StringName,
    start_volume: f32,
    target_volume: f32,
    duration: f32,
    elapsed: f32,
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
            audio_cache: DashMap::new(),
            global_music_volume: 0.0,
            global_effects_volume: 0.0,
            global_sfx_volume: 0.0,
            blend_state: None,
        }
    }

    fn ready(&mut self) {
        self.audio = self.get_or_create_audio_player("PrimaryAudioPlayer");
        self.secondary_audio = self.get_or_create_audio_player("SecondaryAudioPlayer");
        self.effects = self.get_or_create_audio_player("EffectsAudioPlayer");
        self.sfx = self.get_or_create_audio_player("SFXAudioPlayer");

        let callable = self.base().callable("play_effect");
        self.base_mut().connect("effect_play_requested", &callable);

        let sfx_callable = self.base().callable("play_sfx");
        self.base_mut().connect("sfx_play_requested", &sfx_callable);
    }

    fn process(&mut self, delta: f64) {
        let blend_done = if let Some(ref mut blend) = self.blend_state {
            blend.elapsed += delta as f32;
            let t = (blend.elapsed / blend.duration).clamp(0.0, 1.0);

            let active_vol = blend.start_volume + (-80.0 - blend.start_volume) * t;
            let idle_vol = -80.0 + (blend.target_volume - (-80.0)) * t;

            let active_name = blend.active_name.clone();
            let idle_name = blend.idle_name.clone();

            {
                let base = self.base_mut();
                let mut active_player = base.get_node_as::<AudioStreamPlayer>(active_name.arg());
                active_player.set_volume_db(active_vol);

                let mut idle_player = base.get_node_as::<AudioStreamPlayer>(idle_name.arg());
                idle_player.set_volume_db(idle_vol);
            }

            if t >= 1.0 {
                let base = self.base_mut();
                let mut active_player = base.get_node_as::<AudioStreamPlayer>(active_name.arg());
                active_player.stop();
                true
            } else {
                false
            }
        } else {
            false
        };

        if blend_done {
            self.blend_state = None;
        }
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

    fn get_or_cache_audio(&self, audio_path: &str) -> Option<Gd<AudioStream>> {
        if let Some(cached) = self.audio_cache.get(audio_path) {
            return Some(cached.value().clone());
        }

        let audio_stream: Gd<AudioStream> = load::<AudioStream>(audio_path);
        if !audio_stream.is_instance_valid() {
            godot_warn!("Failed to load AudioStream from path: {}", audio_path);
            return None;
        }

        self.audio_cache
            .insert(audio_path.to_string(), audio_stream.clone());

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
        debug_print!(
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
        debug_print!(
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
        debug_print!("Global SFX volume set to: {} dB", self.global_sfx_volume);
        let volume_variant = self.global_sfx_volume.to_variant();
        self.base_mut()
            .emit_signal("global_sfx_volume_changed", &[volume_variant]);
    }

    #[func]
    pub fn play_effect(&mut self, effect_path: GString) {
        let effect_path = effect_path.to_string();
        let audio_stream = self.get_or_cache_audio(&effect_path);
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

    #[func]
    pub fn play_sfx(&mut self, sfx_path: GString) {
        let sfx_path = sfx_path.to_string();
        let audio_stream = self.get_or_cache_audio(&sfx_path);
        if let Some(sfx_player) = self.sfx.as_mut() {
            if let Some(audio_stream) = audio_stream {
                if sfx_player.is_playing() {
                    return;
                }

                sfx_player.set_stream(&audio_stream);
                sfx_player.set_volume_db(self.global_sfx_volume);
                sfx_player.play();
            }
        } else {
            godot_warn!("SFX audio player is not initialized.");
        }
    }

    #[func]
    pub fn adjust_sfx_volume(&mut self, volume_db: f32) {
        self.global_sfx_volume = volume_db.clamp(-80.0, 0.0);
        debug_print!("SFX volume adjusted to: {} dB", self.global_sfx_volume);

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
        debug_print!("Music volume adjusted to: {} dB", self.global_music_volume);

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
        debug_print!(
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

        let (active_name, idle_name) = if primary_is_playing {
            (primary_name.clone(), secondary_name.clone())
        } else {
            (secondary_name.clone(), primary_name.clone())
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

        self.blend_state = Some(BlendState {
            active_name: active_name.into(),
            idle_name: idle_name.into(),
            start_volume: self.global_music_volume,
            target_volume: self.global_music_volume,
            duration: blend_duration,
            elapsed: 0.0,
        });
    }
}
