use godot::classes::{
  Button,
  CanvasLayer,
  ICanvasLayer,
  Label,
  Timer,
  TextureRect,
  Texture,
  Texture2D,
  ResourceLoader,
};
use godot::classes::texture_rect::StretchMode;
use godot::prelude::*;
use std::time::{ Duration, Instant };

#[derive(GodotClass)]
#[class(base = CanvasLayer)]
pub struct Maiky {
  base: Base<CanvasLayer>,
  avatar_message: Option<Gd<CanvasLayer>>,
  typewriter_start: Option<Instant>,
}

#[godot_api]
impl ICanvasLayer for Maiky {
  fn init(base: Base<Self::Base>) -> Self {
    Self { base, avatar_message: None, typewriter_start: None }
  }
}

#[godot_api]
impl Maiky {
  #[signal]
  fn start_game();

  #[func]
  pub fn show_avatar_message(
    &mut self,
    message: GString,
    background_image: GString,
    avatar_profile_pic: GString
  ) {
    let mut avatar_message_box = self.get_or_create_avatar_message_box(
      &background_image,
      &avatar_profile_pic
    );

    let mut message_label = avatar_message_box.get_node_as::<Label>("AvatarMessageLabel");
    message_label.set_text("");
    self.start_typewriter_effect(message_label, message);

    let mut timer = Timer::new_alloc();
    timer.set_one_shot(true);
    timer.set_wait_time(30.0);
    timer.connect("timeout", &self.base().callable("hide_avatar_message"));
    self.base_mut().add_child(&timer);
    timer.start();

    avatar_message_box.show();
  }

  fn get_or_create_avatar_message_box(
    &mut self,
    background_image: &GString,
    avatar_profile_pic: &GString
  ) -> Gd<CanvasLayer> {
    if let Some(avatar_box) = &self.avatar_message {
      avatar_box.clone()
    } else {
      let mut new_avatar_box = CanvasLayer::new_alloc();
      new_avatar_box.set_name("AvatarMessageBox");

      let mut background = TextureRect::new_alloc();
      background.set_name("Background");
      background.set_stretch_mode(StretchMode::SCALE);
      background.set_texture(Some(&self.load_texture_2d(background_image)));
      new_avatar_box.add_child(&background);

      let mut avatar_picture = TextureRect::new_alloc();
      avatar_picture.set_name("AvatarProfilePic");
      avatar_picture.set_stretch_mode(StretchMode::KEEP_ASPECT_CENTERED);
      avatar_picture.set_texture(Some(&self.load_texture_2d(avatar_profile_pic)));
      avatar_picture.set_position(Vector2::new(10.0, 10.0));
      new_avatar_box.add_child(&avatar_picture);

      let mut message_label = Label::new_alloc();
      message_label.set_name("AvatarMessageLabel");
      message_label.set_position(Vector2::new(100.0, 50.0));
      new_avatar_box.add_child(&message_label);

      let mut close_button = Button::new_alloc();
      close_button.set_name("CloseButton");
      close_button.set_text("Close");
      close_button.set_position(Vector2::new(250.0, 150.0));
      close_button.connect("pressed", &self.base().callable("hide_avatar_message"));
      new_avatar_box.add_child(&close_button);

      self.base_mut().add_child(&new_avatar_box);
      self.avatar_message = Some(new_avatar_box.clone());

      new_avatar_box
    }
  }

  fn start_typewriter_effect(&mut self, label: Gd<Label>, message: GString) {
    let chars: Vec<char> = message.to_string().chars().collect();
    let chars_string = chars.iter().collect::<String>();
    let args = [Variant::from(chars_string), Variant::from(label.clone()), Variant::from(0)];
    self.base_mut().call_deferred("typewriter_step", &args);
  }

