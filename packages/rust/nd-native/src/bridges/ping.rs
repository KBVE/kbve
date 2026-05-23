use godot::classes::INode;
use godot::prelude::*;

#[derive(GodotClass)]
#[class(base = Node)]
pub struct NdPing {
    base: Base<Node>,
}

#[godot_api]
impl INode for NdPing {
    fn init(base: Base<Node>) -> Self {
        Self { base }
    }
}

#[godot_api]
impl NdPing {
    #[func]
    fn pong(&self) -> GString {
        GString::from("nd-native online")
    }

    #[func]
    fn add(&self, a: i64, b: i64) -> i64 {
        a + b
    }
}
