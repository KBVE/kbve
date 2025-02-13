use godot::classes::{
  Button,
  CanvasLayer,
  ICanvasLayer,
  Label,
  Timer,
  TextureRect,
  Texture2D,
  ResourceLoader,
  RichTextLabel,
  Control,
};
use godot::classes::texture_rect::StretchMode;
use godot::classes::tween::{ TransitionType, EaseType };
use godot::classes::control::LayoutPreset;
use godot::classes::text_server::AutowrapMode;
use godot::classes::texture_rect::ExpandMode;
use godot::classes::window::Flags as WindowFlags;

use godot::prelude::*;

use crate::data::shader_data::ShaderCache;
use crate::data::cache::ResourceCache;
use crate::extensions::ui_extension::*;
use crate::extensions::timer_extension::{ ClockMaster, TimerExt };
use crate::data::uxui_data::{ UxUiElement, MenuButtonData };
use crate::connect_signal;
use crate::manager::game_manager::GameManager;

#[cfg(target_os = "macos")]
use crate::macos::macos_gui_options::enable_mac_transparency;

#[derive(GodotClass)]
#[class(base = CanvasLayer)]
pub struct Maiky {
  base: Base<CanvasLayer>,
  clock_master: Option<Gd<ClockMaster>>,
  texture_cache: ResourceCache<Texture2D>,
  canvas_layer_cache: ResourceCache<CanvasLayer>,
  ui_cache: ResourceCache<Control>,
  shader_cache: Gd<ShaderCache>,
}

#[godot_api]
impl ICanvasLayer for Maiky {
  fn init(base: Base<Self::Base>) -> Self {
    let shader_cache = Gd::from_init_fn(|base| ShaderCache::init(base));

    Self {
      base,
      clock_master: None,
      texture_cache: ResourceCache::new(),
      canvas_layer_cache: ResourceCache::new(),
      ui_cache: ResourceCache::new(),
      shader_cache,
    }
  }

  fn ready(&mut self) {
    connect_signal!(self, "exit_game", "on_exit_game");
    self.enable_transparency();

    if let Some(parent) = self.base().get_parent() {
      let mut game_manager = parent.cast::<GameManager>();

      if game_manager.clone().upcast::<Node>().is_instance_valid() {
        godot_print!("[Maiky] GameManager found! Attempting to retrieve ClockMaster...");

        let clock_master_variant = game_manager.call("get_clock_master", &[]);

        match clock_master_variant.try_to::<Gd<ClockMaster>>() {
          Ok(clock_master) => {
            self.clock_master = Some(clock_master.clone());
            godot_print!("[Maiky] Successfully linked to ClockMaster!");
          }
          Err(err) => {
            godot_warn!("[Maiky] Failed to retrieve ClockMaster from GameManager! {:?}", err);
          }
        }
      } else {
        godot_warn!("[Maiky] GameManager is not valid!");
      }
    } else {
      godot_warn!("[Maiky] Parent Node not found!");
    }
  }
}

#[godot_api]
impl Maiky {
  #[signal]
  fn exit_game() {}

  #[signal]
  fn ui_element_requested(key: GString);

  #[signal]
  fn ui_element_added(key: GString, element: Variant);

  #[func]
  fn enable_transparency(&mut self) {
    if let Some(mut viewport) = self.base().get_viewport() {
      viewport.set_transparent_background(true);
      godot_print!("[Maiky] Viewport transparency enabled.");
    }

    if let Some(mut window) = self.base().get_window() {
      window.set_flag(WindowFlags::ALWAYS_ON_TOP, true);
      godot_print!("[Maiky] Window set to always on top.");
    }

    #[cfg(target_os = "macos")]
    {
      enable_mac_transparency();
      //enable_mac_always_on_top();
    }
  }

  #[func]
  fn m_signal(&mut self, signal_name: StringName, params: Vec<Variant>) {
    if self.base().has_signal(&signal_name.clone()) {
      self.base_mut().emit_signal(&signal_name, &params);
    } else {
      godot_warn!("Signal '{}' not found in Maiky!", signal_name);
    }
  }

