//! IRC chat bridge for the isometric game.
//!
//! Connects to the IRC gateway via WebSocket (`wss://chat.kbve.com`) and bridges
//! incoming world events into Bevy `Toast` notifications. On WASM the transport
//! is `web_sys::WebSocket`; on native (desktop Tauri) it's tokio TCP.
//!
//! Gracefully degrades: if IRC is unreachable, the game continues without
//! cross-platform world events.

use bevy::prelude::*;
use bevy_chat::{ChatPlugin, IncomingChatEvent, IrcConfig, IrcTransport, MessageKind};
use crossbeam_channel::{Receiver, Sender, unbounded};

use super::toast::Toast;

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/// Default IRC gateway URL for browser clients.
/// In WASM mode this is the public chat.kbve.com WebSocket endpoint.
const DEFAULT_WS_URL: &str = "wss://chat.kbve.com";

/// Default IRC host for native (desktop) clients.
const DEFAULT_NATIVE_HOST: &str = "irc.kbve.com";

/// Channels every isometric client auto-joins.
const DEFAULT_CHANNELS: &[&str] = &["#global", "#world-events"];

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

/// Bridges IRC world events into the isometric game's toast notifications.
///
/// Adds:
/// - `bevy_chat::ChatPlugin` (inbox/outbox crossbeam channels + ECS event)
/// - Startup system that creates a `ChatClient` and connects (graceful failure)
/// - Update system that converts `IncomingChatEvent` → `Toast`
pub struct GameChatPlugin;

impl Plugin for GameChatPlugin {
    fn build(&self, app: &mut App) {
        // Crossbeam channels for IRC ↔ ECS bridging
        let (inbox_tx, inbox_rx) = unbounded();
        let (outbox_tx, outbox_rx) = unbounded();

        // Add the bevy_chat plugin (creates ChatInbox/ChatOutbox resources + IncomingChatEvent)
        app.add_plugins(ChatPlugin {
            inbox_rx: inbox_rx.clone(),
            outbox_tx: outbox_tx.clone(),
        });

        // Store the senders + receivers for the connect system
        app.insert_resource(ChatBridgeChannels {
            inbox_tx,
            outbox_rx,
        });
        app.init_resource::<ChatSession>();

        // Connect chat lazily: wait for the user to sign in (PreFlight
        // observes `kbve_username` + JWT), then dial `wss://chat.kbve.com`
        // with the JWT as the IRC `PASS` and the username as the nick.
        app.add_systems(Update, connect_chat_on_signin);

        // Bridge incoming world events to toast notifications
        app.add_systems(Update, world_events_to_toasts);
    }
}

/// Tracks whether we've already started a chat connection for the current
/// session. Reset on disconnect/re-auth in a future iteration.
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
        // No canonical username yet — chat needs one to register, so wait
        // until the player picks one via the in-game username modal.
        _ => return,
    };
    let jwt = match crate::auth_common::current_jwt() {
        Some(j) => j,
        None => return,
    };
    session.connected = true;
    session.nick = Some(nick.clone());
    info!("[chat] sign-in observed; dialing chat.kbve.com as {nick}");
    spawn_chat_connection(&channels, nick, jwt);
}

/// Stores the inbox sender (called by the IRC client when messages arrive)
/// and the outbox receiver (read by the outbox flush task).
#[derive(Resource)]
struct ChatBridgeChannels {
    inbox_tx: Sender<bevy_chat::ChatMessage>,
    #[allow(dead_code)] // Used by future outbox flush task
    outbox_rx: Receiver<bevy_chat::ChatMessage>,
}

// ---------------------------------------------------------------------------
// IRC connection (platform-specific)
// ---------------------------------------------------------------------------

fn chat_config(nick: String, jwt: String) -> IrcConfig {
    IrcConfig {
        host: DEFAULT_WS_URL.to_owned(),
        port: 443,
        tls: true,
        nick,
        channels: DEFAULT_CHANNELS.iter().map(|s| s.to_string()).collect(),
        password: Some(jwt),
        reconnect_delay_secs: 5,
        transport: IrcTransport::WebSocket,
    }
}

#[cfg(target_arch = "wasm32")]
fn spawn_chat_connection(channels: &ChatBridgeChannels, nick: String, jwt: String) {
    use bevy_chat::ChatClient;
    use wasm_bindgen::JsCast;

    let config = chat_config(nick, jwt);
    info!(
        "[chat] connecting to IRC gateway at {} (nick={})",
        config.host, config.nick
    );
    let client = ChatClient::new(config);
    if let Err(e) = client.connect() {
        warn!("[chat] IRC connect failed: {} — world events disabled", e);
        return;
    }

    let inbox_tx = channels.inbox_tx.clone();
    let client_for_poll = client.clone();
    let closure = wasm_bindgen::prelude::Closure::wrap(Box::new(move || {
        for msg in client_for_poll.drain_incoming() {
            let _ = inbox_tx.send(msg);
        }
    }) as Box<dyn FnMut()>);
    if let Some(window) = web_sys::window() {
        let _ = window.set_interval_with_callback_and_timeout_and_arguments_0(
            closure.as_ref().unchecked_ref(),
            100,
        );
        closure.forget();
    }
    info!("[chat] IRC bridge active (wasm)");
}

#[cfg(not(target_arch = "wasm32"))]
fn spawn_chat_connection(channels: &ChatBridgeChannels, nick: String, jwt: String) {
    use bevy_chat::ChatClient;

    let config = chat_config(nick, jwt);
    let host = config.host.clone();
    let inbox_tx = channels.inbox_tx.clone();
    info!(
        "[chat] connecting to IRC gateway at {} (nick={})",
        host, config.nick
    );

    // Bevy runs sync — drive the async connect on a dedicated tokio
    // runtime spawned on a worker thread. The runtime lives for the
    // process lifetime; broadcast receiver shuffles each `ChatMessage`
    // into the crossbeam inbox so `ChatPlugin::receive_inbox` can read
    // it on the main ECS thread.
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
                    warn!("[chat] native IRC-WS connect failed: {e}");
                    return;
                }
                info!("[chat] native IRC-WS bridge active");
                while let Ok(msg) = subscriber.recv().await {
                    if inbox_tx.send(msg).is_err() {
                        break;
                    }
                }
                warn!("[chat] native IRC-WS subscriber loop ended");
            });
        })
        .expect("failed to spawn chat-irc-ws thread");
}

// ---------------------------------------------------------------------------
// Event bridge: IncomingChatEvent → Toast
// ---------------------------------------------------------------------------

#[allow(unused_imports)]
use bevy_chat::ChatMessage;

fn world_events_to_toasts(mut events: MessageReader<IncomingChatEvent>, mut commands: Commands) {
    for IncomingChatEvent(msg) in events.read() {
        // Only render world-events channel as toasts (avoid spamming chat)
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
            _ => continue, // Skip unknown event types
        };

        commands.trigger(toast);
    }
}
