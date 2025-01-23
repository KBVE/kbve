use godot::prelude::*;
use godot::classes::{Timer, Camera3D};

#[derive(GodotClass)]
#[class(base = Node)]
pub struct CameraManager {
  base: Base<Node>,
}

#[godot_api]
impl INode for CameraManager {
  fn init(base: Base<Node>) -> Self {
    CameraManager { base }
  }

  fn ready(&mut self) {
    self.get_or_create_isometric_camera();
  }
}

#[godot_api]
impl CameraManager {


  #[func]
  pub fn get_or_create_isometric_camera(&mut self) -> Gd<Camera3D> {
    let camera_name = "IsometricCamera";

    if let Some(existing_camera) = self.base().try_get_node_as::<Camera3D>(camera_name) {
      return existing_camera;
    }

    let mut camera = Camera3D::new_alloc();
    camera.set_name(camera_name);
    camera.set_orthogonal(10.0, 0.1, 100.0);
    camera.set_position(Vector3::new(10.0, 10.0, 10.0));

    // Transform the Camera View through the function directly.
    let mut transform = camera.get_global_transform();
    transform = transform.looking_at(Vector3::new(0.0, 0.0, 0.0), Vector3::UP, false);
    camera.set_transform(transform);

    self.base_mut().add_child(&camera);
    camera
  }
}
