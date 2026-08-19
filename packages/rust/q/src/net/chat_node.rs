//! Godot adapter over [`crate::net::chat`].

use godot::classes::{INode, Node};
use godot::prelude::*;

use super::chat::{ChatConfig, ChatEvent, ChatSession};

#[derive(GodotClass)]
#[class(init, base = Node)]
pub struct QChatClient {
    base: Base<Node>,

    #[export]
    #[init(val = "wss://chat.kbve.com/gamechat".into())]
    host: GString,
    #[export]
    #[init(val = "friendslop".into())]
    game: GString,
    #[export]
    #[init(val = "#general".into())]
    channel: GString,
    #[export]
    #[init(val = "friendslop".into())]
    platform: GString,

    session: Option<ChatSession>,
}

#[godot_api]
impl INode for QChatClient {
    fn process(&mut self, _delta: f64) {
        self.drain();
    }
}

#[godot_api]
impl QChatClient {
    /// A line for the log: `kind` is chat, join, part, system or notice.
    #[signal]
    fn message(kind: GString, sender: GString, content: GString);

    #[signal]
    fn state_changed(connected: bool);

    /// A translation key, not a sentence.
    #[signal]
    fn failed(reason: GString);

    /// Connects, and keeps reconnecting, until [`Self::stop`].
    #[func]
    fn start(&mut self, token: GString, sender: GString) {
        if self.session.is_none() {
            self.session = Some(ChatSession::spawn(ChatConfig {
                host: self.host.to_string(),
                game: self.game.to_string(),
                channel: self.channel.to_string(),
                platform: self.platform.to_string(),
            }));
        }
        if let Some(session) = &self.session {
            session.start(&token.to_string(), &sender.to_string());
        }
    }

    #[func]
    fn stop(&mut self) {
        if let Some(session) = &self.session {
            session.stop();
        }
    }

    #[func]
    fn send_chat(&mut self, text: GString) -> bool {
        self.session
            .as_ref()
            .is_some_and(|s| s.send_chat(&text.to_string()))
    }

    #[func]
    fn is_connected_to_chat(&self) -> bool {
        self.session.as_ref().is_some_and(|s| s.is_connected())
    }

    fn drain(&mut self) {
        let mut pending = Vec::new();
        if let Some(session) = &self.session {
            while let Some(event) = session.try_recv() {
                pending.push(event);
            }
        }
        for event in pending {
            match event {
                ChatEvent::Message {
                    kind,
                    sender,
                    content,
                } => self.signals().message().emit(
                    &GString::from(&kind),
                    &GString::from(&sender),
                    &GString::from(&content),
                ),
                ChatEvent::State(connected) => self.signals().state_changed().emit(connected),
                ChatEvent::Failed(reason) => self.signals().failed().emit(&GString::from(&reason)),
            }
        }
    }
}
