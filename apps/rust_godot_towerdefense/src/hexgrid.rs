use godot::prelude::*;

#[derive(GodotClass)]
#[class(base = Node)]
pub struct HexGridScene {
  base: Base<Node>,
  map_root: Option<Gd<Node3D>>,
  audio: Option<Gd<AudioStreamPlayer>>,
  secondary_audio: Option<Gd<AudioStreamPlayer>>,
  effects: Option<Gd<AudioStreamPlayer>>,
}

#[godot_api]
impl HexGridScene {
  #[func]
  fn _ready(&mut self) {
    self.init_audio_player("HexAudioPlayer", &mut self.audio);
    self.init_audio_player("SecondaryAudioPlayer", &mut self.secondary_audio);
  }

  fn init_audio_player(&mut self, name: &str, player: &mut Option<Gd<AudioStreamPlayer>>) {
    let mut audio_player = if
      let Some(existing) = self.base().try_get_node_as::<AudioStreamPlayer>(name)
    {
      existing
    } else {
      let mut new_player = AudioStreamPlayer::new_alloc();
      new_player.set_name(name);
      new_player.set_autoplay(false);
      self.base_mut().add_child(&new_player);
      new_player
    };

    *player = Some(audio_player);
  }

  pub fn load_music(&mut self, track_path: &str) {
    if let (Some(primary), Some(secondary)) = (&self.audio, &self.secondary_audio) {
      let idle = if !primary.is_playing() {
        primary
      } else if !secondary.is_playing() {
        secondary
      } else {
        godot_warn!("Both audio players are active. Cannot load a new track.");
        return;
      };

      if let Some(audio_stream) = load::<AudioStream>(track_path) {
        idle.set_stream(audio_stream);
        idle.set_volume_db(0.0);
        idle.set_loop(true);
        idle.play(0.0);
      } else {
        godot_warn!("Failed to load track: {}", track_path);
      }
    }
  }

  pub fn blend_music(&mut self, next_track_path: &str, blend_duration: f32) {
    if let (Some(primary), Some(secondary)) = (&self.audio, &self.secondary_audio) {
      let (active, idle) = if primary.is_playing() {
        (primary, secondary)
      } else {
        (secondary, primary)
      };

      if let Some(audio_stream) = load::<AudioStream>(next_track_path) {
        idle.set_stream(audio_stream);
        idle.set_volume_db(-80.0);
        idle.set_loop(true);
        idle.play(0.0);

        let base = self.base();
        base
          .create_timer("fade_out", blend_duration, false)
          .connect("timeout", base.callable("on_fade_out_complete"));
        base
          .create_timer("fade_in", blend_duration, false)
          .connect("timeout", base.callable("on_fade_in_complete"));
      } else {
        godot_warn!("Failed to load new track: {}", next_track_path);
      }
    } else {
      godot_warn!("Audio players are not initialized for blending.");
    }
  }

  #[func]
  pub fn on_fade_out_complete(&mut self) {
    if let (Some(primary), Some(secondary)) = (&self.audio, &self.secondary_audio) {
      let active = if primary.is_playing() { primary } else { secondary };
      active.stop();
      active.set_stream(None);
    }
  }

  #[func]
  pub fn on_fade_in_complete(&mut self) {
    if let (Some(primary), Some(secondary)) = (&self.audio, &self.secondary_audio) {
      let idle = if !primary.is_playing() { primary } else { secondary };
      idle.set_volume_db(0.0);
    }
  }
}

#[godot_api]
impl INode for HexGridScene {
  fn init(base: Base<Node>) -> Self {
    HexGridScene {
      base,
      map_root: None,
      audio: None,
      secondary_audio: None,
      effects: None,
    }
  }
}
