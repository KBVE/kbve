use std::collections::VecDeque;
use std::time::Duration;

use bevy_chat::{ChatMessage, MessageKind};
use tokio::sync::broadcast::error::RecvError;
use uuid::Uuid;

use crate::db::{FeedQuery, SpaceRow, get_forum_service, get_profile_service, get_wallet_client};

use super::chat::{self, SendError};
use super::claim::{CLAIM_TTL, claims};
use super::games;
use super::presence;
use super::render::{Ink, Screen, Term, truncate, wrap_lines};
use super::telnet::{ReadError, TelnetConn};

const MAX_THREADS: i32 = 20;
const MAX_BODY_CHARS: usize = 6000;
const CLAIM_POLL: Duration = Duration::from_secs(5);
const CHAT_SCROLLBACK: usize = 200;
const KEY_ESC: u8 = 0x1B;
const KEY_CR: u8 = 0x0D;
const KEY_BS: u8 = 0x08;
const KEY_DEL: u8 = 0x7F;

struct Account {
    user_id: String,
    username: String,
}

/// One caller's whole visit: negotiation is already done, this drives the menus.
pub struct Session {
    conn: TelnetConn,
    screen: Screen,
    id: Uuid,
    user: Option<Account>,
}

type Flow = Result<(), ReadError>;

enum Tick {
    Incoming(Result<ChatMessage, RecvError>),
    Key(u8),
}

impl Session {
    pub fn new(conn: TelnetConn, term: Term, width: usize, height: usize) -> Self {
        let id = Uuid::new_v4();
        presence::join(id, term);
        Self {
            conn,
            screen: Screen::new(term, width, height),
            id,
            user: None,
        }
    }

    pub async fn close(&mut self) {
        let _ = self.flush().await;
        self.conn.shutdown().await;
    }

    async fn flush(&mut self) -> Flow {
        let bytes = self.screen.take();
        if bytes.is_empty() {
            return Ok(());
        }
        self.conn.write(&bytes).await.map_err(ReadError::Io)
    }

    async fn key(&mut self) -> Result<char, ReadError> {
        let b = self.conn.read_key().await?;
        Ok((b as char).to_ascii_uppercase())
    }

    async fn pause(&mut self) -> Flow {
        self.screen.nl().ink(Ink::Dim).text("press any key").reset();
        self.flush().await?;
        self.conn.read_key().await?;
        Ok(())
    }

    fn handle(&self) -> &str {
        self.user
            .as_ref()
            .map(|u| u.username.as_str())
            .unwrap_or("guest")
    }

    pub async fn run(&mut self) -> Flow {
        self.splash().await?;
        loop {
            self.main_menu().await?;
            match self.key().await? {
                'M' => self.boards().await?,
                'C' => self.chat_room().await?,
                'G' => self.games().await?,
                'W' => self.who().await?,
                'A' => self.account().await?,
                'L' => {
                    if self.user.is_some() {
                        self.logoff().await?;
                    } else {
                        self.login().await?;
                    }
                }
                'Q' => {
                    self.goodbye().await?;
                    return Ok(());
                }
                _ => {}
            }
        }
    }

    async fn splash(&mut self) -> Flow {
        let online = presence::count();
        self.screen.clear().banner("K B V E   B B S");
        self.screen
            .nl()
            .ink(Ink::Body)
            .line("A terminal front door to kbve.com.")
            .ink(Ink::Dim)
            .line(&format!("{online} caller(s) online"))
            .reset();
        self.flush().await
    }

    async fn main_menu(&mut self) -> Flow {
        let handle = self.handle().to_string();
        self.screen.clear().banner("K B V E   B B S");
        self.screen.nl();
        self.screen.item('M', "Message boards");
        if chat::hub().is_some() {
            self.screen.item('C', "Chat");
        }
        self.screen.item('G', "Games");
        self.screen.item('W', "Who's online");
        self.screen.item('A', "Account");
        if self.user.is_some() {
            self.screen.item('L', "Log off");
        } else {
            self.screen.item('L', "Log in");
        }
        self.screen.item('Q', "Disconnect");
        self.screen
            .nl()
            .ink(Ink::Dim)
            .line(&format!("logged in as {handle}"))
            .reset();
        self.screen.prompt("command> ");
        self.flush().await
    }

