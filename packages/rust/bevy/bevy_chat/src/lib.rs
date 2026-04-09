//! # bevy_chat
//!
//! IRC-backed chat and event bridge for MUD/game clients.
//!
//! This crate provides a headless async IRC client (`ChatClient`) that connects
//! to an IRC server, joins configured channels, and sends/receives structured
//! game messages. It is used by both the Discord bot and the isometric game
//! server to share a common communication backbone.
//!
//! ## Features
//!
//! - **`default`** — Headless async client only. Use this in the Discord bot.
//! - **`plugin`** — Adds a Bevy plugin (`ChatPlugin`) that bridges IRC messages
//!   into ECS events. Use this in the isometric game.
//!
//! ## Architecture
//!
//! ```text
//! Discord Bot ──► ChatClient ──► IRC Server ◄── ChatClient ◄── Lightyear Server
//!                                    │
//!                              #global (chat)
//!                              #world-events (kills, drops, captures)
//!                              #dungeon (dungeon-specific)
//! ```
//!
//! Each client connects with a unique nick (`mud-{id}`, `iso-{id}`) and
//! auto-joins configured channels. Messages use a structured prefix format:
//!
//! - Chat: `[CHAT] PlayerName: hello world`
//! - Events: `[EVENT:KILL] {"actor":"Player","target":"Glass Golem","platform":"discord"}`

mod client;
mod config;
mod message;

pub use client::ChatClient;
pub use config::IrcConfig;
pub use message::{ChatMessage, MessageKind};

#[cfg(feature = "plugin")]
mod plugin;
#[cfg(feature = "plugin")]
pub use plugin::ChatPlugin;
