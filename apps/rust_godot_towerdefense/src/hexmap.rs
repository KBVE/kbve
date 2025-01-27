use godot::prelude::*;
use godot::classes::{
  Node3D,
  MeshInstance3D,
  StandardMaterial3D,
  DirectionalLight3D,
  SurfaceTool,
  Mesh,
  ArrayMesh,
};
use godot::classes::light_3d::Param;
use godot::classes::mesh::PrimitiveType;
use bevy_ecs::prelude::*;
use rstar::{ RTree, RTreeObject, AABB, Point };
use std::collections::{ HashMap, HashSet };
use crate::camera::CameraManager;

#[derive(Component, Debug, Clone)]
pub struct TransformComponent {
  pub q: i32,
  pub r: i32,
  pub world_position: Vector3,
}

impl TransformComponent {
  pub fn new(q: i32, r: i32, hex_size: f32) -> Self {

    let hex_width = 2.0 * hex_size; 
    let hex_height = (3.0_f32).sqrt() * hex_size;
    
    let x = (q as f32) * (hex_width * 0.75);
    let z = (r as f32) * hex_height + if q % 2 == 0 { 0.0 } else { hex_height / 2.0 }; 
    let y = 0.0;
    Self {
      q,
      r,
      world_position: Vector3::new(x, y, z),
    }
  }
}

#[derive(Component, Debug)]
pub struct TileTypeComponent(pub String);

#[derive(Debug, Clone, PartialEq)]
struct TileEntity {
  pub position: [f32; 2],
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

#[derive(GodotClass)]
#[class(base = Node)]
pub struct HexMapManager {
  base: Base<Node>,
  world: World,
  entity_map: HashMap<(i32, i32), Entity>,
  spatial_index: RTree<TileEntity>,
  camera_manager: Option<Gd<CameraManager>>,
  materials: HashMap<String, Gd<StandardMaterial3D>>,
  shared_plane_mesh: Option<Gd<ArrayMesh>>,
  rendered_tiles: HashSet<Entity>,
}

#[godot_api]
impl INode for HexMapManager {
  fn init(base: Base<Node>) -> Self {
    HexMapManager {
      base,
      world: World::new(),
      entity_map: HashMap::new(),
      spatial_index: RTree::new(),
      camera_manager: None,
      materials: HashMap::new(),
      shared_plane_mesh: None,
      rendered_tiles: HashSet::new(),
    }
  }

  fn ready(&mut self) {
    godot_print!("HexMapManager is ready, v0 doe. REF Journal 01-24");
    self.find_camera_manager();

    if self.camera_manager.is_some() {
      godot_print!("CameraManager found. Proceeding with HexMapManager setup.");
      self.add_or_get_light();

      self.shared_plane_mesh = Some(self.create_hex_mesh(2.0));
      self.create_shared_materials();
      self.setup_honeycomb_grid(10, 10, 2.0); // Setup the hex grid
      //self.setup_diamond_shaped_grid(10,3.0);
    } else {
      godot_warn!("CameraManager not found. HexMapManager setup halted.");
    }
  }

  fn process(&mut self, _delta: f64) {
    if let Some(camera) = self.get_camera() {
      let visible_tiles = self.query_visible_tiles(camera);
      self.render_tiles(visible_tiles);
    }
  }
}

#[godot_api]
impl HexMapManager {
  #[func]
  pub fn get_mouse_position(&mut self) -> Vector3 {
    if let Some(camera) = self.get_camera() {
      if let Some(viewport) = self.base().get_viewport() {
        let mouse_pos = viewport.get_mouse_position();
        return camera.upcast_ref::<Camera3D>().project_ray_origin(mouse_pos);
      }
    }
    Vector3::ZERO
  }

  #[func]
  pub fn find_camera_manager(&mut self) {
    if let Some(camera_manager) = self.base().try_get_node_as::<CameraManager>("CameraManager") {
      self.camera_manager = Some(camera_manager);
      godot_print!("CameraManager found and linked.");
    } else {
      godot_warn!("CameraManager not found. Creating a new one...");
      let mut camera_manager = CameraManager::new_alloc();
      camera_manager.set_name("CameraManager");
      self.base_mut().add_child(&camera_manager);
      self.camera_manager = Some(camera_manager);
    }
  }

  fn create_hex_mesh(&self, radius: f32) -> Gd<ArrayMesh> {
    let mut surface_tool = SurfaceTool::new_gd();
    surface_tool.begin(PrimitiveType::TRIANGLES);

    let angle_step = (60.0_f32).to_radians();
    let mut vertices = Vec::new();

    godot_print!("Generating hexagon mesh with radius = {}", radius);

    for i in 0..6 {
      let angle = (i as f32) * angle_step;
      let x = radius * angle.cos();
      let z = radius * angle.sin();
      vertices.push(Vector3::new(x, 0.0, z));
      godot_print!("Vertex {}: x = {}, z = {}", i, x, z);
    }

    let center = Vector3::new(0.0, 0.0, 0.0);

    for i in 0..6 {
      surface_tool.add_vertex(center); // Center point of a hexy
      surface_tool.add_vertex(vertices[i]); // Current vertex
      surface_tool.add_vertex(vertices[(i + 1) % 6]); // +n vertex
      godot_print!("Triangle {}: center -> vertex {} -> vertex {}", i, i, (i + 1) % 6);
    }

    let mesh = surface_tool.commit().expect("Failed to create hexagonal mesh");
    godot_print!("Hexagon mesh generated successfully");
    mesh
  }

