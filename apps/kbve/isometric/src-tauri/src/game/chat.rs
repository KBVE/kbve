//! IRC chat bridge wired into the Bevy game (native + WASM).

use bevy::prelude::*;
use bevy_chat::{ChatMessage, ChatPlugin, IncomingChatEvent, IrcConfig, IrcTransport, MessageKind};
use crossbeam_channel::{Receiver, Sender, unbounded};
use serde::Serialize;
use std::collections::VecDeque;
use std::sync::{Mutex, OnceLock};

use super::toast::Toast;

/// Channel game messages fan out through. Must match the Discord relay's
/// `RELAY_IRC_CHANNEL` and the chat.kbve.com web default so game/Discord/web
/// all see the same Ergo room.
pub const DEFAULT_SEND_CHANNEL: &str = "#general";

static OUTBOX_TX: OnceLock<Sender<ChatMessage>> = OnceLock::new();

const SNAPSHOT_LOG_CAP: usize = 60;

static SNAPSHOT_LOG: Mutex<VecDeque<ChatLogEntry>> = Mutex::new(VecDeque::new());

#[derive(Clone, Serialize)]
pub struct ChatLogEntry {
    pub sender: String,
    pub content: String,
    pub channel: String,
    pub kind: String,
    pub ts_unix: u64,
}

fn push_snapshot(entry: ChatLogEntry) {
    let Ok(mut log) = SNAPSHOT_LOG.lock() else {
        return;
    };
    log.push_back(entry);
    while log.len() > SNAPSHOT_LOG_CAP {
        log.pop_front();
    }
}

pub fn snapshot_log() -> Vec<ChatLogEntry> {
    SNAPSHOT_LOG
        .lock()
        .map(|l| l.iter().cloned().collect())
        .unwrap_or_default()
}

pub fn queue_outgoing_chat(text: &str) -> bool {
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return false;
    }
    let Some(tx) = OUTBOX_TX.get() else {
        return false;
    };
    let nick = crate::auth_common::current_signin_snapshot()
        .username
        .unwrap_or_else(|| "guest".to_owned());
    let msg = ChatMessage::chat(&nick, "isometric", DEFAULT_SEND_CHANNEL, trimmed);
    let sent = tx.send(msg.clone()).is_ok();
    if sent {
        push_snapshot(ChatLogEntry {
            sender: msg.sender,
            content: msg.content,
            channel: msg.channel,
            kind: format!("{:?}", msg.kind),
            ts_unix: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_secs())
                .unwrap_or(0),
        });
    }
    sent
}

const DEFAULT_WS_URL: &str = "wss://chat.kbve.com/ws";
const DEFAULT_NATIVE_HOST: &str = "irc.kbve.com";
const DEFAULT_CHANNELS: &[&str] = &["#general", "#world-events"];

pub struct GameChatPlugin;

impl Plugin for GameChatPlugin {
    fn build(&self, app: &mut App) {
        let (inbox_tx, inbox_rx) = unbounded();
        let (outbox_tx, outbox_rx) = unbounded();

        app.add_plugins(ChatPlugin {
            inbox_rx: inbox_rx.clone(),
            outbox_tx: outbox_tx.clone(),
        });

        app.insert_resource(ChatBridgeChannels {
            inbox_tx,
            outbox_rx,
        });
        app.init_resource::<ChatSession>();
        let _ = OUTBOX_TX.set(outbox_tx);

        app.add_systems(Update, connect_chat_on_signin);
        app.add_systems(Update, world_events_to_toasts);
        app.add_systems(Update, snapshot_incoming);
    }
}

fn snapshot_incoming(mut events: MessageReader<IncomingChatEvent>) {
    for IncomingChatEvent(msg) in events.read() {
        if msg.channel == "#world-events" {
            continue;
        }
        push_snapshot(ChatLogEntry {
            sender: msg.sender.clone(),
            content: msg.content.clone(),
            channel: msg.channel.clone(),
            kind: format!("{:?}", msg.kind),
            ts_unix: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_secs())
                .unwrap_or(0),
        });
    }
}

#[derive(Resource, Default)]
struct ChatSession {
    connected: bool,
    nick: Option<String>,
}

fn connect_chat_on_signin(mut session: ResMut<ChatSession>, channels: Res<ChatBridgeChannels>) {
    if session.connected {
        return;
    }
    let snapshot = crate::auth_common::current_signin_snapshot();
    if !snapshot.jwt_valid {
        return;
    }
    let nick = match snapshot.username {
        Some(name) if !name.is_empty() => name,
        _ => return,
    };
    let jwt = match crate::auth_common::current_jwt() {
        Some(j) => j,
        None => return,
    };
    session.connected = true;
    session.nick = Some(nick.clone());
    info!("[chat] connecting as {nick}");
    spawn_chat_connection(
        channels.inbox_tx.clone(),
        channels.outbox_rx.clone(),
        nick,
        jwt,
    );
}

