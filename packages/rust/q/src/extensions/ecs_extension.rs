use bevy_ecs::prelude::*;
use godot::prelude::*;
use papaya::HashMap;
use rstar::{ RTree, RTreeObject, AABB, Point };
use tokio::sync::mpsc::{ UnboundedSender, UnboundedReceiver };

#[derive(Component, Debug, Clone)]
pub struct TransformComponent {
  pub q: i32,
  pub r: i32,
  pub world_position: Vector2,
}

impl TransformComponent {
  pub fn new(q: i32, r: i32, hex_size: f32) -> Self {
    let hex_width = 2.0 * hex_size;
    let hex_height = (3.0_f32).sqrt() * hex_size;
    let x = (q as f32) * (hex_width * 0.75);
    let y = (r as f32) * hex_height + (if q % 2 == 0 { 0.0 } else { hex_height / 2.0 });
    Self {
      q,
      r,
      world_position: Vector2::new(x, y),
    }
  }
}

#[derive(Component, Debug, Clone)]
pub struct TileTypeComponent(pub String);

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct ChunkCoord {
  pub cx: i32,
  pub cy: i32,
}

impl ChunkCoord {
  pub fn from_world(q: i32, r: i32, chunk_size: i32) -> Self {
    Self {
      cx: q.div_euclid(chunk_size),
      cy: r.div_euclid(chunk_size),
    }
  }
}

#[derive(Debug, Clone, PartialEq)]
pub struct TileEntity {
  pub position: [f32; 2], // [x, y]
  pub entity: Entity,
}

impl Point for TileEntity {
  type Scalar = f32;
  const DIMENSIONS: usize = 2;

  fn generate(mut f: impl FnMut(usize) -> Self::Scalar) -> Self {
    TileEntity {
      position: [f(0), f(1)],
      entity: Entity::PLACEHOLDER,
    }
  }
  fn nth(&self, index: usize) -> Self::Scalar {
    self.position[index]
  }
  fn nth_mut(&mut self, index: usize) -> &mut Self::Scalar {
    &mut self.position[index]
  }
}

// impl RTreeObject for TileEntity {
//   type Envelope = AABB<[f32; 2]>;
//   fn envelope(&self) -> Self::Envelope {
//     AABB::from_point(self.position)
//   }
// }

#[derive(Debug)]
pub enum EcsCommand {
  UpdatePlayerPosition(Vector2),
  Shutdown,
}

#[derive(Debug)]
pub struct TileUpdate {
  pub chunk: ChunkCoord,
  pub tiles: Vec<(TransformComponent, TileTypeComponent)>,
}

pub fn run_ecs_thread(
  tx: UnboundedSender<TileUpdate>,
  mut rx: UnboundedReceiver<EcsCommand>,
  chunk_size: i32,
  hex_size: f32
) {
  let mut world = World::new();
  let mut schedule = Schedule::default();
  schedule.add_systems(|| {});

  let mut loaded_chunks = HashMap::<ChunkCoord, Vec<Entity>>::new();
  let mut spatial_index = RTree::<TileEntity>::new();
  let mut player_chunk = ChunkCoord { cx: 0, cy: 0 };
  let view_radius = 2;

  while let Some(cmd) = rx.blocking_recv() {
    match cmd {
      EcsCommand::UpdatePlayerPosition(pos) => {
        let q = (pos.x / (hex_size * 1.5)).round() as i32;
        let r = (pos.y / (hex_size * (3.0_f32).sqrt())).round() as i32;
        let new_chunk = ChunkCoord::from_world(q, r, chunk_size);

        if new_chunk != player_chunk {
          player_chunk = new_chunk;
          update_chunks(
            &mut world,
            &mut loaded_chunks,
            &mut spatial_index,
            &tx,
            player_chunk,
            chunk_size,
            hex_size,
            view_radius
          );
        }
      }
      EcsCommand::Shutdown => {
        return;
      }
    }
    schedule.run(&mut world);
  }
}

fn update_chunks(
  world: &mut World,
  loaded_chunks: &mut HashMap<ChunkCoord, Vec<Entity>>,
  spatial_index: &mut RTree<TileEntity>,
  tx: &UnboundedSender<TileUpdate>,
  player_chunk: ChunkCoord,
  chunk_size: i32,
  hex_size: f32,
  view_radius: i32
) {
  let mut new_chunks = HashMap::new();
  let mut tiles_to_send = Vec::new();

  for dx in -view_radius..=view_radius {
    for dy in -view_radius..=view_radius {
      let chunk = ChunkCoord {
        cx: player_chunk.cx + dx,
        cy: player_chunk.cy + dy,
      };
      if !loaded_chunks.contains_key(&chunk) {
        let tiles = generate_chunk(world, spatial_index, &chunk, chunk_size, hex_size);
        tiles_to_send.extend(tiles.clone());
        let _ = tx.send(TileUpdate { chunk: chunk.clone(), tiles });
        new_chunks.insert(chunk, Vec::new());
      } else {
        if let Some(entities) = loaded_chunks.remove(&chunk) {
          new_chunks.insert(chunk, entities);
        }
      }
    }
  }

  for (chunk, entities) in loaded_chunks.drain() {
    for entity in entities {
      if let Some(transform) = world.get::<TransformComponent>(entity) {
        spatial_index.remove(
          &(TileEntity {
            position: [transform.world_position.x, transform.world_position.y],
            entity,
          })
        );
      }
      world.despawn(entity);
    }
  }
  *loaded_chunks = new_chunks;
}

fn generate_chunk(
  world: &mut World,
  spatial_index: &mut RTree<TileEntity>,
  chunk: &ChunkCoord,
  chunk_size: i32,
  hex_size: f32
) -> Vec<(TransformComponent, TileTypeComponent)> {
  let mut tiles = Vec::new();
  for q in chunk.cx * chunk_size..(chunk.cx + 1) * chunk_size {
    for r in chunk.cy * chunk_size..(chunk.cy + 1) * chunk_size {
      let transform = TransformComponent::new(q, r, hex_size);
      let tile_type = match (q + r) % 3 {
        0 => "grass",
        1 => "water",
        _ => "sand",
      };
      let entity = world.spawn((transform.clone(), TileTypeComponent(tile_type.to_string()))).id();
      spatial_index.insert(TileEntity {
        position: [transform.world_position.x, transform.world_position.y],
        entity,
      });
      tiles.push((transform, TileTypeComponent(tile_type.to_string())));
    }
  }
  tiles
}
