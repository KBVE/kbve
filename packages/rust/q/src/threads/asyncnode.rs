use godot::{classes::Engine, prelude::*};
use crate::threads::runtime::RuntimeManager;

#[derive(GodotClass)]
#[class(base=Node)]
pub struct AsyncNode {
    base: Base<Node>,
}

#[godot_api]
impl INode for AsyncNode {
    fn init(base: Base<Node>) -> Self {
        Self { base }
    }

    fn ready(&mut self) {
        if let Some(runtime) = Engine::singleton().get_singleton(RuntimeManager::SINGLETON) {
            let mut runtime = runtime.cast::<RuntimeManager>();
            runtime.bind_mut().setup_channel(self.base().clone().upcast::<Object>());
            runtime.bind_mut().spawn(async {
                godot_print!("[AsyncNode] Initialized and ready!");
            });
        } else {
            godot_warn!("[AsyncNode] RuntimeManager singleton not found!");
        }
    }
}

#[godot_api]
impl AsyncNode {
    #[func]
    pub fn spawn_async_task(&mut self) {
        if let Some(runtime) = Engine::singleton().get_singleton(RuntimeManager::SINGLETON) {
            let mut runtime = runtime.cast::<RuntimeManager>();
            runtime.bind_mut().spawn(async {
                godot_print!("[AsyncNode] Async task spawned!");
            });
        }
    }

    #[func]
    pub fn process_callbacks(&mut self) {
        if let Some(runtime) = Engine::singleton().get_singleton(RuntimeManager::SINGLETON) {
            let mut runtime = runtime.cast::<RuntimeManager>();
            runtime.bind_mut().process_callbacks();
        }
    }
}