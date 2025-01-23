use godot::prelude::*;
use godot::classes::Camera;

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
        self.setup_isometric_camera();
    }
}


#[godot_api]
impl CameraManager {
  #[func]
  pub fn setup_isometric_camera(&mut self) {
    let mut camera = Camera::new_alloc();
    camera.set_name("IsometricCamera");
    camera.set_perspective(false);
    camera.set_position(Vector3::new(0.0, 10.0, 10.0));
    camera.look_at(Vector3::new(0.0, 0.0, 0.0), Vector3::new(0.0, 1.0, 0.0));
    self.base.add_child(camera);
  }
}
