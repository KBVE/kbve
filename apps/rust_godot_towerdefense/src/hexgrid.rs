use godot::prelude::*;
use godot::classes::{ Timer, AudioStream };

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
  fn get_or_create_audio_player(&mut self, name: &str) -> Option<Gd<AudioStreamPlayer>> {
    if let Some(player) = self.base().try_get_nod e_as::<AudioStreamPlayer>(name) {
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
      idle_instance.set_volume_db(0.0);
      idle_instance.play();
    }
  }

  #[func]
  pub fn on_fade_complete(&mut self) {
    let (primary_name, secondary_name, primary_is_playing) = match
      (&self.audio, &self.secondary_audio)
    {
      (Some(primary), Some(secondary)) =>
        (primary.get_name(), secondary.get_name(), primary.is_playing()),
      _ => {
        return;
      }
    };

    let (active_name, idle_name) = if primary_is_playing {
      (primary_name, secondary_name)
    } else {
      (secondary_name, primary_name)
    };

    let mut active_player = self.base_mut().get_node_as::<AudioStreamPlayer>(active_name.arg());
    active_player.stop();

    let mut idle_player = self.base_mut().get_node_as::<AudioStreamPlayer>(idle_name.arg());
    idle_player.set_volume_db(0.0);
  }

  #[func]
  pub fn blend_music(&mut self, next_track_path: GString, blend_duration: f32) {
    let (primary_name, secondary_name, primary_is_playing) = match
      (&self.audio, &self.secondary_audio)
    {
      (Some(primary), Some(secondary)) =>
        (primary.get_name(), secondary.get_name(), primary.is_playing()),
      _ => {
        godot_warn!("Audio players are not initialized for blending.");
        return;
      }
    };

    let idle_name = if primary_is_playing { secondary_name } else { primary_name };

    let audio_stream: Gd<AudioStream> = load::<AudioStream>(&next_track_path);

    {
      let mut base = self.base_mut();
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
      let mut fade_timer = base.try_get_node_as::<Timer>("fade_timer").unwrap_or_else(|| {
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
  fn ready(&mut self) {
    self.audio = self.get_or_create_audio_player("HexAudioPlayer");
    self.secondary_audio = self.get_or_create_audio_player("SecondaryAudioPlayer");
  }
}