  #[func]
  fn on_exit_game(&mut self) {
    godot_print!("Exit Game signal received.");

    if let Some(mut scene_tree) = self.base().get_tree() {
      scene_tree.quit();
    } else {
      godot_warn!("Failed to get the scene tree for quitting the game.");
    }
  }

  #[func]
  pub fn request_ui_element(&mut self, key: GString) -> Option<Gd<Control>> {
    let key_str = key.to_string();
    self.ui_cache
      .get(key_str.as_str())
      .map(|gd| gd.clone())
      .or_else(|| {
        self.base_mut().emit_signal("ui_element_requested", &[key.to_variant()]);
        None
      })
  }

  #[func]
  pub fn store_ui_element(&mut self, key: GString, element: Gd<Control>) {
    self.ui_cache.insert(key.to_string().as_str(), element.clone());
    self.base_mut().emit_signal("ui_element_added", &[key.to_variant(), element.to_variant()]);
  }

  fn build_menu_buttons(
    &mut self,
    container: &mut Gd<Control>,
    key: GString,
    button_image: GString,
    buttons_json: GString
  ) {
    let elements = match UxUiElement::from_gstring(buttons_json) {
      Ok(items) => items,
      Err(e) => {
        godot_error!("Failed to parse JSON for menu buttons: {:?}", e);
        return;
      }
    };

    for (i, element) in elements.into_iter().enumerate() {
      if let Ok(button_data) = MenuButtonData::try_from(element) {
        self.create_menu_button(container, &button_image, &button_data, &key, i);
      }
    }
  }

  fn create_menu_button(
    &mut self,
    container: &mut Gd<Control>,
    button_image: &GString,
    button_data: &MenuButtonData,
    key: &GString,
    index: usize
  ) {
    let button_size = Vector2::new(200.0, 80.0);
    let offset_y = (index as f32) * 100.0;

    let key_str = key.to_string();
    let button_container_name = format!("ButtonContainer_{}_{}", key_str, index);
    let button_name = format!("MenuButton_{}_{}", key_str, index);

    let mut button_container = self.ui_cache
      .get(&button_container_name)
      .unwrap_or_else(|| {
        self
          .create_button_background_panel(button_image, button_size)
          .with_name(&button_container_name)
          .with_anchors_preset(LayoutPreset::CENTER_TOP)
          .with_anchor_and_offset(Side::TOP, 0.0, offset_y)
          .with_custom_minimum_size(button_size)
      });

    let mut button = self.ui_cache
      .get_as::<Button>(&button_name)
      .unwrap_or_else(|| {
        Button::new_alloc()
          .with_name(&button_name)
          .with_text(&GString::from(button_data.title.clone()))
          .with_anchors_preset(LayoutPreset::FULL_RECT)
          .with_anchor_and_offset(Side::TOP, 0.0, 0.0)
          .with_custom_minimum_size(button_size)
      });

    let signal_name = StringName::from(button_data.callback.as_str());

    let params_variants: Vec<Variant> = button_data.params
      .iter()
      .map(|p| Variant::from(p.to_string()))
      .collect();

    let callable = self
      .base_mut()
      .callable("m_signal")
      .bind(&[Variant::from(signal_name.clone()), Variant::from(params_variants)]);

    if button.is_connected("pressed", &callable) {
      button.disconnect("pressed", &callable);
    }
    button.connect("pressed", &callable);

    if button.get_parent().is_none() {
      button_container.add_child(&button);
    }

    if button_container.get_parent().is_none() {
      container.add_child(&button_container);
    }

    self.ui_cache.insert(&button_container_name, button_container.clone());
    self.ui_cache.insert_upcast(&button_name, button.clone());
  }

