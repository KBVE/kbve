//! WASM WebSocket transport for `ChatClient`.
//!
//! Connects to an IRC-over-WebSocket endpoint (e.g. `wss://chat.kbve.com`)
//! using `web_sys::WebSocket`. Same IRC protocol as the native client, just
//! framed in WebSocket text messages instead of raw TCP.

use std::cell::RefCell;
use std::rc::Rc;

use wasm_bindgen::JsCast;
use wasm_bindgen::prelude::*;
use web_sys::{MessageEvent, WebSocket};

use crate::config::IrcConfig;
use crate::message::ChatMessage;

/// WASM IRC client that connects via WebSocket.
///
/// Uses `web_sys::WebSocket` for the browser environment.
/// Not `Send`/`Sync` — must be used from the main thread.
/// The Bevy plugin bridges this into ECS via crossbeam channels.
#[derive(Clone)]
pub struct ChatClient {
    config: IrcConfig,
    ws: Rc<RefCell<Option<WebSocket>>>,
    /// Incoming message callback buffer — polled by the Bevy plugin.
    incoming: Rc<RefCell<Vec<ChatMessage>>>,
}

impl ChatClient {
    /// Create a new client from config. Does NOT connect yet — call [`connect`].
    pub fn new(config: IrcConfig) -> Self {
        Self {
            config,
            ws: Rc::new(RefCell::new(None)),
            incoming: Rc::new(RefCell::new(Vec::new())),
        }
    }

    /// Create a client from a WebSocket URL and config.
    pub fn with_url(url: &str, mut config: IrcConfig) -> Self {
        config.host = url.to_owned();
        Self::new(config)
    }

    /// Drain all pending incoming messages (non-blocking).
    pub fn drain_incoming(&self) -> Vec<ChatMessage> {
        let mut buf = self.incoming.borrow_mut();
        std::mem::take(&mut *buf)
    }

    /// Connect to the IRC-over-WebSocket endpoint.
    ///
    /// The URL should be the full WebSocket URL (e.g. `wss://chat.kbve.com`).
    /// If the config host starts with `ws://` or `wss://`, it's used directly;
    /// otherwise `ws://` is prepended.
    pub fn connect(&self) -> Result<(), String> {
        let url = if self.config.host.starts_with("ws://") || self.config.host.starts_with("wss://")
        {
            self.config.host.clone()
        } else if self.config.tls {
            format!("wss://{}:{}", self.config.host, self.config.port)
        } else {
            format!("ws://{}:{}", self.config.host, self.config.port)
        };

        tracing::info!("IRC-WS connecting to {}", url);

        let ws = WebSocket::new(&url).map_err(|e| format!("WebSocket create failed: {:?}", e))?;
        ws.set_binary_type(web_sys::BinaryType::Arraybuffer);

        // Set up onmessage handler
        let incoming = self.incoming.clone();
        let nick = self.config.nick.clone();
        let ws_clone = ws.clone();
        let onmessage = Closure::<dyn FnMut(MessageEvent)>::new(move |e: MessageEvent| {
            if let Ok(text) = e.data().dyn_into::<js_sys::JsString>() {
                let line: String = text.into();
                // Handle PING/PONG
                if line.starts_with("PING") {
                    let pong = line.replacen("PING", "PONG", 1);
                    let _ = ws_clone.send_with_str(&format!("{}\r\n", pong));
                    return;
                }
                // Parse PRIVMSG
                if let Some(msg) = parse_privmsg(&line, &nick) {
                    incoming.borrow_mut().push(msg);
                }
            }
        });
        ws.set_onmessage(Some(onmessage.as_ref().unchecked_ref()));
        onmessage.forget(); // Leak closure (lives for WebSocket lifetime)

        // Set up onopen handler — send registration + join channels
        let nick_reg = self.config.nick.clone();
        let channels = self.config.channels.clone();
        let password = self.config.password.clone();
        let ws_reg = ws.clone();
        let onopen = Closure::<dyn FnMut()>::new(move || {
            tracing::info!("IRC-WS connected, registering as {}", nick_reg);
            if let Some(ref pass) = password {
                let _ = ws_reg.send_with_str(&format!("PASS {}\r\n", pass));
            }
            let _ = ws_reg.send_with_str(&format!("NICK {}\r\n", nick_reg));
            let _ = ws_reg.send_with_str(&format!("USER {} 0 * :bevy_chat wasm\r\n", nick_reg));
            for ch in &channels {
                let _ = ws_reg.send_with_str(&format!("JOIN {}\r\n", ch));
            }
        });
        ws.set_onopen(Some(onopen.as_ref().unchecked_ref()));
        onopen.forget();

        // Log errors
        let onerror = Closure::<dyn FnMut()>::new(|| {
            tracing::warn!("IRC-WS connection error");
        });
        ws.set_onerror(Some(onerror.as_ref().unchecked_ref()));
        onerror.forget();

        let onclose = Closure::<dyn FnMut()>::new(|| {
            tracing::warn!("IRC-WS connection closed");
        });
        ws.set_onclose(Some(onclose.as_ref().unchecked_ref()));
        onclose.forget();

        *self.ws.borrow_mut() = Some(ws);
        Ok(())
    }

    /// Send a structured `ChatMessage` to its target channel.
    pub fn send(&self, msg: &ChatMessage) -> Result<(), String> {
        let irc_line = msg.to_irc_privmsg();
        self.send_raw(&irc_line)
    }

    /// Send a raw IRC line via WebSocket.
    pub fn send_raw(&self, line: &str) -> Result<(), String> {
        let ws = self.ws.borrow();
        let ws = ws.as_ref().ok_or("IRC-WS not connected")?;
        ws.send_with_str(&format!("{}\r\n", line))
            .map_err(|e| format!("IRC-WS send failed: {:?}", e))
    }

    /// Whether the WebSocket is currently open.
    pub fn is_connected(&self) -> bool {
        self.ws
            .borrow()
            .as_ref()
            .is_some_and(|ws| ws.ready_state() == WebSocket::OPEN)
    }

    /// Close the WebSocket connection.
    pub fn disconnect(&self) {
        if let Some(ws) = self.ws.borrow().as_ref() {
            let _ = ws.send_with_str("QUIT :bevy_chat disconnecting\r\n");
            let _ = ws.close();
        }
        *self.ws.borrow_mut() = None;
    }
}

/// Parse a raw IRC PRIVMSG line into a `ChatMessage` (shared with native client).
fn parse_privmsg(line: &str, own_nick: &str) -> Option<ChatMessage> {
    let line = line.trim();
    let line = line.strip_prefix(':')?;
    let (prefix, rest) = line.split_once(' ')?;
    let sender_nick = prefix.split('!').next()?;
    if sender_nick == own_nick {
        return None;
    }
    let rest = rest.strip_prefix("PRIVMSG ")?;
    let (channel, message) = rest.split_once(" :")?;
    ChatMessage::from_irc_privmsg(channel, message)
        .or_else(|| Some(ChatMessage::chat(sender_nick, "irc", channel, message)))
}
