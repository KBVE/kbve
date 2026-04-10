//! IRC chat bridge for the isometric game.
//!
//! Connects to the IRC gateway via WebSocket (`wss://chat.kbve.com`) and bridges
//! incoming world events into Bevy `Toast` notifications. On WASM the transport
//! is `web_sys::WebSocket`; on native (desktop Tauri) it's tokio TCP.
//!
//! Gracefully degrades: if IRC is unreachable, the game continues without
//! cross-platform world events.

use bevy::prelude::*;
use bevy_chat::{ChatClient, ChatPlugin, IncomingChatEvent, IrcConfig, MessageKind};
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

        // Connect IRC at startup (graceful failure)
        app.add_systems(Startup, connect_irc);

        // Bridge incoming world events to toast notifications
        app.add_systems(Update, world_events_to_toasts);
    }
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

#[cfg(target_arch = "wasm32")]
fn connect_irc(channels: Res<ChatBridgeChannels>) {
    use bevy_chat::ChatClient;
    use wasm_bindgen::JsCast;

    // Generate a unique nick from a random suffix (browser session)
    let suffix: u32 = (js_sys::Math::random() * 100000.0) as u32;
    let nick = format!("iso-{:05}", suffix);

    let config = IrcConfig {
        host: DEFAULT_WS_URL.to_owned(),
        port: 443,
        tls: true,
        nick,
        channels: DEFAULT_CHANNELS.iter().map(|s| s.to_string()).collect(),
        password: None,
        reconnect_delay_secs: 5,
    };

    info!("[chat] connecting to IRC gateway at {}", config.host);
    let client = ChatClient::new(config);

    if let Err(e) = client.connect() {
        warn!("[chat] IRC connect failed: {} — world events disabled", e);
        return;
    }

    // Spawn a microtask poller that drains the WASM client's incoming buffer
    // and pushes into the crossbeam inbox channel each frame.
    let inbox_tx = channels.inbox_tx.clone();
    let client_for_poll = client.clone();
    let closure = wasm_bindgen::prelude::Closure::wrap(Box::new(move || {
        for msg in client_for_poll.drain_incoming() {
            let _ = inbox_tx.send(msg);
        }
    }) as Box<dyn FnMut()>);

    if let Some(window) = web_sys::window() {
        // Poll every 100ms — the WebSocket onmessage already pushes into
        // the client's internal buffer, we just shuffle to crossbeam here.
        let _ = window.set_interval_with_callback_and_timeout_and_arguments_0(
            closure.as_ref().unchecked_ref(),
            100,
        );
        closure.forget();
    }

    info!("[chat] IRC bridge active");
}

#[cfg(not(target_arch = "wasm32"))]
fn connect_irc(_channels: Res<ChatBridgeChannels>) {
    // Native client uses tokio + broadcast::Receiver — not Send across the
    // ECS boundary the same way WASM is. For desktop Tauri we'd spawn a
    // tokio task that subscribes to the broadcast channel and forwards
    // each message into the crossbeam inbox.
    //
    // Disabled for now — desktop builds connect via the lightyear server's
    // own IRC client (which the lightyear server also runs natively).
    info!("[chat] IRC bridge skipped on native (handled by lightyear server)");
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