  #[func]
  pub fn show_menu_canvas(
    &mut self,
    key: GString,
    background_image: GString,
    button_image: GString,
    buttons_json: GString
  ) {
    let mut menu_layer = if
      let Some(mut cached_menu) = self.canvas_layer_cache.get(key.to_string().as_str())
    {
      if
        let Some(mut old_container) = cached_menu.try_get_node_as::<Control>(
          format!("ButtonContainer_{}", key).as_str()
        )
      {
        cached_menu.remove_child(&old_container);
      }

      cached_menu
    } else {
      let mut new_layer = CanvasLayer::new_alloc().with_cache("MenuCanvas", &key).with_responsive();

      let mut background_panel = self
        .create_rounded_panel(&background_image)
        .with_cache("MenuBackground", &key)
        .with_anchors_preset(LayoutPreset::FULL_RECT);

      new_layer.add_child(&background_panel);

      self.canvas_layer_cache.insert(key.to_string().as_str(), new_layer.clone());
      self.base_mut().add_child(&new_layer);
      new_layer
    };

    let mut container = Control::new_alloc()
      .with_cache("ButtonContainer", &key)
      .with_anchors_preset(LayoutPreset::CENTER_TOP)
      .with_anchor_and_offset(Side::TOP, 0.0, 50.0)
      .with_custom_minimum_size(Vector2::new(300.0, 400.0));

    self.build_menu_buttons(&mut container, key.clone(), button_image, buttons_json);
    menu_layer.add_child(&container);
    menu_layer.show();
  }

  #[func]
  pub fn show_avatar_message(
    &mut self,
    key: GString,
    message: GString,
    background_image: GString,
    avatar_profile_pic: GString
  ) {
    let mut avatar_message_box = self.get_or_create_avatar_message_box(
      &key,
      &message,
      &background_image,
      &avatar_profile_pic
    );

    godot_print!("[Debug] show_avatar_message() called with key: {}", key);

    if let Some(clock_master) = &mut self.clock_master {
      godot_print!("[Debug] ClockMaster found, ensuring timer for key: {}", key);
      let mut timer = clock_master.bind_mut().ensure_timer(key.clone(), 30.0);
      godot_print!("[Debug] Timer retrieved successfully for key: {}", key);
      timer.with_connection(self.to_gd().upcast(), "hide_avatar_message",  &[key.to_variant()]).start();
    } else {
      godot_warn!("[Maiky] ClockMaster was not found!");
    }
  }