  fn add_or_get_light(&mut self) {
    if let Some(light) = self.base().try_get_node_as::<DirectionalLight3D>("GridLight") {
      godot_print!("GridLight already exists in the scene.");
      return;
    }

    let mut light = DirectionalLight3D::new_alloc();
    light.set_name("GridLight");
    light.set_color(Color::from_rgb(1.0, 0.95, 0.8));
    light.set_shadow(true);
    light.set_param(Param::ENERGY, 3.0);

    let mut transform = light.get_transform();
    transform = transform.looking_at(
      Vector3::new(-1.0, -1.0, -1.0).normalized(),
      Vector3::UP,
      false
    );
    light.set_transform(transform);

    self.base_mut().add_child(&light);
    godot_print!("GridLight added to the scene.");
  }

  fn create_shared_materials(&mut self) {
    let mut create_material = |color: Color| {
      let mut material = StandardMaterial3D::new_gd();
      material.set_albedo(color);
      material.set_metallic(0.0);
      material.set_roughness(0.8);
      material
    };

    self.materials.insert("grass".to_string(), create_material(Color::from_rgb(0.0, 1.0, 0.0)));
    self.materials.insert("water".to_string(), create_material(Color::from_rgb(0.0, 0.0, 1.0)));
    self.materials.insert("sand".to_string(), create_material(Color::from_rgb(0.8, 0.6, 0.4)));

    godot_print!("Shared materials created for tiles.");
  }

  pub fn get_camera(&mut self) -> Option<Gd<Camera3D>> {
    if let Some(camera_manager) = &mut self.camera_manager {
      return camera_manager.bind_mut().get_camera();
    }
    godot_warn!("CameraManager is not initialized.");
    None
  }

  fn setup_diamond_shaped_grid(&mut self, size: i32, hex_size: f32) {
    let hex_width = 2.0 * hex_size;
    let hex_height = (3.0_f32).sqrt() * hex_size;

    let horizontal_spacing = hex_width * 0.75;
    let vertical_spacing = hex_height * 0.5;

    for q in -size..=size {
      let r1 = (-size).max(-q - size);
      let r2 = size.min(-q + size);
      for r in r1..=r2 {
        let x = (q as f32) * horizontal_spacing;
        let z = (r as f32) * vertical_spacing * 2.0;

        godot_print!("Placing tile: q={}, r={} -> x={}, z={}", q, r, x, z);

        let tile_type = if (q + r) % 2 == 0 { "grass" } else { "water" };
        self.create_tile(q, r, tile_type.to_string(), hex_size);

        if let Some(entity) = self.entity_map.get(&(q, r)) {
          if let Some(mut transform) = self.world.get_mut::<TransformComponent>(*entity) {
            transform.world_position = Vector3::new(x, 0.0, z);
          }
        }
      }
    }
  }

  fn setup_honeycomb_grid(&mut self, rows: i32, cols: i32, hex_size: f32) {
    for r in 0..rows {
        for q in 0..cols {
            let tile_type = if (q + r) % 2 == 0 { "grass" } else { "water" };
            self.create_tile(q, r, tile_type.to_string(), hex_size);
        }
    }
}


  fn is_valid_hex(&self, x: i32, y: i32) -> bool {
    x + y <= 10 && x + y >= -10
  }

  fn create_tile(&mut self, q: i32, r: i32, tile_type: String, hex_size: f32) {

    let transform = TransformComponent::new(q, r, hex_size);
    let entity = self.world.spawn((transform.clone(), TileTypeComponent(tile_type.clone()))).id();
    self.entity_map.insert((q, r), entity);

    self.spatial_index.insert(TileEntity {
      position: [transform.world_position.x, transform.world_position.z],
      entity,
    });

    godot_print!("Created tile at axial coords ({}, {}) with type {}", q, r, tile_type);
  }

  fn query_visible_tiles(&self, camera: Gd<Camera3D>) -> Vec<TileEntity> {
    let camera_position = camera.get_position();

    let max_view_distance = 5.0;
d
    let neighbors = self.spatial_index
      .nearest_neighbor_iter(
        &(TileEntity {
          position: [camera_position.x, camera_position.z],
          entity: Entity::PLACEHOLDER,
        })
      )
      .filter(|tile| {
        let dx = tile.position[0] - camera_position.x;
        let dz = tile.position[1] - camera_position.z;
        let distance_squared = dx * dx + dz * dz;
        distance_squared <= max_view_distance * max_view_distance
      })
      .cloned()
      .collect();

    neighbors
  }

  fn render_tiles(&mut self, visible_tiles: Vec<TileEntity>) {
    for tile in visible_tiles {
      if self.rendered_tiles.contains(&tile.entity) {
        continue;
      }

      let tile_node_name = format!("Tile_{}_{}", tile.position[0], tile.position[1]);
      if let Some(shared_plane_mesh) = &self.shared_plane_mesh {
        let mut mesh_instance = MeshInstance3D::new_alloc();
        mesh_instance.set_name(tile_node_name.as_str());
        mesh_instance.set_mesh(shared_plane_mesh);

        if
          let Some(TileTypeComponent(tile_type)) = self.world.get::<TileTypeComponent>(tile.entity)
        {
          if let Some(material) = self.materials.get(tile_type.as_str()) {
            mesh_instance.set_material_override(material);
          } else {
            let mut default_material = StandardMaterial3D::new_gd();
            default_material.set_albedo(Color::from_rgb(1.0, 1.0, 1.0));
            mesh_instance.set_material_override(&default_material);
          }
        }

        let position = Vector3::new(tile.position[0], 0.0, tile.position[1]);
        mesh_instance.set_position(position);

        self.base_mut().add_child(&mesh_instance);
      }

      self.rendered_tiles.insert(tile.entity);

      godot_print!("Rendered tile at position: ({}, {})", tile.position[0], tile.position[1]);
    }
  }
}
