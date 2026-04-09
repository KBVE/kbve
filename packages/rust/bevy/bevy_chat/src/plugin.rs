//! Bevy plugin that bridges `ChatClient` into ECS events.
//!
//! Enabled via the `plugin` feature flag. The isometric game adds this plugin
//! to receive IRC messages as Bevy events and send outgoing messages via a
//! crossbeam channel.

use bevy::prelude::*;
use crossbeam_channel::{Receiver, Sender};

use crate::message::ChatMessage;

/// Bevy resource wrapping the receive side of the IRC bridge.
/// Systems can read incoming messages by polling this each frame.
#[derive(Resource)]
pub struct ChatInbox {
    rx: Receiver<ChatMessage>,
}

impl ChatInbox {
    /// Drain all pending messages (non-blocking).
    pub fn drain(&self) -> Vec<ChatMessage> {
        self.rx.try_iter().collect()
    }
}

/// Bevy resource wrapping the send side of the IRC bridge.
/// Systems send outgoing messages by pushing to this channel.
#[derive(Resource)]
pub struct ChatOutbox {
    tx: Sender<ChatMessage>,
}

impl ChatOutbox {
    /// Queue a message to be sent to IRC on the next flush.
    pub fn send(&self, msg: ChatMessage) {
        let _ = self.tx.send(msg);
    }
}

/// Bevy event fired for each incoming IRC message.
#[derive(Event, Debug, Clone)]
pub struct IncomingChatEvent(pub ChatMessage);

/// Bevy plugin that creates the IRC bridge channels and a system
/// that converts incoming crossbeam messages into Bevy events.
///
/// # Setup
///
/// After adding this plugin, spawn a tokio task that connects a `ChatClient`
/// and bridges it to the crossbeam channels:
///
/// ```ignore
/// let (inbox_tx, inbox_rx) = crossbeam_channel::unbounded();
/// let (outbox_tx, outbox_rx) = crossbeam_channel::unbounded();
///
/// app.insert_resource(ChatInbox { rx: inbox_rx });
/// app.insert_resource(ChatOutbox { tx: outbox_tx });
///
/// // In a tokio task:
/// let mut rx = client.subscribe();
/// loop {
///     if let Ok(msg) = rx.recv().await {
///         let _ = inbox_tx.send(msg);
///     }
/// }
/// ```
pub struct ChatPlugin {
    /// Pre-built inbox receiver (from crossbeam channel).
    pub inbox_rx: Receiver<ChatMessage>,
    /// Pre-built outbox sender (from crossbeam channel).
    pub outbox_tx: Sender<ChatMessage>,
}

impl Plugin for ChatPlugin {
    fn build(&self, app: &mut App) {
        app.insert_resource(ChatInbox {
            rx: self.inbox_rx.clone(),
        });
        app.insert_resource(ChatOutbox {
            tx: self.outbox_tx.clone(),
        });
        app.add_event::<IncomingChatEvent>();
        app.add_systems(Update, poll_inbox);
    }
}

/// System that drains the crossbeam inbox and fires Bevy events.
fn poll_inbox(inbox: Res<ChatInbox>, mut events: EventWriter<IncomingChatEvent>) {
    for msg in inbox.drain() {
        events.write(IncomingChatEvent(msg));
    }
}