#[derive(Resource)]
struct ChatBridgeChannels {
    inbox_tx: Sender<bevy_chat::ChatMessage>,
    #[allow(dead_code)]
    outbox_rx: Receiver<bevy_chat::ChatMessage>,
}

fn chat_config(nick: String, jwt: String) -> IrcConfig {
    // chat.kbve.com authenticates the WS upgrade via `?token=`; PASS line
    // is ignored. Skip IRC registration since the gateway pre-registers us
    // from the JWT claims.
    let url = format!("{}?token={}", DEFAULT_WS_URL, jwt);
    IrcConfig {
        host: url,
        port: 443,
        tls: true,
        nick,
        channels: DEFAULT_CHANNELS.iter().map(|s| s.to_string()).collect(),
        password: None,
        reconnect_delay_secs: 5,
        transport: IrcTransport::WebSocket,
        skip_registration: true,
    }
}

#[cfg(target_arch = "wasm32")]
fn spawn_chat_connection(
    inbox_tx: Sender<ChatMessage>,
    outbox_rx: Receiver<ChatMessage>,
    nick: String,
    jwt: String,
) {
    use bevy_chat::ChatClient;
    use wasm_bindgen::JsCast;

    let config = chat_config(nick, jwt);
    let client = ChatClient::new(config);
    if let Err(e) = client.connect() {
        warn!("[chat] connect failed: {e}");
        return;
    }

    let client_for_poll = client.clone();
    let closure = wasm_bindgen::prelude::Closure::wrap(Box::new(move || {
        for msg in client_for_poll.drain_incoming() {
            let _ = inbox_tx.send(msg);
        }
        while let Ok(out) = outbox_rx.try_recv() {
            if let Err(e) = client_for_poll.send(&out) {
                warn!("[chat] outbound send failed: {e}");
                break;
            }
        }
    }) as Box<dyn FnMut()>);
    if let Some(window) = web_sys::window() {
        let _ = window.set_interval_with_callback_and_timeout_and_arguments_0(
            closure.as_ref().unchecked_ref(),
            100,
        );
        closure.forget();
    }
}

#[cfg(not(target_arch = "wasm32"))]
fn spawn_chat_connection(
    inbox_tx: Sender<ChatMessage>,
    outbox_rx: Receiver<ChatMessage>,
    nick: String,
    jwt: String,
) {
    use bevy_chat::ChatClient;

    let config = chat_config(nick, jwt);
    std::thread::Builder::new()
        .name("chat-irc-ws".to_string())
        .spawn(move || {
            let rt = match tokio::runtime::Builder::new_multi_thread()
                .enable_all()
                .build()
            {
                Ok(rt) => rt,
                Err(e) => {
                    warn!("[chat] failed to start tokio runtime: {e}");
                    return;
                }
            };
            rt.block_on(async move {
                let mut client = ChatClient::new(config);
                let mut subscriber = client.subscribe();
                if let Err(e) = client.connect().await {
                    warn!("[chat] connect failed: {e}");
                    return;
                }

                let client_send = client.clone();
                tokio::spawn(async move {
                    loop {
                        let outbox = outbox_rx.clone();
                        let next = tokio::task::spawn_blocking(move || outbox.recv())
                            .await
                            .ok()
                            .and_then(|r| r.ok());
                        let Some(msg) = next else {
                            break;
                        };
                        if let Err(e) = client_send.send(&msg).await {
                            warn!("[chat] outbound send failed: {e}");
                            break;
                        }
                    }
                });

                while let Ok(msg) = subscriber.recv().await {
                    if inbox_tx.send(msg).is_err() {
                        break;
                    }
                }
            });
        })
        .expect("failed to spawn chat-irc-ws thread");
}

fn world_events_to_toasts(mut events: MessageReader<IncomingChatEvent>, mut commands: Commands) {
    for IncomingChatEvent(msg) in events.read() {
        if msg.channel != "#world-events" {
            continue;
        }

        let toast = match msg.kind {
            MessageKind::Kill => Toast::loot(format!("\u{2694} {}", msg.content)),
            MessageKind::RareDrop => Toast::loot(format!("\u{1F381} {}", msg.content)),
            MessageKind::Capture => Toast::success(format!("\u{2728} {}", msg.content)),
            MessageKind::QuestComplete => Toast::success(format!("\u{2705} {}", msg.content)),
            MessageKind::AreaUnlocked => Toast::info(format!("\u{1F5FA} {}", msg.content)),
            MessageKind::Death => Toast::warn(format!("\u{1F480} {}", msg.content)),
            MessageKind::Craft => Toast::loot(format!("\u{2692} {}", msg.content)),
            MessageKind::System => Toast::info(msg.content.clone()),
            MessageKind::Custom(ref tag) if tag == "VICTORY" => {
                Toast::success(format!("\u{1F451} {}", msg.content))
            }
            _ => continue,
        };

        commands.trigger(toast);
    }
}