    async fn boards(&mut self) -> Flow {
        let Some(forum) = get_forum_service() else {
            return self.unavailable("message boards").await;
        };
        let spaces = match forum.list_spaces().await {
            Ok(rows) => rows,
            Err(e) => {
                tracing::warn!(error = %e, "[bbs] list_spaces failed");
                return self.unavailable("message boards").await;
            }
        };
        if spaces.is_empty() {
            return self.unavailable("message boards").await;
        }
        loop {
            self.screen.clear().banner("MESSAGE BOARDS");
            self.screen.nl();
            for (i, space) in spaces.iter().take(9).enumerate() {
                let label = truncate(&space.name, self.screen.width.saturating_sub(8));
                self.screen
                    .item(char::from_digit(i as u32 + 1, 10).unwrap_or('?'), &label);
            }
            self.screen.item('Q', "Back");
            self.screen.prompt("board> ");
            self.flush().await?;
            let k = self.key().await?;
            if k == 'Q' {
                return Ok(());
            }
            if let Some(idx) = k.to_digit(10).and_then(|d| d.checked_sub(1)) {
                if let Some(space) = spaces.get(idx as usize).cloned() {
                    self.threads(&space).await?;
                }
            }
        }
    }

    async fn threads(&mut self, space: &SpaceRow) -> Flow {
        let Some(forum) = get_forum_service() else {
            return self.unavailable("message boards").await;
        };
        let query = FeedQuery {
            space_id: Some(&space.id),
            sort: "new",
            limit: MAX_THREADS,
            ..Default::default()
        };
        let threads = match forum.fetch_feed(&query).await {
            Ok(rows) => rows,
            Err(e) => {
                tracing::warn!(error = %e, "[bbs] fetch_feed failed");
                return self.unavailable("this board").await;
            }
        };
        if threads.is_empty() {
            self.screen
                .clear()
                .banner(&space.name.to_ascii_uppercase())
                .nl()
                .ink(Ink::Dim)
                .line("no posts yet")
                .reset();
            return self.pause().await;
        }
        loop {
            self.screen.clear().banner(&space.name.to_ascii_uppercase());
            self.screen.nl();
            let width = self.screen.width.saturating_sub(8);
            for (i, thread) in threads.iter().take(9).enumerate() {
                let label = truncate(&thread.title, width);
                self.screen
                    .item(char::from_digit(i as u32 + 1, 10).unwrap_or('?'), &label);
            }
            self.screen.item('Q', "Back");
            self.screen.prompt("read> ");
            self.flush().await?;
            let k = self.key().await?;
            if k == 'Q' {
                return Ok(());
            }
            if let Some(idx) = k.to_digit(10).and_then(|d| d.checked_sub(1)) {
                if let Some(thread) = threads.get(idx as usize) {
                    let id = thread.id.clone();
                    let title = thread.title.clone();
                    self.read_thread(&id, &title).await?;
                }
            }
        }
    }

    async fn read_thread(&mut self, thread_id: &str, title: &str) -> Flow {
        let Some(forum) = get_forum_service() else {
            return self.unavailable("message boards").await;
        };
        let thread = match forum.get_thread_by_slug_or_id(None, thread_id).await {
            Ok(Some((row, _))) => row,
            Ok(None) => return self.unavailable("that thread").await,
            Err(e) => {
                tracing::warn!(error = %e, "[bbs] get_thread failed");
                return self.unavailable("that thread").await;
            }
        };
        let comments = forum
            .get_comments_for_thread(thread_id)
            .await
            .unwrap_or_default();

        let width = self.screen.width.saturating_sub(1);
        let mut lines: Vec<String> = Vec::new();
        let author = self.name_for(&thread.author_id).await;
        lines.push(format!("by {author}"));
        lines.push(String::new());
        lines.extend(wrap_lines(clip(&thread.body), width));
        for comment in comments.iter().take(50) {
            let who = self.name_for(&comment.author_id).await;
            lines.push(String::new());
            lines.push(format!("--- {who}"));
            lines.extend(wrap_lines(clip(&comment.body), width));
        }
        self.pager(title, &lines).await
    }

    async fn pager(&mut self, title: &str, lines: &[String]) -> Flow {
        let per_page = self.screen.height_hint().saturating_sub(6).max(6);
        let mut offset = 0usize;
        loop {
            self.screen.clear().banner(&title.to_ascii_uppercase());
            self.screen.ink(Ink::Body);
            for line in lines.iter().skip(offset).take(per_page) {
                self.screen.line(line);
            }
            self.screen.reset();
            let more = offset + per_page < lines.len();
            if more {
                self.screen.prompt("-more- [space] / [q] back ");
            } else {
                self.screen.prompt("[q] back ");
            }
            self.flush().await?;
            match self.key().await? {
                'Q' => return Ok(()),
                _ if more => offset += per_page,
                _ => return Ok(()),
            }
        }
    }

