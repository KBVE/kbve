use godot::{ classes::Engine, prelude::* };
use crate::threads::runtime::{ RuntimeManager, MapMessage };

#[derive(GodotClass)]
#[class(base = Node)]
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

  #[func]
  pub fn test_multi_threading(&mut self) {
    if let Some(runtime) = Engine::singleton().get_singleton(RuntimeManager::SINGLETON) {
      let mut runtime = runtime.cast::<RuntimeManager>();
      let runtime_ref = runtime.bind_mut();
      let sender = runtime_ref.get_sender();
      let start = std::time::Instant::now();

      for i in 0..32 {
        runtime_ref.spawn(async move {
          let thread_id = std::thread::current().id();
          let mut sum = 0;
          for j in 0..1_000_000 {
            sum += j;
          }
          tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
          godot_print!("[AsyncNode] Task {} completed on thread {:?}", i, thread_id);
        });
      }

      runtime_ref.send_map_message(
        MapMessage::Insert("test_key".to_string(), "test_value".to_string())
      );

      if let Some(sender) = sender {
        runtime_ref.spawn(async move {
          tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
          let (tx, rx) = tokio::sync::oneshot::channel();
          let _ = sender.send(MapMessage::Get("test_key".to_string(), tx));
          if let Ok(value) = rx.await {
            godot_print!("[AsyncNode] Retrieved value: {:?}", value);
          } else {
            godot_warn!("[AsyncNode] Failed to retrieve value!");
          }
        });
      }

      godot_print!("[AsyncNode] Multi-threading test started!");
      let duration = start.elapsed();
      godot_print!("[AsyncNode] Test completed in {:?}", duration);
    } else {
      godot_warn!("[AsyncNode] RuntimeManager singleton not found!");
    }
  }

  #[func]
  fn handle_map_get(&mut self, key: String, value: String) {
    godot_print!("[AsyncNode] Callback received - Key: {}, Value: {}", key, value);
  }
}