  fn get_or_create_avatar_message_box(
    &mut self,
    key: &GString,
    message: &GString,
    background_image: &GString,
    avatar_profile_pic: &GString
  ) -> Gd<CanvasLayer> {
    let avatar_box_key = format!("AvatarMessageBox_{}", key);

    if let Some(avatar_box) = self.canvas_layer_cache.get(avatar_box_key.as_str()) {
      let mut avatar_box_mut = avatar_box.clone();
      self.update_message_label(&mut avatar_box_mut, key, message);
      avatar_box_mut.show();
      self.canvas_layer_cache.insert(avatar_box_key.as_str(), avatar_box_mut.clone());
      return avatar_box_mut;
    }

    let mut new_avatar_box = CanvasLayer::new_alloc();
    new_avatar_box.set_name(avatar_box_key.as_str());
    new_avatar_box.set_offset(Vector2::new(0.0, 0.0));
    new_avatar_box.set_scale(Vector2::new(0.65, 0.65));
    new_avatar_box.set_follow_viewport(true);
    new_avatar_box.set_follow_viewport_scale(1.0);

    let mut background_panel = self.create_rounded_panel(background_image);
    background_panel.set_name(format!("BackgroundPanel_{}", key).as_str());
    background_panel.set_anchors_and_offsets_preset(LayoutPreset::FULL_RECT);

    let mut close_button = Button::new_alloc();
    close_button.set_name(format!("Close_{}", key).as_str());
    close_button.set_text("Close");
    close_button.set_anchors_preset(LayoutPreset::BOTTOM_RIGHT);
    close_button.set_anchor_and_offset(Side::RIGHT, 1.0, -20.0);
    close_button.set_anchor_and_offset(Side::BOTTOM, 1.0, -20.0);
    close_button.set_custom_minimum_size(Vector2::new(100.0, 50.0));
    close_button.connect(
      "pressed",
      &self.base().callable("hide_avatar_message").bind(&[key.to_variant()])
    );
    background_panel.add_child(&close_button);

    let mut avatar_container = Control::new_alloc();
    avatar_container.set_name(format!("AvatarProfilePicContainer_{}", key).as_str());
    avatar_container.set_anchors_preset(LayoutPreset::CENTER_LEFT);
    avatar_container.set_custom_minimum_size(Vector2::new(200.0, 200.0));
    avatar_container.set_anchor_and_offset(Side::LEFT, 0.0, 20.0);
    avatar_container.set_anchor_and_offset(Side::BOTTOM, 1.0, -20.0);

    let mut avatar_picture = TextureRect::new_alloc();
    avatar_picture.set_name(format!("AvatarProfilePic_{}", key).as_str());
    avatar_picture.set_texture(Some(&self.load_texture_2d(avatar_profile_pic)));
    avatar_picture.set_expand_mode(ExpandMode::FIT_HEIGHT_PROPORTIONAL);
    avatar_picture.set_anchors_preset(LayoutPreset::FULL_RECT);
    avatar_picture.set_custom_minimum_size(Vector2::new(200.0, 200.0));

    avatar_container.add_child(&avatar_picture);
    background_panel.add_child(&avatar_container);
    new_avatar_box.add_child(&background_panel);

    let mut avatar_message_panel = self.create_black_rounded_panel_with_label(&message);
    avatar_message_panel.set_name(format!("AvatarMessagePanel_{}", key).as_str());
    new_avatar_box.add_child(&avatar_message_panel);

    self.canvas_layer_cache.insert(avatar_box_key.as_str(), new_avatar_box.clone());
    self.base_mut().add_child(&new_avatar_box);
    new_avatar_box.show();
    new_avatar_box
  }

  fn update_message_label(
    &mut self,
    avatar_box: &mut Gd<CanvasLayer>,
    key: &GString,
    new_message: &GString
  ) {
    let message_panel_name = format!("AvatarMessagePanel_{}", key);

    if let Some(mut old_panel) = avatar_box.try_get_node_as::<Control>(message_panel_name.as_str()) {
      avatar_box.remove_child(&old_panel);
    }

    let mut new_panel = self.create_black_rounded_panel_with_label(new_message);
    new_panel.set_name(message_panel_name.as_str());
    avatar_box.add_child(&new_panel);
  }

  #[func]
  fn placeholder_default_callback(&self) {
    godot_print!("[Debug] -> Maiky.rs Callback Placeholder.");
  }

  #[func]
  fn hide_canvas(&mut self, canvas_type: GString, key: GString) {
    let formatted_key = format!("{}_{}", canvas_type, key);
    if let Some(mut canvas) = self.base().try_get_node_as::<CanvasLayer>(formatted_key.as_str()) {
      canvas.hide();
    } else {
      godot_print!("Warning: {} '{}' not found.", canvas_type, formatted_key);
    }
  }

  #[func]
  fn hide_avatar_message(&mut self, key: GString) {
    self.hide_canvas(GString::from("AvatarMessageBox"), key);
  }

  #[func]
  fn hide_menu_canvas(&mut self, key: GString) {
    self.hide_canvas(GString::from("MenuCanvas"), key);
  }

  fn load_texture_2d(&mut self, path: &GString) -> Gd<Texture2D> {
    if let Some(texture) = self.texture_cache.get(path.to_string().as_str()) {
      return texture.clone();
    }

    let mut loader = ResourceLoader::singleton();
    let texture = loader
      .load(path)
      .and_then(|res| Some(res.cast::<Texture2D>()))
      .unwrap_or_else(|| {
        godot_print!("Failed to load texture at path: {}. Using fallback texture.", path);
        Texture2D::new_gd()
      });

    self.texture_cache.insert(path.to_string().as_str(), texture.clone());
    texture
  }