    /// Live `#general`, shared with Discord, Palworld and the web client.
    /// Guests read; only a claimed account may send.
    async fn chat_room(&mut self) -> Flow {
        let Some(hub) = chat::hub() else {
            return self.unavailable("chat").await;
        };
        let mut rx = hub.subscribe();
        let mut lines: VecDeque<String> = VecDeque::new();
        let mut input = String::new();

        for msg in hub.recent() {
            push_message(&mut lines, &msg);
        }
        if !hub.online().await {
            push_line(&mut lines, "-- relay offline --".to_string());
        }
        self.draw_chat(hub.channel(), &lines, &input).await?;

        loop {
            // Keep the arms free of `self`: select! holds both futures alive
            // across the handler, so a `self` call here collides with the
            // borrow taken by `read_key`.
            let tick = tokio::select! {
                incoming = rx.recv() => Tick::Incoming(incoming),
                key = self.conn.read_key() => Tick::Key(key?),
            };

            match tick {
                Tick::Incoming(Ok(msg)) => push_message(&mut lines, &msg),
                Tick::Incoming(Err(RecvError::Lagged(n))) => {
                    push_line(&mut lines, format!("-- {n} message(s) skipped --"));
                }
                Tick::Incoming(Err(RecvError::Closed)) => return Ok(()),
                Tick::Key(KEY_ESC) => return Ok(()),
                Tick::Key(KEY_CR) => {
                    let text = std::mem::take(&mut input);
                    if text.trim().eq_ignore_ascii_case("/quit") {
                        return Ok(());
                    }
                    self.say(hub, &text, &mut lines).await;
                }
                Tick::Key(KEY_BS | KEY_DEL) => {
                    input.pop();
                }
                Tick::Key(b'Q' | b'q') if self.user.is_none() => return Ok(()),
                Tick::Key(b @ 0x20..=0x7E) if self.user.is_some() => {
                    if input.len() < chat::MAX_CHAT_LEN {
                        input.push(b as char);
                    }
                }
                Tick::Key(_) => {}
            }

            self.draw_chat(hub.channel(), &lines, &input).await?;
        }
    }

    async fn say(&mut self, hub: &chat::ChatHub, text: &str, lines: &mut VecDeque<String>) {
        let Some(account) = self.user.as_ref() else {
            push_line(lines, "-- log in to chat --".to_string());
            return;
        };
        let (user_id, username) = (account.user_id.clone(), account.username.clone());
        match hub.send(&user_id, &username, text).await {
            // The hub rebroadcasts an accepted line to every subscriber, this
            // session included, so it arrives through `rx` like any other.
            Ok(()) => {}
            Err(SendError::Empty) => {}
            Err(SendError::TooFast) => push_line(lines, "-- slow down --".to_string()),
            Err(SendError::Offline) => push_line(lines, "-- relay offline --".to_string()),
        }
    }

    async fn draw_chat(&mut self, channel: &str, lines: &VecDeque<String>, input: &str) -> Flow {
        let width = self.screen.width.saturating_sub(1);
        let rows = self.screen.height_hint().saturating_sub(8).max(4);
        self.screen
            .clear()
            .banner(&format!("CHAT {}", channel.to_ascii_uppercase()));
        self.screen.nl().ink(Ink::Body);
        for line in lines.iter().skip(lines.len().saturating_sub(rows)) {
            self.screen.line(&truncate(line, width));
        }
        self.screen.reset();
        if self.user.is_some() {
            self.screen
                .nl()
                .ink(Ink::Dim)
                .line("[enter] send  [esc] back")
                .reset()
                .prompt("say> ")
                .text(input);
        } else {
            self.screen
                .nl()
                .ink(Ink::Dim)
                .line("read only - choose [L] to log in")
                .reset()
                .prompt("[esc] back ");
        }
        self.flush().await
    }

    /// `[G] Games` — pick a title, then drive it one keypress per redraw.
    async fn games(&mut self) -> Flow {
        loop {
            self.screen.clear().banner("GAMES");
            self.screen.nl();
            for entry in games::CATALOG {
                self.screen.item(entry.key, entry.label);
            }
            self.screen.item('Q', "Back");
            self.screen.prompt("game> ");
            self.flush().await?;

            let key = self.key().await?;
            if key == 'Q' {
                return Ok(());
            }
            if let Some(mut game) = games::launch(key) {
                self.play(game.as_mut()).await?;
            }
        }
    }

    async fn play(&mut self, game: &mut (dyn games::Game + Send)) -> Flow {
        loop {
            let title = game.title().to_string();
            self.screen.clear().banner(&title);
            game.draw(&mut self.screen);
            self.flush().await?;

            if game.on_key(self.key().await?) == games::Flow::Exit {
                return Ok(());
            }
        }
    }

    async fn who(&mut self) -> Flow {
        let callers = presence::callers();
        self.screen.clear().banner("WHO'S ONLINE");
        self.screen.nl().ink(Ink::Body);
        for caller in callers.iter().take(20) {
            let mins = caller.connected_at.elapsed().as_secs() / 60;
            let kind = match caller.term {
                Term::Petscii => "petscii",
                Term::Ansi => "ansi",
            };
            self.screen.line(&format!(
                "{:<16} {:<8} {:>3}m",
                truncate(&caller.handle, 16),
                kind,
                mins
            ));
        }
        self.screen.reset();
        self.pause().await
    }

