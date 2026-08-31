//! Game chat over the irc-gateway's JSON-framed WebSocket, run off the main thread.

use std::sync::mpsc::{Receiver, Sender, channel};
use std::sync::{Arc, Mutex};
use std::thread::{self, JoinHandle};
use std::time::Duration;

use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use tokio::sync::mpsc::{UnboundedSender, unbounded_channel};

pub const MAX_CONTENT: usize = 400;
pub const RECONNECT_SECONDS: f64 = 5.0;
pub const MAX_BACKOFF: f64 = 60.0;
pub const MAX_HANDSHAKE_FAILURES: u32 = 3;

/// Policy close code the gateway sends when the token is missing or refused.
const CLOSE_POLICY: u16 = 1008;

/// A connect that has not landed by here is treated as a failed handshake, so a
/// stop never waits on the operating system's own much longer timeout.
const CONNECT_TIMEOUT: Duration = Duration::from_secs(10);

/// One JSON frame on the wire, in the shape the gateway's `ChatMessage` parses.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct ChatFrame {
    pub kind: String,
    pub sender: String,
    pub platform: String,
    pub channel: String,
    pub content: String,
}

impl ChatFrame {
    /// Truncates to [`MAX_CONTENT`] rather than letting the gateway drop the frame.
    pub fn chat(sender: &str, platform: &str, channel: &str, content: &str) -> Self {
        let body = content.trim();
        let cut = body
            .char_indices()
            .nth(MAX_CONTENT)
            .map_or(body.len(), |(i, _)| i);
        Self {
            kind: "chat".into(),
            sender: sender.into(),
            platform: platform.into(),
            channel: channel.into(),
            content: body[..cut].into(),
        }
    }
}

/// What the session tells the game about, drained on the main thread.
#[derive(Clone, Debug, PartialEq)]
pub enum ChatEvent {
    Message {
        kind: String,
        sender: String,
        content: String,
    },
    State(bool),
    Failed(String),
}

/// Why a socket went away, which decides whether reconnecting is worth trying.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Disconnect {
    /// The gateway refused the token; retrying with the same one repeats it.
    Refused,
    /// Never reached open, so the handshake itself is what failed.
    Handshake,
    /// Was open and dropped, which a reconnect can recover.
    Dropped,
}

/// Reads the close of a socket as a reason to stop or a reason to wait.
pub fn classify(close_code: Option<u16>, opened: bool) -> Disconnect {
    if close_code == Some(CLOSE_POLICY) {
        Disconnect::Refused
    } else if opened {
        Disconnect::Dropped
    } else {
        Disconnect::Handshake
    }
}

/// Doubles up to [`MAX_BACKOFF`] so a gateway that is down is not hammered.
pub fn next_backoff(current: f64) -> f64 {
    (current * 2.0).min(MAX_BACKOFF)
}

/// Spreads a wait across +/-25%, given a roll in `0.0..1.0`.
///
/// Every client climbs the same ladder from the same event, so without this a
/// gateway restart is answered by the whole population reconnecting in step, at
/// the moment it has least to spare.
pub fn with_jitter(seconds: f64, roll: f64) -> f64 {
    seconds * (0.75 + 0.5 * roll.clamp(0.0, 1.0))
}

/// A roll in `0.0..1.0` from the clock, which is enough to break a lockstep.
fn roll() -> f64 {
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_or(0, |d| d.subsec_nanos() as u64);
    (nanos % 1_000) as f64 / 1_000.0
}

#[derive(Clone, Debug)]
pub struct ChatConfig {
    pub host: String,
    pub game: String,
    pub channel: String,
    pub platform: String,
}

impl Default for ChatConfig {
    fn default() -> Self {
        Self {
            host: "wss://chat.kbve.com/gamechat".into(),
            game: "friendslop".into(),
            channel: "#general".into(),
            platform: "friendslop".into(),
        }
    }
}

enum Command {
    Start { token: String, sender: String },
    Send(String),
    Stop,
}