  fn create_button_background_panel(
    &mut self,
    button_image: &GString,
    size: Vector2
  ) -> Gd<Control> {
    let mut container = Control::new_alloc();

    container.set_name("ButtonBackgroundContainer");
    container.set_anchors_and_offsets_preset(LayoutPreset::FULL_RECT);
    container.set_custom_minimum_size(size);

    let mut background = TextureRect::new_alloc();
    background.set_name("ButtonBackgroundImage");
    background.set_expand_mode(ExpandMode::FIT_WIDTH_PROPORTIONAL);
    background.set_texture(Some(&self.load_texture_2d(button_image)));
    background.set_anchors_and_offsets_preset(LayoutPreset::FULL_RECT);

    container.add_child(&background);

    container
  }

  fn create_rounded_panel(&mut self, background_image: &GString) -> Gd<Control> {
    let mut container = Control::new_alloc();
    container.set_name("RoundedPanelContainer");
    container.set_anchors_and_offsets_preset(LayoutPreset::FULL_RECT);

    let mut background = TextureRect::new_alloc();
    background.set_name("BackgroundImage");
    background.set_stretch_mode(StretchMode::SCALE);

    background.set_texture(Some(&self.load_texture_2d(background_image)));
    background.set_anchors_and_offsets_preset(LayoutPreset::FULL_RECT);
    container.add_child(&background);

    container
  }

  fn create_black_rounded_panel_with_label(&mut self, message: &GString) -> Gd<Control> {
    let mut container = Control::new_alloc();
    container.set_name("TextPanelContainer");
    container.set_anchors_and_offsets_preset(LayoutPreset::FULL_RECT);

    // let mut panel = self.create_black_rounded_panel();
    let mut panel = self.shader_cache.bind_mut().create_black_rounded_panel();
    panel.set_anchors_and_offsets_preset(LayoutPreset::FULL_RECT);
    container.add_child(&panel);

    let mut message_label = RichTextLabel::new_alloc();
    message_label.set_name("AvatarMessageLabel");
    // message_label.set_anchors_and_offsets_preset(LayoutPreset::FULL_RECT);
    message_label.set_anchors_preset(LayoutPreset::CENTER_TOP);
    message_label.set_anchor_and_offset(Side::LEFT, 0.0, 20.0);
    message_label.set_anchor_and_offset(Side::RIGHT, 1.0, -20.0);
    message_label.set_anchor_and_offset(Side::TOP, 0.0, 20.0);
    message_label.set_anchor_and_offset(Side::BOTTOM, 1.0, -20.0);

    message_label.add_theme_constant_override("margin_left", 10);
    message_label.add_theme_constant_override("margin_right", 10);
    message_label.add_theme_constant_override("margin_top", 10);
    message_label.add_theme_constant_override("margin_bottom", 10);

    message_label.set_scroll_active(false);
    message_label.set_scroll_follow(false);
    message_label.set_fit_content(true);
    message_label.set_autowrap_mode(AutowrapMode::WORD_SMART);
    message_label.set_use_bbcode(true);
    message_label.add_theme_font_size_override("normal_font_size", 40);
    message_label.push_outline_size(6);
    message_label.push_outline_color(Color::from_rgb(0.0, 0.0, 0.0));
    message_label.set_visible_ratio(0.0);
    message_label.append_text(message);
    container.add_child(&message_label);

    let char_count = message.len();
    let base_duration = 2.0;
    let extra_duration = (char_count / 30) as f64;
    let duration = base_duration + extra_duration;

    if let Some(mut tween) = container.create_tween() {
      if
        let Some(mut tweener) = tween.tween_property(
          &message_label.upcast::<Object>(),
          "visible_ratio",
          &Variant::from(1.0),
          duration
        )
      {
        tweener.set_ease(EaseType::IN_OUT);
        tweener.set_trans(TransitionType::LINEAR);
      }
    } else {
      godot_print!("Failed to create Tween.");
    }

    container
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