    async fn account(&mut self) -> Flow {
        self.screen.clear().banner("ACCOUNT");
        self.screen.nl().ink(Ink::Body);
        match self.user.as_ref() {
            None => {
                self.screen
                    .line("not logged in")
                    .nl()
                    .line("choose [L] from the main menu");
            }
            Some(account) => {
                let username = account.username.clone();
                let user_id = account.user_id.clone();
                self.screen.line(&format!("handle   {username}"));
                let balance = match (get_wallet_client(), Uuid::parse_str(&user_id)) {
                    (Some(wallet), Ok(uuid)) => wallet.user_balance(uuid).await.ok(),
                    _ => None,
                };
                match balance {
                    Some(row) => {
                        self.screen.line(&format!("credits  {}", row.credits));
                        self.screen.line(&format!("khash    {}", row.khash));
                    }
                    None => {
                        self.screen.line("credits  unavailable");
                    }
                }
            }
        }
        self.screen.reset();
        self.pause().await
    }

    async fn login(&mut self) -> Flow {
        let Some(slot) = claims().create(self.id) else {
            self.screen
                .clear()
                .banner("LOG IN")
                .nl()
                .warn("too many logins in flight, try again shortly");
            return self.pause().await;
        };
        let url =
            std::env::var("BBS_CLAIM_URL").unwrap_or_else(|_| "https://kbve.com/bbs/".to_string());
        let mins = CLAIM_TTL.as_secs() / 60;

        self.screen.clear().banner("LOG IN");
        self.screen
            .nl()
            .ink(Ink::Body)
            .line("Open this page on any device:")
            .nl()
            .ink(Ink::Accent)
            .line(&format!("  {url}"))
            .nl()
            .ink(Ink::Body)
            .line("and enter this code:")
            .nl();
        self.screen
            .ink(Ink::Head)
            .reverse(true)
            .line(&format!("  {}  ", slot.code))
            .reverse(false);
        self.screen
            .nl()
            .ink(Ink::Dim)
            .line(&format!("expires in {mins} minutes"))
            .line("press any key to cancel")
            .reset();
        self.flush().await?;

        let user_id = loop {
            let claimed = tokio::select! {
                claimed = slot.wait(CLAIM_POLL) => claimed,
                key = self.conn.read_key() => {
                    key?;
                    claims().cancel(&slot);
                    return Ok(());
                }
            };
            if let Some(user_id) = claimed {
                break user_id;
            }
            if slot.expired() {
                claims().cancel(&slot);
                self.screen.nl().warn("code expired");
                return self.pause().await;
            }
        };

        let username = self.name_for(&user_id).await;
        presence::rename(self.id, &username);
        self.user = Some(Account {
            user_id,
            username: username.clone(),
        });
        self.screen
            .nl()
            .ink(Ink::Prompt)
            .line(&format!("welcome back, {username}"))
            .reset();
        self.pause().await
    }

    async fn logoff(&mut self) -> Flow {
        self.user = None;
        presence::rename(self.id, "guest");
        self.screen.clear().banner("LOG OFF").nl().ink(Ink::Body);
        self.screen.line("session cleared");
        self.screen.reset();
        self.pause().await
    }

    async fn goodbye(&mut self) -> Flow {
        self.screen
            .clear()
            .banner("73's")
            .nl()
            .ink(Ink::Body)
            .line("NO CARRIER")
            .reset();
        self.flush().await
    }

    async fn unavailable(&mut self, what: &str) -> Flow {
        self.screen
            .clear()
            .banner("OFFLINE")
            .nl()
            .warn(&format!("{what} is unavailable right now"));
        self.pause().await
    }

    async fn name_for(&self, user_id: &str) -> String {
        match get_profile_service() {
            Some(profiles) => profiles
                .get_username_by_id(user_id)
                .await
                .ok()
                .flatten()
                .unwrap_or_else(|| "anon".to_string()),
            None => "anon".to_string(),
        }
    }
}

impl Drop for Session {
    fn drop(&mut self) {
        presence::leave(self.id);
    }
}

fn push_line(lines: &mut VecDeque<String>, text: String) {
    if lines.len() >= CHAT_SCROLLBACK {
        lines.pop_front();
    }
    lines.push_back(text);
}

fn push_message(lines: &mut VecDeque<String>, msg: &ChatMessage) {
    let text = match msg.kind {
        MessageKind::Chat => format!("<{}/{}> {}", msg.sender, msg.platform, msg.content),
        _ => format!("* {}", msg.content),
    };
    push_line(lines, text);
}

fn clip(body: &str) -> &str {
    match body.char_indices().nth(MAX_BODY_CHARS) {
        Some((idx, _)) => &body[..idx],
        None => body,
    }
}