/// Handle to a chat session owning its own runtime on its own thread.
pub struct ChatSession {
    commands: UnboundedSender<Command>,
    events: Receiver<ChatEvent>,
    connected: Arc<Mutex<bool>>,
    thread: Option<JoinHandle<()>>,
}

impl ChatSession {
    pub fn spawn(config: ChatConfig) -> Self {
        let (commands, command_rx) = unbounded_channel::<Command>();
        let (event_tx, events) = channel::<ChatEvent>();
        let connected = Arc::new(Mutex::new(false));
        let flag = connected.clone();
        let thread = thread::Builder::new()
            .name("q-chat".into())
            .spawn(move || run(config, command_rx, event_tx, flag))
            .expect("spawn chat thread");
        Self {
            commands,
            events,
            connected,
            thread: Some(thread),
        }
    }

    pub fn start(&self, token: &str, sender: &str) {
        let _ = self.commands.send(Command::Start {
            token: token.to_string(),
            sender: sender.to_string(),
        });
    }

    pub fn stop(&self) {
        let _ = self.commands.send(Command::Stop);
    }

    pub fn send_chat(&self, text: &str) -> bool {
        if text.trim().is_empty() || !self.is_connected() {
            return false;
        }
        self.commands.send(Command::Send(text.to_string())).is_ok()
    }

    pub fn is_connected(&self) -> bool {
        *self.connected.lock().unwrap()
    }

    pub fn try_recv(&self) -> Option<ChatEvent> {
        self.events.try_recv().ok()
    }
}

impl Drop for ChatSession {
    fn drop(&mut self) {
        let _ = self.commands.send(Command::Stop);
        if let Some(t) = self.thread.take() {
            let _ = t.join();
        }
    }
}

fn run(
    config: ChatConfig,
    mut commands: tokio::sync::mpsc::UnboundedReceiver<Command>,
    events: Sender<ChatEvent>,
    connected: Arc<Mutex<bool>>,
) {
    let runtime = match tokio::runtime::Builder::new_multi_thread()
        .worker_threads(1)
        .enable_all()
        .build()
    {
        Ok(rt) => rt,
        Err(e) => {
            let _ = events.send(ChatEvent::Failed(format!("chat runtime: {e}")));
            return;
        }
    };

    runtime.block_on(async move {
        let mut token = String::new();
        let mut sender = String::new();
        let mut want = false;
        let mut backoff = RECONNECT_SECONDS;
        let mut handshake_failures = 0u32;

        loop {
            if !want {
                match commands.recv().await {
                    Some(Command::Start {
                        token: t,
                        sender: s,
                    }) => {
                        token = t;
                        sender = s;
                        want = true;
                        backoff = RECONNECT_SECONDS;
                        handshake_failures = 0;
                    }
                    Some(Command::Stop) | None => return,
                    Some(Command::Send(_)) => {}
                }
                continue;
            }

            let url = format!(
                "{}?game={}&token={}",
                config.host,
                config.game,
                urlencode(&token)
            );
            let (frames_tx, frames_rx) = unbounded_channel::<ChatFrame>();
            let outcome = pump(
                &url,
                &config,
                &sender,
                frames_rx,
                &mut commands,
                &events,
                &connected,
                &frames_tx,
            )
            .await;
            *connected.lock().unwrap() = false;
            let _ = events.send(ChatEvent::State(false));

            match outcome {
                Pump::Stopped => return,
                Pump::Closed(reason) => match reason {
                    Disconnect::Refused => {
                        let _ = events.send(ChatEvent::Failed("chat.signin_required".into()));
                        want = false;
                    }
                    Disconnect::Handshake => {
                        handshake_failures += 1;
                        if handshake_failures >= MAX_HANDSHAKE_FAILURES {
                            let _ = events.send(ChatEvent::Failed("chat.unavailable".into()));
                            want = false;
                            continue;
                        }
                        let _ = events.send(ChatEvent::Failed("chat.unreachable".into()));
                        sleep_or_stop(with_jitter(backoff, roll()), &mut commands).await;
                        backoff = next_backoff(backoff);
                    }
                    Disconnect::Dropped => {
                        handshake_failures = 0;
                        let _ = events.send(ChatEvent::Failed("chat.reconnecting".into()));
                        sleep_or_stop(with_jitter(backoff, roll()), &mut commands).await;
                        backoff = next_backoff(backoff);
                    }
                },
            }
        }
    });
}

