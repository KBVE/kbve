use godot::prelude::*;
use godot::classes::{ Camera3D };

pub trait ApproxEq {
  fn is_equal_approx(&self, other: &Vector3) -> bool;
}

impl ApproxEq for Vector3 {
  fn is_equal_approx(&self, other: &Vector3) -> bool {
    const EPSILON: f32 = 1e-5;
    (self.x - other.x).abs() < EPSILON &&
      (self.y - other.y).abs() < EPSILON &&
      (self.z - other.z).abs() < EPSILON
  }
}

#[derive(GodotClass)]
#[class(base = Node)]
pub struct CameraManager {
  base: Base<Node>,
  camera: Option<Gd<Camera3D>>,
}

#[godot_api]
impl INode for CameraManager {
  fn init(base: Base<Node>) -> Self {
    CameraManager {
      base,
      camera: None,
    }
  }

  fn ready(&mut self) {
    self.camera = Some(self.get_or_create_isometric_camera());
    if self.camera.is_some() {
      godot_print!("Isometric camera successfully created or retrieved.");
    } else {
      godot_warn!("Failed to create or retrieve the isometric camera.");
    }
  }
}

#[godot_api]
impl CameraManager {
  #[func]
  pub fn get_camera(&mut self) -> Option<Gd<Camera3D>> {
    if self.camera.is_none() {
      godot_warn!("Camera is not initialized. Attempting to create one...");
      self.camera = Some(self.get_or_create_isometric_camera());
    }
    self.camera.clone()
  }

  #[func]
  pub fn set_transform(&mut self, target: Vector3) {
    if let Some(camera) = &mut self.camera {
      let mut transform = camera.get_global_transform();
      if transform.origin.is_equal_approx(&target) {
        godot_warn!("Camera position and target are identical. Adjusting target.");
        transform = transform.looking_at(target + Vector3::new(0.1, 0.0, 0.1), Vector3::UP, false);
      } else {
        transform = transform.looking_at(target, Vector3::UP, false);
      }

      camera.set_transform(transform);
    } else {
      godot_warn!("Camera is not initialized. Cannot set transform.");
    }
  }

  #[func]
  pub fn get_or_create_isometric_camera(&mut self) -> Gd<Camera3D> {
    let camera_name = "IsometricCamera";

    if let Some(existing_camera) = self.base().try_get_node_as::<Camera3D>(camera_name) {
      godot_print!(
        "IsometricCamera already exists, thus returning the existing camera, from camera.rs"
      );
      return existing_camera;
    }

    let mut camera = Camera3D::new_alloc();
    camera.set_name(camera_name);
    camera.set_orthogonal(10.0, 0.1, 100.0);
    camera.set_position(Vector3::new(10.0, 10.0, 10.0));

    self.base_mut().add_child(&camera);

    let target = Vector3::new(0.0, 0.0, 0.0);

    if !camera.is_inside_tree() {
      godot_warn!("Camera is not yet inside the tree. Deferring transform setup.");
      camera.call_deferred("set_transform", &[target.to_variant()]);
    } else {
      godot_print!("Camera is inside the tree. Setting transform immediately.");
      let mut transform = camera.get_global_transform();
      if transform.origin.is_equal_approx(&target) {
        godot_warn!("Camera position and target are identical. Adjusting target.");
        transform = transform.looking_at(target + Vector3::new(0.1, 0.0, 0.1), Vector3::UP, false);
      } else {
        transform = transform.looking_at(target, Vector3::UP, false);
      }
      camera.set_transform(transform);
    }
    camera
  }
}
