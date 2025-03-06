use std::{future::Future, rc::Rc, sync::Arc};
use godot::{classes::Engine, prelude::*};
use tokio::{
    runtime::{self, Runtime},
    sync::mpsc::{self, UnboundedSender, UnboundedReceiver},
    sync::oneshot,
    task::JoinHandle,
};
use papaya::HashMap;

#[derive(Debug)]
pub enum MapMessage {
    Insert(String, String),
    Remove(String),
    Update(String, String),
    Get(String, oneshot::Sender<Option<String>>),
}

#[derive(Debug)]
struct GodotCallback {
    key: String,
    value: String,
}

#[derive(GodotClass)]
#[class(base=Object)]
pub struct RuntimeManager {
    base: Base<Object>,
    runtime: Rc<Runtime>,
    sender: Option<UnboundedSender<MapMessage>>,
    global_map: Arc<HashMap<String, String>>,
    godot_callback_tx: Option<UnboundedSender<GodotCallback>>,
    godot_callback_rx: Option<UnboundedReceiver<GodotCallback>>,
    owner: Option<Gd<Object>>,
}


#[godot_api]
impl IObject for RuntimeManager {
    fn init(base: Base<Object>) -> Self {
        let core_count = std::thread::available_parallelism()
            .map(|n| n.get())
            .unwrap_or(4);

        let runtime = runtime::Builder::new_multi_thread()
            .worker_threads(core_count)
            .enable_all()
            .build()
            .expect("[Q] -> Failed to create Tokio runtime");
        
        Self {
            base,
            runtime: Rc::new(runtime),
            sender: None,
            global_map: Arc::new(HashMap::new()),
            godot_callback_tx: None,
            godot_callback_rx: None,
            owner: None,
        }
    }

}

#[godot_api]
impl RuntimeManager {
    pub const SINGLETON: &'static str = "Runtime";

    pub fn setup_channel(&mut self, owner: Gd<Object>) {
        let (map_tx, mut map_rx) = mpsc::unbounded_channel::<MapMessage>();
        let (godot_tx, godot_rx) = mpsc::unbounded_channel::<GodotCallback>();
        self.sender = Some(map_tx.clone());
        self.godot_callback_tx = Some(godot_tx);
        self.godot_callback_rx = Some(godot_rx);
        self.owner = Some(owner.clone());

        let global_map = self.global_map.clone();
        let godot_tx = self.godot_callback_tx.clone().unwrap();

        self.runtime.spawn(async move {
            while let Some(message) = map_rx.recv().await {
                match message {
                    MapMessage::Insert(key, value) => {
                        global_map.pin().insert(key, value);
                    }
                    MapMessage::Remove(key) => {
                        global_map.pin().remove(&key);
                    }
                    MapMessage::Update(key, value) => {
                        global_map.pin().insert(key, value);
                    }
                    MapMessage::Get(key, response_tx) => {
                        let value = global_map.pin().get(&key).cloned();
                        let _ = response_tx.send(value.clone());
                        if let Some(value) = value {
                            let _ = godot_tx.send(GodotCallback {
                                key: key.clone(),
                                value,
                            });
                        }
                    }
                }
            }
        });
    }

    #[func]
    pub fn process_callbacks(&mut self) {
        let mut callbacks = Vec::new();
        if let Some(ref mut rx) = self.godot_callback_rx {
            while let Ok(callback) = rx.try_recv() {
                callbacks.push(callback);
            }
        }

        if let Some(ref mut owner) = self.owner {
            for callback in callbacks {
                owner.call_deferred(
                    &StringName::from("handle_map_get"),
                    &[callback.key.to_variant(), callback.value.to_variant()],
                );
            }
        }
    }

    pub fn send_map_message(&self, message: MapMessage) {
        if let Some(sender) = &self.sender {
            if sender.send(message).is_err() {
                godot_print!("[Q] -> Failed to send message to global map handler");
            }
        }
    }

    pub fn spawn<F>(&self, future: F) -> JoinHandle<F::Output>
    where
        F: Future + Send + 'static,
        F::Output: Send + 'static,
    {
        self.runtime.spawn(future)
    }

    pub async fn get_map_value(&self, key: String) -> Option<String> {
        let (tx, rx) = oneshot::channel();
        self.send_map_message(MapMessage::Get(key, tx));
        rx.await.ok().flatten()
    }

    pub fn global_map(&self) -> Arc<HashMap<String, String>> {
        self.global_map.clone()
    }

    pub fn get_sender(&self) -> Option<UnboundedSender<MapMessage>> {
        self.sender.clone()
    }
}