enum Pump {
    Stopped,
    Closed(Disconnect),
}

#[allow(clippy::too_many_arguments)]
async fn pump(
    url: &str,
    config: &ChatConfig,
    sender: &str,
    mut frames_rx: tokio::sync::mpsc::UnboundedReceiver<ChatFrame>,
    commands: &mut tokio::sync::mpsc::UnboundedReceiver<Command>,
    events: &Sender<ChatEvent>,
    connected: &Arc<Mutex<bool>>,
    frames_tx: &UnboundedSender<ChatFrame>,
) -> Pump {
    use tokio_tungstenite::tungstenite::Message;

    let connect = tokio::time::timeout(CONNECT_TIMEOUT, tokio_tungstenite::connect_async(url));
    tokio::pin!(connect);
    let socket = loop {
        tokio::select! {
            attempt = &mut connect => match attempt {
                Ok(Ok((s, _))) => break s,
                Ok(Err(_)) | Err(_) => return Pump::Closed(Disconnect::Handshake),
            },
            cmd = commands.recv() => match cmd {
                Some(Command::Stop) | None => return Pump::Stopped,
                _ => {}
            },
        }
    };
    let (mut sink, mut stream) = socket.split();
    *connected.lock().unwrap() = true;
    let _ = events.send(ChatEvent::State(true));

    loop {
        tokio::select! {
            cmd = commands.recv() => match cmd {
                Some(Command::Send(text)) => {
                    let frame = ChatFrame::chat(sender, &config.platform, &config.channel, &text);
                    let _ = frames_tx.send(frame);
                }
                Some(Command::Stop) | None => {
                    let _ = sink.close().await;
                    return Pump::Stopped;
                }
                Some(Command::Start { .. }) => {}
            },
            Some(frame) = frames_rx.recv() => {
                let json = match serde_json::to_string(&frame) {
                    Ok(j) => j,
                    Err(_) => continue,
                };
                if sink.send(Message::Text(json.into())).await.is_err() {
                    return Pump::Closed(Disconnect::Dropped);
                }
                // IRC hands no PRIVMSG back to whoever sent it.
                let _ = events.send(ChatEvent::Message {
                    kind: frame.kind,
                    sender: frame.sender,
                    content: frame.content,
                });
            }
            incoming = stream.next() => match incoming {
                Some(Ok(Message::Text(text))) => {
                    if let Ok(frame) = serde_json::from_str::<ChatFrame>(&text)
                        && !frame.content.is_empty()
                    {
                        let _ = events.send(ChatEvent::Message {
                            kind: frame.kind,
                            sender: frame.sender,
                            content: frame.content,
                        });
                    }
                }
                Some(Ok(Message::Close(frame))) => {
                    let code = frame.map(|f| u16::from(f.code));
                    return Pump::Closed(classify(code, true));
                }
                Some(Ok(_)) => {}
                Some(Err(_)) | None => return Pump::Closed(Disconnect::Dropped),
            },
        }
    }
}

async fn sleep_or_stop(seconds: f64, commands: &mut tokio::sync::mpsc::UnboundedReceiver<Command>) {
    let wait = tokio::time::sleep(Duration::from_secs_f64(seconds));
    tokio::pin!(wait);
    loop {
        tokio::select! {
            _ = &mut wait => return,
            cmd = commands.recv() => match cmd {
                Some(Command::Stop) | None => return,
                _ => {}
            },
        }
    }
}

