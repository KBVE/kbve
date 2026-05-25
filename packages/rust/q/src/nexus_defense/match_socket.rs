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

use crate::proto::{self, ClientMessage, ServerEvent};
use crate::threads::runtime::RuntimeManager;

enum Outbound {
    Send(Vec<u8>),
    Close,
}

enum Inbound {
    Connected,
    Welcome {
        slot: u8,
        seed: u64,
    },
    Snapshot {
        tick: u32,
        wave: u16,
        enemy_count: u32,
        building_count: u32,
        gold: i32,
        lives: i32,
    },
    Disconnected {
        reason: String,
    },
    DecodeError {
        detail: String,
    },
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
                Inbound::Snapshot {
                    tick,
                    wave,
                    enemy_count,
                    building_count,
                    gold,
                    lives,
                } => {
                    self.base_mut().emit_signal(
                        &StringName::from("snapshot"),
                        &[
                            (tick as i64).to_variant(),
                            (wave as i64).to_variant(),
                            (enemy_count as i64).to_variant(),
                            (building_count as i64).to_variant(),
                            (gold as i64).to_variant(),
                            (lives as i64).to_variant(),
                        ],
                    );
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

    /// Snapshot landed — summary surface for the HUD. Per-entity detail can
    /// be pulled from a future ring buffer; for now we plumb the headline
    /// numbers so GDScript can render a wave/enemies/gold display.
    #[signal]
    fn snapshot(tick: i64, wave: i64, enemy_count: i64, building_count: i64, gold: i64, lives: i64);

    #[signal]
    fn disconnected(reason: GString);

    #[signal]
    fn decode_error(detail: GString);

    /// Open a connection and send the JoinMatch handshake.
    /// Returns immediately; the actual connect happens on the tokio runtime.
    /// `jwt` is a Supabase access token; `kbve_username` is sent for logging.
    #[func]
    fn connect_to(&mut self, url: GString, jwt: GString, kbve_username: GString) {
        if self.inbound_rx.is_some() {
            godot_warn!("[MatchSocket] connect_to called while already connected");
            return;
        }

        let url_str = url.to_string();
        let join = proto::JoinMatch {
            protocol: proto::PROTOCOL_VERSION,
            jwt: jwt.to_string(),
            kbve_username: kbve_username.to_string(),
        };
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
            run_socket(url_str, join, inbound_tx, outbound_rx).await;
        });
    }

    #[func]
    fn send_heartbeat(&mut self, client_tick: i64) {
        self.send_frame(
            client_tick,
            vec![proto::Input::Heartbeat {
                client_tick: client_tick as u32,
            }],
        );
    }

    /// Queue a single `PlaceBuilding` input for the next client frame.
    /// `kind_idx` matches `proto::BuildKind` discriminants (Tower=0, …, Nexus=8).
    #[func]
    fn send_place_building(&mut self, client_tick: i64, col: i64, row: i64, kind_idx: i64) {
        let kind = match kind_idx {
            0 => proto::BuildKind::Tower,
            1 => proto::BuildKind::Generator,
            2 => proto::BuildKind::Battery,
            3 => proto::BuildKind::Repair,
            4 => proto::BuildKind::Armoury,
            5 => proto::BuildKind::Village,
            6 => proto::BuildKind::Town,
            7 => proto::BuildKind::Castle,
            8 => proto::BuildKind::Nexus,
            _ => {
                godot_warn!("[MatchSocket] unknown BuildKind index {kind_idx}");
                return;
            }
        };
        self.send_frame(
            client_tick,
            vec![proto::Input::PlaceBuilding {
                col: col as i32,
                row: row as i32,
                kind,
            }],
        );
    }

    fn send_frame(&mut self, client_tick: i64, inputs: Vec<proto::Input>) {
        let tx = match &self.outbound_tx {
            Some(t) => t.clone(),
            None => return,
        };
        let msg = ClientMessage::Frame(proto::ClientFrame {
            client_tick: client_tick as u32,
            inputs,
        });
        match proto::encode(&msg) {
            Ok(buf) => {
                let _ = tx.send(Outbound::Send(buf));
            }
            Err(e) => godot_warn!("[MatchSocket] encode frame failed: {e}"),
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
    fn is_ws_connected(&self) -> bool {
        self.connected
    }
}

async fn run_socket(
    url: String,
    join: proto::JoinMatch,
    tx: Sender<Inbound>,
    rx: Receiver<Outbound>,
) {
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

    // Send the JoinMatch handshake immediately. Server holds Welcome until it
    // verifies the JWT.
    let join_msg = ClientMessage::JoinMatch(join);
    match proto::encode(&join_msg) {
        Ok(buf) => {
            if writer.send(Message::Binary(buf)).await.is_err() {
                let _ = tx.send(Inbound::Disconnected {
                    reason: "join send failed".into(),
                });
                return;
            }
        }
        Err(e) => {
            let _ = tx.send(Inbound::Disconnected {
                reason: format!("join encode failed: {e}"),
            });
            return;
        }
    }

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
    // Track the slot Welcome assigned so we can pick the matching FieldDelta
    // out of every Snapshot (server emits one per active player).
    let mut own_slot: Option<u8> = None;
    while let Some(frame) = reader.next().await {
        match frame {
            Ok(Message::Binary(mut bytes)) => match proto::decode::<ServerEvent>(&mut bytes) {
                Ok(ServerEvent::Welcome {
                    protocol: _,
                    your_slot,
                    seed,
                }) => {
                    own_slot = Some(your_slot.0);
                    let _ = tx.send(Inbound::Welcome {
                        slot: your_slot.0,
                        seed,
                    });
                }
                Ok(ServerEvent::Snapshot(snap)) => {
                    let field = own_slot
                        .and_then(|s| snap.fields.iter().find(|f| f.owner.0 == s))
                        .or_else(|| snap.fields.first());
                    let enemy_count = field.map(|f| f.enemies.len() as u32).unwrap_or(0);
                    let building_count = field.map(|f| f.buildings.len() as u32).unwrap_or(0);
                    let wave = field.map(|f| f.wave).unwrap_or(0);
                    let gold = field.map(|f| f.gold).unwrap_or(0);
                    let lives = field.map(|f| f.lives).unwrap_or(0);
                    let _ = tx.send(Inbound::Snapshot {
                        tick: snap.tick,
                        wave,
                        enemy_count,
                        building_count,
                        gold,
                        lives,
                    });
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
