//! Godot-side WebSocket client for the Nexus Defense game server.
//!
//! Wraps a tokio-tungstenite connection running on `RuntimeManager`'s shared
//! runtime. The background task decodes `ServerEvent` postcards and pushes
//! them across a crossbeam channel; `_process` drains the channel on the main
//! thread and fires GDScript signals so the scene tree can react.

use crossbeam_channel::{Receiver, Sender, unbounded};
use futures_util::{SinkExt, StreamExt};
use godot::classes::INode;
use godot::prelude::*;
use tokio_tungstenite::tungstenite::Message;

use crate::proto::{self, ServerEvent};
use crate::threads::runtime::RuntimeManager;

enum Outbound {
    Send(Vec<u8>),
    Close,
}

enum Inbound {
    Connected,
    Welcome { slot: u8, seed: u64 },
    Snapshot { tick: u32 },
    Disconnected { reason: String },
    DecodeError { detail: String },
}

#[derive(GodotClass)]
#[class(base = Node)]
pub struct MatchSocket {
    base: Base<Node>,
    inbound_rx: Option<Receiver<Inbound>>,
    outbound_tx: Option<Sender<Outbound>>,
    connected: bool,
}

#[godot_api]
impl INode for MatchSocket {
    fn init(base: Base<Node>) -> Self {
        Self {
            base,
            inbound_rx: None,
            outbound_tx: None,
            connected: false,
        }
    }

    fn process(&mut self, _delta: f64) {
        // Drain the receive channel each frame and surface to GDScript.
        let events: Vec<Inbound> = match &self.inbound_rx {
            Some(rx) => rx.try_iter().collect(),
            None => return,
        };
        for evt in events {
            match evt {
                Inbound::Connected => {
                    self.connected = true;
                    self.base_mut()
                        .emit_signal(&StringName::from("connected"), &[]);
                }
                Inbound::Welcome { slot, seed } => {
                    self.base_mut().emit_signal(
                        &StringName::from("welcome"),
                        &[(slot as i64).to_variant(), (seed as i64).to_variant()],
                    );
                }
                Inbound::Snapshot { tick } => {
                    self.base_mut()
                        .emit_signal(&StringName::from("snapshot"), &[(tick as i64).to_variant()]);
                }
                Inbound::Disconnected { reason } => {
                    self.connected = false;
                    self.base_mut()
                        .emit_signal(&StringName::from("disconnected"), &[reason.to_variant()]);
                }
                Inbound::DecodeError { detail } => {
                    self.base_mut()
                        .emit_signal(&StringName::from("decode_error"), &[detail.to_variant()]);
                }
            }
        }
    }
}

#[godot_api]
impl MatchSocket {
    /// Fires once the underlying TCP+WS handshake completes.
    #[signal]
    fn connected();

    /// Server-issued Welcome — slot index + match seed.
    #[signal]
    fn welcome(slot: i64, seed: i64);

    /// Snapshot landed; consumer can pull additional detail from a buffer
    /// later. For now only the tick is plumbed through.
    #[signal]
    fn snapshot(tick: i64);

    #[signal]
    fn disconnected(reason: GString);

    #[signal]
    fn decode_error(detail: GString);

    /// Open a connection to the given `ws://host:port/ws` URL.
    /// Returns immediately; the actual connect happens on the tokio runtime.
    #[func]
    fn connect_to(&mut self, url: GString) {
        if self.inbound_rx.is_some() {
            godot_warn!("[MatchSocket] connect_to called while already connected");
            return;
        }

        let url_str = url.to_string();
        let (inbound_tx, inbound_rx) = unbounded::<Inbound>();
        let (outbound_tx, outbound_rx) = unbounded::<Outbound>();
        self.inbound_rx = Some(inbound_rx);
        self.outbound_tx = Some(outbound_tx);

        let engine = godot::classes::Engine::singleton();
        let runtime_singleton = match engine.get_singleton(RuntimeManager::SINGLETON) {
            Some(s) => s,
            None => {
                godot_error!("[MatchSocket] RuntimeManager singleton missing");
                return;
            }
        };
        let runtime_gd: Gd<RuntimeManager> = runtime_singleton.cast();
        let runtime = runtime_gd.bind();

        runtime.spawn(async move {
            run_socket(url_str, inbound_tx, outbound_rx).await;
        });
    }