/// Percent-encodes everything a JWT may carry that a query string may not.
fn urlencode(raw: &str) -> String {
    let mut out = String::with_capacity(raw.len());
    for b in raw.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(b as char)
            }
            _ => out.push_str(&format!("%{b:02X}")),
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_refused_token_is_not_something_to_retry() {
        assert_eq!(classify(Some(CLOSE_POLICY), true), Disconnect::Refused);
        assert_eq!(classify(Some(CLOSE_POLICY), false), Disconnect::Refused);
    }

    #[test]
    fn a_socket_that_never_opened_failed_its_handshake() {
        assert_eq!(classify(None, false), Disconnect::Handshake);
        assert_eq!(classify(Some(1006), false), Disconnect::Handshake);
    }

    #[test]
    fn a_socket_that_was_open_is_worth_reconnecting() {
        assert_eq!(classify(None, true), Disconnect::Dropped);
        assert_eq!(classify(Some(1001), true), Disconnect::Dropped);
    }

    #[test]
    fn backoff_doubles_but_stops_climbing() {
        let mut b = RECONNECT_SECONDS;
        for _ in 0..20 {
            b = next_backoff(b);
        }
        assert_eq!(b, MAX_BACKOFF);
        assert_eq!(next_backoff(RECONNECT_SECONDS), 10.0);
    }

    #[test]
    fn a_wait_is_spread_so_clients_do_not_return_in_step() {
        assert_eq!(with_jitter(20.0, 0.0), 15.0);
        assert_eq!(with_jitter(20.0, 1.0), 25.0);
        assert_eq!(with_jitter(20.0, 0.5), 20.0);
        for step in 0..=100 {
            let spread = with_jitter(MAX_BACKOFF, step as f64 / 100.0);
            assert!(
                (MAX_BACKOFF * 0.75..=MAX_BACKOFF * 1.25).contains(&spread),
                "{spread} left the band"
            );
        }
    }

    #[test]
    fn the_clock_gives_a_roll_inside_the_band() {
        for _ in 0..64 {
            let r = roll();
            assert!((0.0..1.0).contains(&r), "{r} is not a roll");
        }
    }

    #[test]
    fn a_long_message_is_cut_rather_than_dropped() {
        let long = "x".repeat(MAX_CONTENT + 50);
        let frame = ChatFrame::chat("me", "friendslop", "#general", &long);
        assert_eq!(frame.content.chars().count(), MAX_CONTENT);
    }

    #[test]
    fn a_multibyte_message_is_cut_on_a_character() {
        let long = "é".repeat(MAX_CONTENT + 10);
        let frame = ChatFrame::chat("me", "friendslop", "#general", &long);
        assert_eq!(frame.content.chars().count(), MAX_CONTENT);
    }

    #[test]
    fn a_frame_carries_the_shape_the_gateway_parses() {
        let frame = ChatFrame::chat("me", "friendslop", "#general", "  hello  ");
        let json: serde_json::Value =
            serde_json::from_str(&serde_json::to_string(&frame).unwrap()).unwrap();
        assert_eq!(json["kind"], "chat");
        assert_eq!(json["channel"], "#general");
        assert_eq!(json["content"], "hello");
    }

    #[test]
    fn a_token_is_safe_to_put_in_a_query_string() {
        assert_eq!(urlencode("a.b-c_d~e"), "a.b-c_d~e");
        assert_eq!(urlencode("a+b/c=d&e"), "a%2Bb%2Fc%3Dd%26e");
    }

    #[test]
    fn sending_nothing_is_refused_before_it_reaches_the_socket() {
        let session = ChatSession::spawn(ChatConfig::default());
        assert!(!session.send_chat("   "));
        assert!(!session.send_chat("hello"));
    }
}

#[cfg(test)]
mod wire_tests {
    use super::*;
    use axum::Router;
    use axum::extract::ws::{Message as AxumMessage, WebSocket, WebSocketUpgrade};
    use axum::response::IntoResponse;
    use axum::routing::get;
    use std::time::Instant;

    async fn gateway(ws: WebSocketUpgrade) -> impl IntoResponse {
        ws.on_upgrade(|mut socket: WebSocket| async move {
            while let Some(Ok(msg)) = socket.recv().await {
                if let AxumMessage::Text(text) = msg {
                    let mut frame: ChatFrame = match serde_json::from_str(&text) {
                        Ok(f) => f,
                        Err(_) => continue,
                    };
                    frame.sender = "someone_else".into();
                    frame.content = format!("heard {}", frame.content);
                    let out = serde_json::to_string(&frame).unwrap();
                    if socket.send(AxumMessage::Text(out.into())).await.is_err() {
                        return;
                    }
                }
            }
        })
    }

