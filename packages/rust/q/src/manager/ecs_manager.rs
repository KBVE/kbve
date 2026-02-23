use godot::classes::{Image, ImageTexture, Sprite2D, Texture2D};
use godot::{classes::Engine, prelude::*};

use crate::extensions::ecs_extension::{EcsCommand, TileUpdate, run_ecs_thread};
use crate::find_game_manager;
use crate::manager::game_manager::GameManager;
use crate::threads::runtime::RuntimeManager;
use papaya::HashMap;
use tokio::sync::mpsc::{self, UnboundedReceiver, UnboundedSender};

#[derive(GodotClass)]
#[class(base = Node2D)]
pub struct ECSManager {
    base: Base<Node2D>,
    materials: HashMap<String, Gd<Texture2D>>,
    ecs_tx: Option<UnboundedSender<EcsCommand>>,
    ecs_rx: Option<UnboundedReceiver<TileUpdate>>,
    rendered_tiles: HashMap<(i32, i32), Gd<Sprite2D>>,
    game_manager: Option<Gd<GameManager>>,
}

#[godot_api]
impl INode2D for ECSManager {
    fn init(base: Base<Node2D>) -> Self {
        let (ecs_tx, ecs_rx) = mpsc::unbounded_channel::<EcsCommand>();
        let (tile_tx, tile_rx) = mpsc::unbounded_channel::<TileUpdate>();
        let mut runtime = Engine::singleton()
            .get_singleton(RuntimeManager::SINGLETON)
            .expect("[Q] HexGrid Manager could not find RuntimeManager.")
            .cast::<RuntimeManager>();

        runtime.bind_mut().spawn({
            async move {
                run_ecs_thread(tile_tx, ecs_rx, 8, 32.0);
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
        self.load_textures_from_cache();
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

        let updates: Vec<TileUpdate> = if let Some(ref mut rx) = self.ecs_rx {
            let mut updates = Vec::new();
            while let Ok(update) = rx.try_recv() {
                updates.push(update);
            }
            updates
        } else {
            Vec::new()
        };

        for update in updates {
            self.render_chunk(update);
        }
    }
}

#[godot_api]
impl ECSManager {
    fn load_textures_from_cache(&mut self) {
        if let Some(ref gm) = self.game_manager {
            let mut cache_manager = gm.bind().get_cache_manager();
            let texture_keys = ["grass", "water", "sand"];
            for key in texture_keys {
                let cached = cache_manager
                    .bind()
                    .get_from_texture_cache(GString::from(key));
                if let Some(texture) = cached {
                    self.materials.pin().insert(key.to_string(), texture);
                } else {
                    let mut image =
                        Image::create(32, 32, false, godot::classes::image::Format::RGBA8).unwrap();
                    let color = match key {
                        "grass" => Color::from_rgb(0.0, 1.0, 0.0),
                        "water" => Color::from_rgb(0.0, 0.0, 1.0),
                        "sand" => Color::from_rgb(0.8, 0.6, 0.4),
                        _ => Color::from_rgb(1.0, 1.0, 1.0),
                    };
                    image.fill(color);
                    let texture = ImageTexture::create_from_image(&image).unwrap();
                    let texture_ref: Gd<Texture2D> = texture.upcast();
                    cache_manager
                        .bind_mut()
                        .insert_texture(key, texture_ref.clone());
                    self.materials.pin().insert(key.to_string(), texture_ref);
                }
            }
            godot_print!("[HexGridManager] Loaded textures from CacheManager.");
        } else {
            godot_warn!("[HexGridManager] No GameManager; textures not loaded.");
        }
    }

    fn render_chunk(&mut self, update: TileUpdate) {
        for (transform, tile_type) in update.tiles_to_add {
            let key = (transform.q, transform.r);
            if self.rendered_tiles.pin().contains_key(&key) {
                continue;
            }

            let mut sprite = Sprite2D::new_alloc();
            sprite.set_name(&GString::from(format!(
                "Tile_{}_{}",
                transform.q, transform.r
            )));
            if let Some(texture) = self.materials.pin().get(&tile_type.0) {
                sprite.set_texture(texture);
            }
            sprite.set_position(transform.world_position);
            self.base_mut().add_child(&sprite);
            self.rendered_tiles.pin().insert(key, sprite.clone());
        }

        for key in update.tiles_to_remove {
            if let Some(sprite) = self.rendered_tiles.pin().remove(&key) {
                sprite.clone().free();
            }
        }
    }
}