    #[func]
    fn send_heartbeat(&mut self, client_tick: i64) {
        let tx = match &self.outbound_tx {
            Some(t) => t.clone(),
            None => return,
        };
        let frame = proto::ClientFrame {
            client_tick: client_tick as u32,
            inputs: vec![proto::Input::Heartbeat {
                client_tick: client_tick as u32,
            }],
        };
        match proto::encode(&frame) {
            Ok(buf) => {
                let _ = tx.send(Outbound::Send(buf));
            }
            Err(e) => godot_warn!("[MatchSocket] encode heartbeat failed: {e}"),
        }
    }

    #[func]
    fn disconnect(&mut self) {
        if let Some(tx) = &self.outbound_tx {
            let _ = tx.send(Outbound::Close);
        }
        self.inbound_rx = None;
        self.outbound_tx = None;
        self.connected = false;
    }

    #[func]
    fn is_connected(&self) -> bool {
        self.connected
    }
}

async fn run_socket(url: String, tx: Sender<Inbound>, rx: Receiver<Outbound>) {
    let (ws_stream, _) = match tokio_tungstenite::connect_async(&url).await {
        Ok(s) => s,
        Err(e) => {
            let _ = tx.send(Inbound::Disconnected {
                reason: format!("connect failed: {e}"),
            });
            return;
        }
    };
    let _ = tx.send(Inbound::Connected);

    let (mut writer, mut reader) = ws_stream.split();

    // Outbound pump — pull from crossbeam channel, push onto the ws.
    let writer_tx = tx.clone();
    tokio::spawn(async move {
        loop {
            // crossbeam_channel has no async API; offload the blocking recv
            // to a Tokio blocking thread so we don't park the runtime.
            let msg = tokio::task::spawn_blocking({
                let rx = rx.clone();
                move || rx.recv()
            })
            .await;

            match msg {
                Ok(Ok(Outbound::Send(buf))) => {
                    if writer.send(Message::Binary(buf)).await.is_err() {
                        let _ = writer_tx.send(Inbound::Disconnected {
                            reason: "send failed".into(),
                        });
                        break;
                    }
                }
                Ok(Ok(Outbound::Close)) => {
                    let _ = writer.close().await;
                    break;
                }
                _ => break,
            }
        }
    });

    // Inbound pump — drain ws messages, decode postcard, push to channel.
    while let Some(frame) = reader.next().await {
        match frame {
            Ok(Message::Binary(mut bytes)) => match proto::decode::<ServerEvent>(&mut bytes) {
                Ok(ServerEvent::Welcome {
                    protocol: _,
                    your_slot,
                    seed,
                }) => {
                    let _ = tx.send(Inbound::Welcome {
                        slot: your_slot.0,
                        seed,
                    });
                }
                Ok(ServerEvent::Snapshot(snap)) => {
                    let _ = tx.send(Inbound::Snapshot { tick: snap.tick });
                }
                Ok(ServerEvent::Reject { reason }) => {
                    let _ = tx.send(Inbound::Disconnected { reason });
                }
                Ok(_) => {}
                Err(e) => {
                    let _ = tx.send(Inbound::DecodeError {
                        detail: format!("{e}"),
                    });
                }
            },
            Ok(Message::Close(_)) => break,
            Err(e) => {
                let _ = tx.send(Inbound::Disconnected {
                    reason: format!("ws error: {e}"),
                });
                break;
            }
            _ => {}
        }
    }

    let _ = tx.send(Inbound::Disconnected {
        reason: "stream ended".into(),
    });
}