    async fn refuser(ws: WebSocketUpgrade) -> impl IntoResponse {
        ws.on_upgrade(|mut socket: WebSocket| async move {
            let _ = socket
                .send(AxumMessage::Close(Some(axum::extract::ws::CloseFrame {
                    code: 1008,
                    reason: "no token".into(),
                })))
                .await;
        })
    }

    /// Serves `router` on a loopback port and returns the ws:// url for it.
    fn serve(router: Router) -> (String, tokio::runtime::Runtime) {
        let rt = tokio::runtime::Builder::new_multi_thread()
            .worker_threads(1)
            .enable_all()
            .build()
            .unwrap();
        let listener = rt
            .block_on(tokio::net::TcpListener::bind("127.0.0.1:0"))
            .unwrap();
        let port = listener.local_addr().unwrap().port();
        rt.spawn(async move {
            let _ = axum::serve(listener, router).await;
        });
        (format!("ws://127.0.0.1:{port}/gamechat"), rt)
    }

    fn collect(session: &ChatSession, want: usize, limit: Duration) -> Vec<ChatEvent> {
        let start = Instant::now();
        let mut seen = Vec::new();
        while seen.len() < want && start.elapsed() < limit {
            match session.try_recv() {
                Some(event) => seen.push(event),
                None => thread::sleep(Duration::from_millis(10)),
            }
        }
        seen
    }

    fn config(host: String) -> ChatConfig {
        ChatConfig {
            host,
            ..ChatConfig::default()
        }
    }

    #[test]
    fn a_sender_sees_their_own_line_and_the_reply() {
        let (url, _rt) = serve(Router::new().route("/gamechat", get(gateway)));
        let session = ChatSession::spawn(config(url));
        session.start("token", "me");

        let start = Instant::now();
        while !session.is_connected() && start.elapsed() < Duration::from_secs(5) {
            thread::sleep(Duration::from_millis(10));
        }
        assert!(
            session.is_connected(),
            "never connected to the test gateway"
        );

        assert!(session.send_chat("hello"));
        let seen = collect(&session, 3, Duration::from_secs(5));

        assert!(
            seen.contains(&ChatEvent::State(true)),
            "no connected state: {seen:?}"
        );
        assert!(
            seen.contains(&ChatEvent::Message {
                kind: "chat".into(),
                sender: "me".into(),
                content: "hello".into(),
            }),
            "the sender never saw their own line: {seen:?}"
        );
        assert!(
            seen.contains(&ChatEvent::Message {
                kind: "chat".into(),
                sender: "someone_else".into(),
                content: "heard hello".into(),
            }),
            "the reply never arrived: {seen:?}"
        );
    }

    /// A connect to a black hole hangs until the OS gives up, which is far longer
    /// than anyone waits to close a game.
    #[test]
    fn dropping_a_session_does_not_wait_on_a_connect() {
        let session = ChatSession::spawn(config("ws://10.255.255.1:81/gamechat".into()));
        session.start("token", "me");
        thread::sleep(Duration::from_millis(200));
        let start = Instant::now();
        drop(session);
        assert!(
            start.elapsed() < Duration::from_secs(3),
            "closing took {:?}, so a stop is waiting on the socket",
            start.elapsed()
        );
    }

    #[test]
    fn a_refused_token_stops_instead_of_reconnecting_forever() {
        let (url, _rt) = serve(Router::new().route("/gamechat", get(refuser)));
        let session = ChatSession::spawn(config(url));
        session.start("bad", "me");

        let seen = collect(&session, 4, Duration::from_secs(5));
        assert!(
            seen.contains(&ChatEvent::Failed("chat.signin_required".into())),
            "a policy close should ask for a sign-in: {seen:?}"
        );
        assert!(
            !seen
                .iter()
                .any(|e| *e == ChatEvent::Failed("chat.reconnecting".into())),
            "a refused token must not be retried: {seen:?}"
        );
    }
}
