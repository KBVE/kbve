use godot::{ classes::Engine, prelude::* };
use godot::classes::{ Sprite2D, Texture2D };
use papaya::HashMap;
use tokio::sync::mpsc::{ self, UnboundedSender, UnboundedReceiver };
use crate::threads::runtime::RuntimeManager;
use crate::extensions::ecs_extension::{ EcsCommand, TileUpdate, run_ecs_thread };
use crate::manager::game_manager::GameManager;
use crate::find_game_manager;

#[derive(GodotClass)]
#[class(base = Node2D)]
pub struct HexGridManager {
  base: Base<Node2D>,
  materials: HashMap<String, Gd<Texture2D>>,
  ecs_tx: Option<UnboundedSender<EcsCommand>>,
  ecs_rx: Option<UnboundedReceiver<TileUpdate>>,
  rendered_tiles: HashMap<(i32, i32), Gd<Sprite2D>>,
  game_manager: Option<Gd<GameManager>>,
}

#[godot_api]
impl INode2D for HexGridManager {
  fn init(base: Base<Node2D>) -> Self {
    let (ecs_tx, ecs_rx) = mpsc::unbounded_channel::<EcsCommand>();
    let (tile_tx, tile_rx) = mpsc::unbounded_channel::<TileUpdate>();
    let mut runtime = Engine::singleton()
      .get_singleton(RuntimeManager::SINGLETON)
      .expect("[Q] HexGrid Managert could not find RuntimeManager.")
      .cast::<RuntimeManager>();

    runtime.bind_mut().spawn({
      async move {
        run_ecs_thread(tile_tx, ecs_rx, 16, 2.0);
      }
    });

    Self {
      base,
      materials: HashMap::new(),
      rendered_tiles: HashMap::new(),
      ecs_tx: Some(ecs_tx),
      ecs_rx: Some(tile_rx),
      game_manager: None,
    }
  }

  fn ready(&mut self) {
    find_game_manager!(self);
    self.create_shared_textures();
  }

  fn process(&mut self, _delta: f64) {
    let player_pos = if let Some(ref gm) = self.game_manager {
      gm.bind().get_player_position()
    } else {
      Vector2::ZERO
    };

    if let Some(tx) = &self.ecs_tx {
      let _ = tx.send(EcsCommand::UpdatePlayerPosition(player_pos));
    }

    if let Some(ref mut rx) = self.ecs_rx {
      while let Ok(update) = rx.try_recv() {
        self.render_chunk(update);
      }
    }
  }
}

#[godot_api]
impl HexGridManager {
  //TODO - Replace the create-shared-textures with a ShaderCache reference for optimization

  fn create_shared_textures(&mut self) {
    let mut create_texture = |color: Color| {
      let mut image = Image::create(32, 32, false, Image::Format::RGBA8).unwrap();
      image.fill(color);
      Texture2D::create_from_image(&image).unwrap()
    };
    self.materials
      .pin()
      .insert("grass".to_string(), create_texture(Color::from_rgb(0.0, 1.0, 0.0)));
    self.materials
      .pin()
      .insert("water".to_string(), create_texture(Color::from_rgb(0.0, 0.0, 1.0)));
    self.materials.pin().insert("sand".to_string(), create_texture(Color::from_rgb(0.8, 0.6, 0.4)));
  }

  fn render_chunk(&mut self, update: TileUpdate) {
    let pin = self.rendered_tiles.pin();
    for (transform, tile_type) in update.tiles {
      let key = (transform.q, transform.r);
      if pin.contains_key(&key) {
        continue;
      }

      let mut sprite = Sprite2D::new_alloc();
      sprite.set_name(format!("Tile_{}_{}", transform.q, transform.r));
      if let Some(texture) = self.materials.pin().get(&tile_type.0) {
        sprite.set_texture(texture);
      }
      sprite.set_position(transform.world_position);
      self.base_mut().add_child(&sprite);
      drop(pin);
      self.rendered_tiles.pin().insert(key, sprite);
    }
  }
}