  #[func]
  fn typewriter_step(&mut self, chars: Variant, label: Variant, index: Variant) {
      let chars: String = chars.try_to::<String>().expect("Expected String");
      let mut label: Gd<Label> = label.try_to::<Gd<Label>>().expect("Expected Gd<Label>");
      let index: usize = index.try_to::<i64>().expect("Expected integer") as usize;
  
      if index < chars.len() {
          let mut current_text = label.get_text().to_string();
          current_text.push(chars.chars().nth(index).unwrap());
          label.set_text(&GString::from(current_text));
  
          let next_index = index + 1;
            let args = [
              Variant::from(chars),
              Variant::from(label.clone()),
              Variant::from(next_index as i64),
          ];
          self.base_mut().call_deferred("typewriter_step", &args);
      }
  }

  #[func]
  fn hide_avatar_message(&mut self) {
    if let Some(avatar_box) = self.avatar_message.as_mut() {
      avatar_box.hide();
    }
  }

  fn load_texture_2d(&self, path: &GString) -> Gd<Texture2D> {
    let mut loader = ResourceLoader::singleton();
    loader
      .load(path)
      .and_then(|res| Some(res.cast::<Texture2D>()))
      .unwrap_or_else(|| {
        godot_print!("Failed to load texture at path: {}. Using fallback texture.", path);
        Texture2D::new_gd()
      })
  }

  #[func]
  pub fn example_show_message(&self, text: GString) {
    let mut message_label = self.base().get_node_as::<Label>("MessageLabel");
    message_label.set_text(&text);
    message_label.show();

    let mut timer = self.base().get_node_as::<Timer>("MessageTimer");
    timer.start();
  }

  #[func]
  pub fn show_message(&mut self, text: GString) {
    let mut message_label = if
      let Some(label) = self.base().try_get_node_as::<Label>("MessageLabel")
    {
      label
    } else {
      let mut new_label = Label::new_alloc();
      new_label.set_name("MessageLabel");
      self.base_mut().add_child(&new_label);
      new_label
    };

    message_label.set_text(&text);
    message_label.show();

    let mut message_timer = if
      let Some(timer) = self.base().try_get_node_as::<Timer>("MessageTimer")
    {
      timer
    } else {
      let mut new_timer = Timer::new_alloc();
      new_timer.set_name("MessageTimer");
      new_timer.set_one_shot(true);
      new_timer.set_wait_time(5.0);
      self.base_mut().add_child(&new_timer);
      new_timer.connect("timeout", &self.base().callable("on_message_timer_timeout"));
      new_timer
    };

    message_timer.start();
  }

  pub fn show_game_over(&mut self) {
    self.show_message("Game Over".into());

    let mut timer = self.base().get_tree().unwrap().create_timer(2.0).unwrap();
    timer.connect("timeout", &self.base().callable("show_start_button"));
  }

  #[func]
  fn show_start_button(&mut self) {
    let mut message_label = self.base().get_node_as::<Label>("MessageLabel");
    message_label.set_text("Dodge the\nCreeps!");
    message_label.show();

    let mut button = self.base().get_node_as::<Button>("StartButton");
    button.show();
  }

  #[func]
  pub fn update_score(&self, score: i64) {
    let mut label = self.base().get_node_as::<Label>("ScoreLabel");

    label.set_text(&score.to_string());
  }

  #[func]
  fn on_start_button_pressed(&mut self) {
    let mut button = self.base().get_node_as::<Button>("StartButton");
    button.hide();

    // Note: this works only because `start_game` is a deferred signal.
    // This method keeps a &mut Hud, and start_game calls Main::new_game(), which itself accesses this Hud
    // instance through Gd<Hud>::bind_mut(). It will try creating a 2nd &mut reference, and thus panic.
    // Deferring the signal is one option to work around it.
    self.base_mut().emit_signal("start_game", &[]);
  }

  #[func]
  fn on_message_timer_timeout(&self) {
    let mut message_label = self.base().get_node_as::<Label>("MessageLabel");
    message_label.hide()
  }
}
