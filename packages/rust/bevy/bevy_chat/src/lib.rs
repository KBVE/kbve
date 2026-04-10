//! # bevy_chat
//!
//! IRC-backed chat and event bridge for MUD/game clients.
//!
//! This crate provides a `ChatClient` that connects to an IRC server,
//! joins configured channels, and sends/receives structured game messages.
//! It is used by both the Discord bot and the isometric game to share a
//! common communication backbone.
//!
//! ## Transports
//!
//! - **Native (desktop/server)** — tokio TCP to IRC port 6667 (direct connection)
//! - **WASM (browser)** — `web_sys::WebSocket` to IRC-over-WebSocket endpoint
//!   (e.g. `wss://chat.kbve.com` → irc-gateway → ergo)
//!
//! The transport is selected automatically at compile time via `cfg(target_arch)`.
//! The public API (`ChatClient`, `connect`, `send`, `subscribe`/`drain_incoming`)
//! is identical on both platforms.
//!
//! ## Features
//!
//! - **`default`** — Headless client only. Use this in the Discord bot.
//! - **`plugin`** — Adds a Bevy plugin (`ChatPlugin`) that bridges IRC messages
//!   into ECS events. Use this in the isometric game.
//!
//! ## Architecture
//!
//! ```text
//! Discord Bot ──► ChatClient (TCP) ──► ergo IRC :6667
//!                                          ▲
//! Lightyear Server ──► ChatClient (TCP) ───┘
//!                                          ▲
//! WASM Browser ──► ChatClient (WS) ──► chat.kbve.com ──► irc-gateway ──┘
//! ```

mod config;
mod message;

pub use config::IrcConfig;
pub use message::{ChatMessage, MessageKind};

// ── Platform-specific transport ───────────────────────────────────────

#[cfg(not(target_arch = "wasm32"))]
mod client_native;
#[cfg(not(target_arch = "wasm32"))]
pub use client_native::ChatClient;

#[cfg(target_arch = "wasm32")]
mod client_wasm;
#[cfg(target_arch = "wasm32")]
pub use client_wasm::ChatClient;

// ── Optional Bevy plugin ──────────────────────────────────────────────

#[cfg(feature = "plugin")]
mod plugin;
#[cfg(feature = "plugin")]
pub use plugin::{ChatInbox, ChatOutbox, ChatPlugin, IncomingChatEvent};
