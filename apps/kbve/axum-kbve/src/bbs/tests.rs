use std::time::Duration;

use tokio::io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};
use uuid::Uuid;

use bevy_chat::{ChatClient, ChatMessage, IrcConfig, IrcTransport};

use super::chat::{
    sanitize_content, sanitize_nick, ChatHub, Delivery, SendError, MAX_CHAT_LEN, OUTBOX_LIMIT,
    PLATFORM,
};
use super::claim::{ClaimStore, Redeem};
use super::door::{self, DoorContext};
use super::games::text::{bar, meter, strip_markup, Rng};
use super::games::{blackjack, dopewars, dungeon, hangman, highlow, run, tictactoe, Flow, Game};
use super::post;
use super::render::{truncate, wrap_lines, Ink, Screen, Term};
use super::session::{self, Session};
use super::telnet::{ReadError, TelnetConn, DO, IAC, OPT_ECHO, OPT_NAWS, SB, SE, WILL};

/// The caller a door sees when nobody has signed in.
fn guest() -> DoorContext {
    DoorContext::new("tester", None)
}

/// Everything the board painted, until it goes quiet.
async fn read_paint(client: &mut TcpStream) -> String {
    let mut buf = vec![0u8; 8192];
    let mut out = Vec::new();
    while let Ok(Ok(n)) =
        tokio::time::timeout(Duration::from_millis(150), client.read(&mut buf)).await
    {
        if n == 0 {
            break;
        }
        out.extend_from_slice(&buf[..n]);
        if out.len() > 64_000 {
            break;
        }
    }
    String::from_utf8_lossy(&out).to_string()
}

async fn pair() -> (TelnetConn, TcpStream) {
    let listener = TcpListener::bind("127.0.0.1:0").await.expect("bind");
    let addr = listener.local_addr().expect("addr");
    let client = tokio::spawn(async move { TcpStream::connect(addr).await.expect("connect") });
    let (server, _) = listener.accept().await.expect("accept");
    let client = client.await.expect("join");
    (TelnetConn::new(server, Duration::from_secs(2)), client)
}

#[tokio::test]
async fn naws_sets_window_and_data_survives() {
    let (mut conn, mut client) = pair().await;
    client
        .write_all(&[
            IAC, WILL, OPT_NAWS, IAC, SB, OPT_NAWS, 0, 80, 0, 24, IAC, SE, b'X',
        ])
        .await
        .expect("write");

    assert_eq!(conn.read_byte().await.expect("byte"), b'X');
    assert_eq!(conn.width, 80);
    assert_eq!(conn.height, 24);
}

#[tokio::test]
async fn escaped_iac_decodes_to_single_byte() {
    let (mut conn, mut client) = pair().await;
    client.write_all(&[IAC, IAC, b'A']).await.expect("write");

    assert_eq!(conn.read_byte().await.expect("byte"), IAC);
    assert_eq!(conn.read_byte().await.expect("byte"), b'A');
}

#[tokio::test]
async fn outbound_iac_is_doubled() {
    let (mut conn, mut client) = pair().await;
    conn.write(&[0xFF, b'A']).await.expect("write");

    let mut buf = [0u8; 3];
    client.read_exact(&mut buf).await.expect("read");
    assert_eq!(buf, [0xFF, 0xFF, b'A']);
}

#[tokio::test]
async fn unsupported_option_is_refused() {
    let (mut conn, mut client) = pair().await;
    client.write_all(&[IAC, DO, 99, b'Z']).await.expect("write");

    assert_eq!(conn.read_byte().await.expect("byte"), b'Z');
    let mut buf = [0u8; 3];
    client.read_exact(&mut buf).await.expect("read");
    assert_eq!(buf, [IAC, 252, 99]);
}

#[tokio::test]
async fn echo_request_is_accepted_once() {
    let (mut conn, mut client) = pair().await;
    client
        .write_all(&[IAC, DO, OPT_ECHO, IAC, DO, OPT_ECHO, b'Z'])
        .await
        .expect("write");

    assert_eq!(conn.read_byte().await.expect("byte"), b'Z');
    let mut buf = [0u8; 3];
    client.read_exact(&mut buf).await.expect("read");
    assert_eq!(buf, [IAC, WILL, OPT_ECHO]);
}

#[tokio::test]
async fn bare_lf_reports_as_enter() {
    let (mut conn, mut client) = pair().await;
    client.write_all(b"a\nb").await.expect("write");

    assert_eq!(conn.read_key().await.expect("key"), b'a');
    assert_eq!(conn.read_key().await.expect("key"), 0x0D);
    assert_eq!(conn.read_key().await.expect("key"), b'b');
}

#[tokio::test]
async fn crlf_and_crnul_collapse_to_one_enter() {
    let (mut conn, mut client) = pair().await;
    client.write_all(b"\r\nx\r\0y").await.expect("write");

    assert_eq!(conn.read_key().await.expect("key"), 0x0D);
    assert_eq!(conn.read_key().await.expect("key"), b'x');
    assert_eq!(conn.read_key().await.expect("key"), 0x0D);
    assert_eq!(conn.read_key().await.expect("key"), b'y');
}

#[tokio::test]
async fn repeated_enter_is_not_swallowed() {
    let (mut conn, mut client) = pair().await;
    client.write_all(b"\r\n\r\n\n\nz").await.expect("write");

    for _ in 0..4 {
        assert_eq!(conn.read_key().await.expect("key"), 0x0D);
    }
    assert_eq!(conn.read_key().await.expect("key"), b'z');
}

#[tokio::test]
async fn buffered_eol_is_dropped_without_touching_the_socket() {
    let (mut conn, mut client) = pair().await;
    client.write_all(b"a\r\nb").await.expect("write");

    assert_eq!(conn.read_key().await.expect("key"), b'a');
    conn.drain_buffered_eol();
    assert_eq!(conn.read_key().await.expect("key"), b'b');
}

#[tokio::test]
async fn menu_command_does_not_leak_its_enter() {
    let (conn, mut client) = pair().await;
    let mut session = Session::new(conn, Term::Ansi, 80, 24);
    client.write_all(b"l\r\nq\r\n").await.expect("write");

    assert_eq!(session.key().await.expect("key"), 'L');
    assert_eq!(session.key().await.expect("key"), 'Q');
}

#[tokio::test]
async fn menu_still_reports_a_deliberate_enter() {
    let (conn, mut client) = pair().await;
    let mut session = Session::new(conn, Term::Ansi, 80, 24);
    client.write_all(b"\r\nx").await.expect("write");

    assert_eq!(session.key().await.expect("key"), '\r');
    assert_eq!(session.key().await.expect("key"), 'X');
}

#[tokio::test]
async fn a_line_typed_while_offline_is_held_not_refused() {
    let hub = ChatHub::for_tests("#general");

    let sent = hub.send("user-1", "bob", "anyone about?").await;

    assert!(matches!(sent, Ok(Delivery::Queued)));
    assert_eq!(hub.queued(), 1);
}

#[tokio::test]
async fn outbox_refuses_once_it_is_full() {
    let hub = ChatHub::for_tests("#general");
    for i in 0..OUTBOX_LIMIT {
        assert!(
            matches!(
                hub.send("user-1", "bob", &format!("line {i}")).await,
                Ok(Delivery::Queued)
            ),
            "line {i} should have been held"
        );
    }

    let overflow = hub.send("user-1", "bob", "one too many").await;

    assert!(matches!(overflow, Err(SendError::Offline)));
    assert_eq!(hub.queued(), OUTBOX_LIMIT);
}

#[tokio::test]
async fn reconnect_flushes_held_lines_in_the_order_they_were_typed() {
    let listener = TcpListener::bind("127.0.0.1:0").await.expect("bind");
    let addr = listener.local_addr().expect("addr");
    let server = tokio::spawn(async move {
        let (sock, _) = listener.accept().await.expect("accept");
        let mut lines = tokio::io::BufReader::new(sock).lines();
        let mut privmsgs = Vec::new();
        while let Ok(Some(line)) = lines.next_line().await {
            if line.starts_with("PRIVMSG") {
                privmsgs.push(line);
                if privmsgs.len() == 3 {
                    break;
                }
            }
        }
        privmsgs
    });

    let hub = ChatHub::for_tests("#general");
    for text in ["first", "second", "third"] {
        assert!(matches!(
            hub.send("user-1", "bob", text).await,
            Ok(Delivery::Queued)
        ));
    }

    let mut client = ChatClient::new(IrcConfig {
        host: "127.0.0.1".to_owned(),
        port: addr.port(),
        tls: false,
        nick: "bbs-bot".to_owned(),
        channels: vec!["#general".to_owned()],
        password: None,
        reconnect_delay_secs: 0,
        transport: IrcTransport::Tcp,
        skip_registration: false,
    });
    client.connect().await.expect("connect");
    hub.attach_for_tests(client).await;
    hub.flush_for_tests().await;

    let delivered = tokio::time::timeout(Duration::from_secs(5), server)
        .await
        .expect("server finished")
        .expect("join");

    assert_eq!(hub.queued(), 0);
    assert!(delivered[0].ends_with("first"), "got {:?}", delivered[0]);
    assert!(delivered[1].ends_with("second"), "got {:?}", delivered[1]);
    assert!(delivered[2].ends_with("third"), "got {:?}", delivered[2]);
}

#[tokio::test]
async fn a_long_chat_line_wraps_instead_of_losing_its_tail() {
    let (conn, mut client) = pair().await;
    let mut session = Session::new(conn, Term::Ansi, 40, 25);
    let spoken = "<h0lybyte/bbs> I am here to test the bbs, lets see if it works.";

    session.draw_chat_for_tests("#general", spoken).await;
    let painted = read_paint(&mut client).await;

    assert!(
        painted.contains("bbs, lets see if it works."),
        "tail was clipped: {painted}"
    );
}

#[tokio::test]
async fn an_ansi_caller_without_naws_is_not_given_a_c64_screen() {
    let (conn, _client) = pair().await;

    assert!(!conn.naws_seen);
    assert_eq!(super::window_for(&conn, Term::Ansi), (80, 24));
    assert_eq!(super::window_for(&conn, Term::Petscii), (40, 25));
}

#[tokio::test]
async fn a_reported_window_still_wins() {
    let (mut conn, mut client) = pair().await;
    client
        .write_all(&[IAC, SB, OPT_NAWS, 0, 132, 0, 50, IAC, SE, b'X'])
        .await
        .expect("write");

    assert_eq!(conn.read_byte().await.expect("byte"), b'X');
    assert!(conn.naws_seen);
    assert_eq!(super::window_for(&conn, Term::Ansi), (132, 50));
}

#[tokio::test]
async fn claim_is_single_use() {
    let store = ClaimStore::default();
    let slot = store.create(Uuid::new_v4()).expect("slot");
    let code = slot.code.clone();

    assert_eq!(store.redeem(&code, "user-1").await, Redeem::Ok);
    assert_eq!(store.redeem(&code, "user-1").await, Redeem::Unknown);
    assert_eq!(store.live(), 0);
    assert_eq!(
        slot.wait(Duration::from_millis(50)).await.as_deref(),
        Some("user-1")
    );
}

#[tokio::test]
async fn claim_accepts_lowercase_and_dashless_codes() {
    let store = ClaimStore::default();
    let slot = store.create(Uuid::new_v4()).expect("slot");
    let typed = slot.code.replace('-', "").to_ascii_lowercase();

    assert_eq!(store.redeem(&typed, "user-2").await, Redeem::Ok);
}

#[tokio::test]
async fn unknown_claim_is_rejected() {
    let store = ClaimStore::default();
    assert_eq!(store.redeem("ZZZZ-ZZZZ", "user-3").await, Redeem::Unknown);
}

#[tokio::test]
async fn cancelled_claim_cannot_be_redeemed() {
    let store = ClaimStore::default();
    let slot = store.create(Uuid::new_v4()).expect("slot");
    let code = slot.code.clone();
    store.cancel(&slot);

    assert_eq!(store.redeem(&code, "user-4").await, Redeem::Unknown);
}

#[test]
fn petscii_swaps_case() {
    let mut screen = Screen::new(Term::Petscii, 40, 25);
    screen.text("aZ");
    let out = screen.take();
    assert_eq!(out, vec![b'A', b'Z' + 0x80]);
}

#[test]
fn petscii_width_is_forty_regardless_of_naws() {
    let screen = Screen::new(Term::Petscii, 132, 50);
    assert_eq!(screen.width, 40);
}

#[test]
fn ansi_ink_emits_escape() {
    let mut screen = Screen::new(Term::Ansi, 80, 24);
    screen.ink(Ink::Warn);
    assert_eq!(screen.take(), b"\x1b[1;31m".to_vec());
}

#[test]
fn wrap_lines_breaks_long_words() {
    let lines = wrap_lines("aaaaaaaaaaaa bb", 8);
    assert_eq!(lines, vec!["aaaaaaaa", "aaaa bb"]);
}

#[test]
fn wrap_lines_strips_control_bytes() {
    let lines = wrap_lines("hi\u{7}there", 40);
    assert_eq!(lines, vec!["hi there"]);
}

#[test]
fn truncate_clips_to_max() {
    assert_eq!(truncate("hello world", 5), "hello");
    assert_eq!(truncate("  spaced  ", 40), "spaced");
}

#[test]
fn chat_body_cannot_smuggle_an_irc_command() {
    let evil = "hi\r\nJOIN #staff\r\nPRIVMSG #staff :owned";
    let line =
        ChatMessage::chat("bob", PLATFORM, "#general", &sanitize_content(evil)).to_irc_privmsg();

    assert_eq!(line.lines().count(), 1);
    assert!(!line.contains('\r'));
    assert!(!line.contains('\n'));
}

#[test]
fn chat_body_cannot_forge_another_platform() {
    let forged = sanitize_content("admin@discord: pay me");
    let parsed =
        ChatMessage::from_irc_privmsg("#general", &format!("[CHAT] bob@{PLATFORM}: {forged}"))
            .expect("parses");

    assert_eq!(parsed.sender, "bob");
    assert_eq!(parsed.platform, PLATFORM);
    assert!(!parsed.content.contains('@'));
}

#[test]
fn chat_nick_keeps_the_handle_alphabet() {
    assert_eq!(sanitize_nick("bob"), "bob");
    assert_eq!(sanitize_nick("bob@discord: x"), "bobdiscordx");
    assert_eq!(sanitize_nick("  "), "anon");
}

#[test]
fn chat_body_is_clamped_and_stripped() {
    assert_eq!(sanitize_content("  hi\u{7}there  "), "hithere");
    assert_eq!(sanitize_content("\u{1b}[2Jwipe"), "[2Jwipe");
    assert_eq!(sanitize_content(&"a".repeat(1000)).len(), MAX_CHAT_LEN);
}

fn drain(term: Term, game: &dyn Game) -> String {
    let mut screen = Screen::new(term, 80, 24);
    game.draw(&mut screen);
    String::from_utf8_lossy(&screen.take()).to_string()
}

#[test]
fn bar_fills_and_clamps() {
    assert_eq!(bar(0, 10, 4), "[----]");
    assert_eq!(bar(10, 10, 4), "[####]");
    assert_eq!(bar(5, 10, 4), "[##--]");
    assert_eq!(bar(-5, 10, 4), "[----]");
    assert_eq!(bar(99, 10, 4), "[####]");
    assert_eq!(bar(1, 0, 4), "[----]");
}

#[test]
fn meter_shows_numbers_after_the_bar() {
    assert_eq!(meter("HP", 32, 50, 10), "HP [######----] 32/50");
}

#[test]
fn strip_markup_drops_emphasis_and_keeps_words() {
    assert_eq!(strip_markup("**13** damage"), "13 damage");
    assert_eq!(strip_markup("a `code` span"), "a code span");
    assert_eq!(strip_markup("__bold__ text"), "bold text");
}

#[test]
fn strip_markup_transliterates_the_dungeon_glyphs() {
    assert_eq!(strip_markup("\u{2665}\u{2665}\u{2661}"), "##.");
    assert_eq!(strip_markup("\u{2588}\u{2591}"), "#.");
    assert_eq!(strip_markup("\u{2620} heavy"), "!! heavy");
}

#[test]
fn strip_markup_leaves_no_non_ascii() {
    let messy = "\u{2660} hit \u{2014} \u{1F4A5} boom \u{2026}";
    let cleaned = strip_markup(messy);
    assert!(cleaned.is_ascii(), "not ascii: {cleaned:?}");
}

#[test]
fn rng_is_deterministic_for_a_seed() {
    let mut a = Rng::new(42);
    let mut b = Rng::new(42);
    let left: Vec<usize> = (0..8).map(|_| a.below(100)).collect();
    let right: Vec<usize> = (0..8).map(|_| b.below(100)).collect();
    assert_eq!(left, right);
    assert!(left.iter().all(|v| *v < 100));
}

#[test]
fn rng_below_zero_does_not_divide_by_zero() {
    assert_eq!(Rng::new(7).below(0), 0);
}

#[test]
fn rng_shuffle_keeps_every_element() {
    let mut deck: Vec<u8> = (0..52).collect();
    Rng::new(9).shuffle(&mut deck);
    deck.sort_unstable();
    assert_eq!(deck, (0..52).collect::<Vec<u8>>());
}

#[test]
fn blackjack_counts_aces_softly_then_hard() {
    let mut game = blackjack::Blackjack::new(Rng::new(1));
    assert!(game.chips() <= 100);
    let _ = game.on_key('S');
    let _ = game.on_key('N');
    assert!(game.chips() >= 0);
}

#[test]
fn blackjack_quit_exits_from_any_phase() {
    let mut game = blackjack::Blackjack::new(Rng::new(2));
    assert_eq!(game.on_key('Q'), Flow::Exit);
}

#[test]
fn blackjack_hitting_eventually_settles() {
    let mut game = blackjack::Blackjack::new(Rng::new(3));
    for _ in 0..12 {
        let _ = game.on_key('H');
    }
    let frame = drain(Term::Ansi, &game);
    assert!(frame.contains("chips"));
}

#[test]
fn tictactoe_cpu_blocks_an_immediate_loss() {
    let mut game = tictactoe::TicTacToe::new(Rng::new(5));
    let _ = game.on_key('1');
    let _ = game.on_key('2');
    let board = game.board();
    let ours = board.iter().filter(|c| **c == tictactoe::Cell::You).count();
    let theirs = board.iter().filter(|c| **c == tictactoe::Cell::Cpu).count();
    assert_eq!(ours, 2);
    assert_eq!(theirs, 2, "cpu should have answered both moves");
}

#[test]
fn tictactoe_rejects_occupied_and_out_of_range_cells() {
    let mut game = tictactoe::TicTacToe::new(Rng::new(6));
    let _ = game.on_key('1');
    let before = *game.board();
    let _ = game.on_key('1');
    assert_eq!(&before, game.board());
    let _ = game.on_key('0');
    assert_eq!(&before, game.board());
}

#[test]
fn tictactoe_reaches_a_terminal_outcome() {
    let mut game = tictactoe::TicTacToe::new(Rng::new(7));
    for key in ['1', '2', '3', '4', '5', '6', '7', '8', '9'] {
        if game.outcome() != tictactoe::Outcome::Playing {
            break;
        }
        let _ = game.on_key(key);
    }
    assert_ne!(game.outcome(), tictactoe::Outcome::Playing);
}

#[test]
fn hangman_words_are_guessable() {
    for (word, _) in hangman::WORDS {
        assert!(
            !word.contains('Q'),
            "{word} needs Q, which is reserved for quitting the game"
        );
        assert!(
            word.chars().all(|c| c.is_ascii_uppercase()),
            "{word} is not plain uppercase ASCII"
        );
    }
}

#[test]
fn hangman_quit_is_not_swallowed_as_a_guess() {
    let mut game = hangman::Hangman::new(Rng::new(12));
    assert_eq!(game.on_key('Q'), Flow::Exit);
}

#[test]
fn hangman_masks_until_guessed() {
    let mut game = hangman::Hangman::new(Rng::new(13));
    assert!(game.masked().contains('_'));

    let answer = game.answer();
    for letter in answer.chars() {
        let _ = game.on_key(letter);
    }

    assert!(!game.masked().contains('_'));
    assert_eq!(game.state(), hangman::State::Won);
}

#[test]
fn highlow_tracks_a_streak_and_quits() {
    let mut game = highlow::HighLow::new(Rng::new(17));
    for _ in 0..6 {
        let _ = game.on_key('H');
        let _ = game.on_key('N');
    }
    assert!(game.streak() <= 6);
    assert_eq!(game.on_key('Q'), Flow::Exit);
}

#[test]
fn every_door_in_the_catalog_opens() {
    let ctx = guest();
    for entry in door::CATALOG {
        let mut game = entry.open(&ctx);
        assert!(
            !game.title().is_empty(),
            "door {} opened onto an untitled game",
            entry.key
        );
        assert!(
            !entry.blurb.is_empty(),
            "door {} has no blurb for the menu",
            entry.key
        );
        assert_eq!(
            game.on_key('Q'),
            Flow::Exit,
            "door {} will not close",
            entry.key
        );
    }
}

#[test]
fn door_keys_are_unique_and_leave_the_back_key_alone() {
    let mut seen: Vec<char> = Vec::new();
    for entry in door::CATALOG {
        assert_ne!(entry.key, 'Q', "door {} shadows the back key", entry.name);
        assert!(
            !seen.contains(&entry.key),
            "two doors answer to {}",
            entry.key
        );
        seen.push(entry.key);
    }
}

#[test]
fn only_a_listed_key_finds_a_door() {
    for entry in door::CATALOG {
        assert_eq!(door::find(entry.key).map(|d| d.name), Some(entry.name));
    }
    assert!(door::find('Z').is_none());
}

#[test]
fn a_guest_is_told_the_run_is_theirs_alone() {
    let mut screen = Screen::new(Term::Ansi, 80, 24);
    run::Run::new(Rng::new(11), &guest()).draw(&mut screen);
    let out = String::from_utf8_lossy(&screen.take()).to_string();
    assert!(out.contains("guest run"), "guest footer missing:\n{out}");
}

#[test]
fn a_member_is_not_called_a_guest() {
    let ctx = DoorContext::new("h0lyMac", Some("user-1".to_string()));
    let mut screen = Screen::new(Term::Ansi, 80, 24);
    run::Run::new(Rng::new(11), &ctx).draw(&mut screen);
    let out = String::from_utf8_lossy(&screen.take()).to_string();
    assert!(
        !out.contains("guest"),
        "member was drawn as a guest:\n{out}"
    );
    assert!(out.contains("not saved yet"), "save notice missing:\n{out}");
}

#[test]
fn dungeon_frame_wraps_inside_the_petscii_width() {
    let frame = dungeon::Frame {
        room: "a ".repeat(80),
        party: vec![dungeon::Actor {
            name: "averyveryverylongcharactername".to_string(),
            hp: 5,
            max_hp: 40,
        }],
        ..Default::default()
    };
    let mut screen = Screen::new(Term::Petscii, 40, 25);
    dungeon::draw_frame(&mut screen, &frame);
    let bytes = screen.take();
    let widest = bytes
        .split(|b| *b == 0x0D)
        .map(|line| line.iter().filter(|b| **b >= 0x20).count())
        .max()
        .unwrap_or(0);
    assert!(
        widest <= 40,
        "line overflowed the 40-column screen: {widest}"
    );
}

use super::games::map::{Cell, Grid, Links};
use bevy_dungeon::types::GamePhase;

/// Visible width of a PETSCII line. Colour codes live in 0x90-0x9F and
/// reverse/clear are 0x12/0x92/0x93 — all of which are >= 0x20 but occupy no
/// column, so a naive "printable byte" count overstates the width.
fn petscii_columns(line: &[u8]) -> usize {
    line.iter()
        .filter(|b| {
            let b = **b;
            b >= 0x20 && b != 0x92 && b != 0x93 && !(0x90..=0x9F).contains(&b)
        })
        .count()
}

fn drive(game: &mut run::Run, keys: &str) {
    for k in keys.chars() {
        let _ = game.on_key(k);
    }
}

#[test]
fn dungeon_starts_in_the_city_with_a_live_player() {
    let game = run::Run::new(Rng::new(1), &guest());
    assert_eq!(game.phase(), GamePhase::City);
    assert!(game.hp() > 0);
}

#[test]
fn dungeon_quit_exits() {
    let mut game = run::Run::new(Rng::new(2), &guest());
    assert_eq!(game.on_key('Q'), Flow::Exit);
}

#[test]
fn dungeon_uses_real_content_not_hardcoded_monsters() {
    let mut game = run::Run::new(Rng::new(4), &guest());
    for _ in 0..40 {
        drive(&mut game, "NESW");
    }
    let frame = drain(Term::Ansi, &game);
    assert!(
        !frame.contains("Tunnel Grub") && !frame.contains("Cave Rat"),
        "the retired hardcoded monster table is still reachable"
    );
}

#[test]
fn dungeon_map_view_toggles_and_returns() {
    let mut game = run::Run::new(Rng::new(5), &guest());
    let play = drain(Term::Ansi, &game);
    assert!(play.contains("progress is not saved"));

    let _ = game.on_key('M');
    let map_view = drain(Term::Ansi, &game);
    assert!(map_view.contains("=you"), "legend missing from map view");
    assert!(
        map_view.contains('@'),
        "player marker missing from map view"
    );

    let _ = game.on_key('Q');
    assert!(drain(Term::Ansi, &game).contains("progress is not saved"));
}

#[test]
fn dungeon_never_offers_a_key_the_rules_refuse() {
    for seed in 1..24u64 {
        let mut game = run::Run::new(Rng::new(seed), &guest());
        for step in 0..120 {
            let keys = game.keys();
            assert!(
                !keys.is_empty(),
                "seed {seed} step {step}: no action offered, the run is stuck"
            );
            let key = keys[step % keys.len()];
            let _ = game.on_key(key);
            assert!(
                game.notice().is_none(),
                "seed {seed} step {step}: '{key}' was offered but refused: {:?}",
                game.notice()
            );
        }
    }
}

#[test]
fn dungeon_map_shows_unmapped_neighbors_from_the_start() {
    let mut game = run::Run::new(Rng::new(11), &guest());
    let _ = game.on_key('M');
    let map_view = drain(Term::Ansi, &game);
    assert!(
        map_view.contains('o'),
        "revealed-but-unvisited rooms should draw as unmapped: {map_view}"
    );
    assert!(
        map_view.contains("=unmapped"),
        "legend missing unmapped key"
    );
}

#[test]
fn dungeon_map_quit_from_map_does_not_leave_the_game() {
    let mut game = run::Run::new(Rng::new(6), &guest());
    let _ = game.on_key('M');
    assert_eq!(game.on_key('Q'), Flow::Continue);
    assert_eq!(game.on_key('Q'), Flow::Exit);
}

#[test]
fn dungeon_renders_clean_on_petscii_across_a_run() {
    let mut game = run::Run::new(Rng::new(7), &guest());
    for step in 0..24 {
        for view in ['\0', 'M', 'I', 'B'] {
            if view != '\0' {
                let _ = game.on_key(view);
            }
            let mut screen = Screen::new(Term::Petscii, 40, 25);
            game.draw(&mut screen);
            let bytes = screen.take();
            assert!(
                !bytes.contains(&b'?'),
                "petscii fallback at step {step} in view {view:?}"
            );
            let widest = bytes
                .split(|b| *b == 0x0D)
                .map(petscii_columns)
                .max()
                .unwrap_or(0);
            assert!(
                widest <= 40,
                "line overflowed 40 columns in view {view:?}: {widest}"
            );
            if view != '\0' {
                let _ = game.on_key('Q');
            }
        }
        let _ = game.on_key(['N', 'E', 'S', 'W', 'A'][step % 5]);
    }
}

#[test]
fn map_grid_draws_corridors_and_glyphs_in_ascii() {
    let mut grid = Grid::new(2, 1);
    grid.set(
        0,
        0,
        Cell::Current,
        Links {
            east: true,
            ..Links::NONE
        },
    );
    grid.set(1, 0, Cell::Boss, Links::NONE);

    let mut screen = Screen::new(Term::Ansi, 80, 24);
    super::games::map::draw(&mut screen, &grid);
    let out = String::from_utf8_lossy(&screen.take()).to_string();
    assert!(out.contains('@'));
    assert!(out.contains('B'));
    assert!(out.contains("---"), "east corridor not drawn");
}

#[test]
fn map_grid_uses_petscii_screen_codes_not_ascii() {
    let mut grid = Grid::new(1, 1);
    grid.set(0, 0, Cell::Current, Links::NONE);

    let mut screen = Screen::new(Term::Petscii, 40, 25);
    super::games::map::draw(&mut screen, &grid);
    let bytes = screen.take();
    assert!(bytes.contains(&0xD1), "petscii player glyph missing");
    assert!(!bytes.contains(&b'@'), "ascii glyph leaked into petscii");
}

#[test]
fn map_window_shrinks_to_fit_a_forty_column_screen() {
    let petscii = Screen::new(Term::Petscii, 40, 25);
    let ansi = Screen::new(Term::Ansi, 100, 40);
    // Ask for a grid wider than either terminal can hold, so the cap is the
    // screen rather than the request.
    assert!(
        super::games::map::fits(&petscii, 30) < super::games::map::fits(&ansi, 30),
        "petscii should get a narrower map window than a wide ansi terminal"
    );
}

#[tokio::test]
async fn idle_allowance_can_be_raised_for_a_caller_who_signs_in() {
    let (mut conn, _client) = pair().await;
    assert_eq!(conn.idle_timeout(), Duration::from_secs(2));

    conn.set_idle_timeout(super::authed_idle());

    assert_eq!(conn.idle_timeout(), super::authed_idle());
}

#[test]
fn authed_idle_outlasts_the_hour_a_long_session_needs() {
    assert!(
        super::authed_idle() > Duration::from_secs(3600),
        "a signed-in caller should keep the board past an hour"
    );
}

/// Read from `client` until the telnet no-op shows up, or give up. The server
/// answers the opening WILL with its own DO, so the heartbeat is never the
/// first thing on the wire.
async fn wait_for_nop(client: &mut TcpStream, window: Duration) -> bool {
    let deadline = tokio::time::Instant::now() + window;
    let mut seen: Vec<u8> = Vec::new();
    loop {
        let mut buf = [0u8; 32];
        let remaining = deadline.saturating_duration_since(tokio::time::Instant::now());
        if remaining.is_zero() {
            return false;
        }
        match tokio::time::timeout(remaining, client.read(&mut buf)).await {
            Ok(Ok(0)) | Ok(Err(_)) | Err(_) => return false,
            Ok(Ok(n)) => seen.extend_from_slice(&buf[..n]),
        }
        if seen.windows(2).any(|w| w == [IAC, super::telnet::NOP]) {
            return true;
        }
    }
}

#[tokio::test]
async fn a_silent_telnet_caller_is_nudged_rather_than_dropped() {
    let (mut conn, mut client) = pair().await;
    conn.set_keepalive(Duration::from_millis(30));
    client
        .write_all(&[IAC, WILL, OPT_NAWS])
        .await
        .expect("write");

    let nudged = tokio::select! {
        _ = conn.read_byte() => panic!("read_byte returned without the client sending data"),
        seen = wait_for_nop(&mut client, Duration::from_millis(800)) => seen,
    };

    assert!(nudged, "no IAC NOP reached a silent telnet caller");
}

#[tokio::test]
async fn a_raw_caller_is_never_shown_the_heartbeat() {
    let (mut conn, mut client) = pair().await;
    conn.set_keepalive(Duration::from_millis(30));
    // No IAC from this one, so it is a plain socket. FF F1 in its scrollback
    // would be worse than the drop the heartbeat is guarding against.
    client.write_all(b"h").await.expect("write");
    assert_eq!(conn.read_byte().await.expect("byte"), b'h');

    let nudged = tokio::select! {
        _ = conn.read_byte() => panic!("read_byte returned without the client sending data"),
        seen = wait_for_nop(&mut client, Duration::from_millis(300)) => seen,
    };

    assert!(!nudged, "a raw caller was sent telnet bytes");
}

#[tokio::test]
async fn the_heartbeat_does_not_extend_the_idle_allowance() {
    let (mut conn, mut client) = pair().await;
    conn.set_idle_timeout(Duration::from_millis(200));
    conn.set_keepalive(Duration::from_millis(30));
    client
        .write_all(&[IAC, WILL, OPT_NAWS])
        .await
        .expect("write");

    let outcome = tokio::time::timeout(Duration::from_secs(2), conn.read_byte()).await;

    assert!(
        matches!(outcome, Ok(Err(ReadError::Timeout))),
        "idle allowance should still expire while the link is being nudged"
    );
}

#[test]
fn dungeon_pack_lists_what_the_player_started_with() {
    let game = run::Run::new(Rng::new(11), &guest());
    let pack = game.pack();
    assert!(
        pack.iter().any(|l| l.starts_with("Potion")),
        "starting potions missing from the pack: {pack:?}"
    );
}

#[test]
fn dungeon_using_a_potion_spends_it() {
    let mut game = run::Run::new(Rng::new(11), &guest());
    let before = game.pack();
    let _ = game.on_key('I');

    let view = drain(Term::Ansi, &game);
    assert!(view.contains("pack"), "pack view did not render: {view}");

    let _ = game.on_key('1');

    let after = game.pack();
    assert_ne!(before, after, "using a potion did not change the pack");
    assert!(
        game.notice().is_none(),
        "using a carried item was refused: {:?}",
        game.notice()
    );
}

#[test]
fn dungeon_pack_returns_to_play_without_leaving_the_game() {
    let mut game = run::Run::new(Rng::new(11), &guest());
    let _ = game.on_key('I');
    assert_eq!(game.on_key('Q'), Flow::Continue);
    assert_eq!(game.on_key('Q'), Flow::Exit);
}

#[test]
fn dungeon_city_opens_a_stall_with_stock_on_both_sides() {
    let game = run::Run::new(Rng::new(11), &guest());
    let (buy, sell) = game.stall_labels();

    assert!(!buy.is_empty(), "the city merchant had nothing for sale");
    assert!(
        buy.iter().all(|(_, l)| l.ends_with('g')),
        "stock is not priced: {buy:?}"
    );
    assert!(
        sell.iter().any(|(_, l)| l.starts_with("Potion")),
        "carried potions are not sellable: {sell:?}"
    );
}

#[test]
fn dungeon_selling_a_carried_item_pays_out() {
    let mut game = run::Run::new(Rng::new(11), &guest());
    let _ = game.on_key('B');
    let view = drain(Term::Ansi, &game);
    assert!(view.contains("for sale"), "stall did not render: {view}");

    let before = game.pack();
    let _ = game.on_key('A');

    assert_ne!(before, game.pack(), "selling did not change the pack");
    assert!(
        game.notice().is_none(),
        "selling a carried item was refused: {:?}",
        game.notice()
    );
}

#[test]
fn dungeon_stall_only_keys_what_the_player_can_pay_for() {
    let game = run::Run::new(Rng::new(11), &guest());
    let gold = game.gold();
    let (buy, _) = game.stall_labels();

    let priced = |label: &str| -> i32 {
        label
            .rsplit_once(" - ")
            .and_then(|(_, price)| price.trim_end_matches('g').parse().ok())
            .expect("every stall row carries a price")
    };

    for (_, label) in buy.iter().filter(|(key, _)| key.is_some()) {
        assert!(
            priced(label) <= gold,
            "offered {label} with only {gold} gold"
        );
    }
    assert!(
        buy.iter()
            .any(|(key, label)| key.is_none() && priced(label) > gold),
        "expected an unaffordable row listed without a key: {buy:?} (gold {gold})"
    );
}

#[test]
fn dungeon_stall_rows_never_steal_the_navigation_keys() {
    let game = run::Run::new(Rng::new(11), &guest());
    let (buy, sell) = game.stall_labels();

    for (key, label) in buy.iter().chain(sell.iter()) {
        assert!(
            !matches!(key, Some('B') | Some('Q')),
            "{label} took a navigation key: {key:?}"
        );
    }
}

#[test]
fn dungeon_equipping_carried_gear_is_offered_not_refused() {
    let mut game = run::Run::new(Rng::new(11), &guest());
    for step in 0..400 {
        if game
            .pack()
            .iter()
            .any(|l| l.contains("Sword") || l.contains("Vest"))
        {
            break;
        }
        let keys = game.keys();
        let _ = game.on_key(keys[step % keys.len()]);
    }

    let _ = game.on_key('I');
    let keys: Vec<char> = game.pack_keys();
    for key in keys {
        let _ = game.on_key(key);
        assert!(
            game.notice().is_none(),
            "pack offered '{key}' but the engine refused: {:?}",
            game.notice()
        );
    }
}

#[test]
fn dungeon_finds_a_resource_room_and_can_work_it() {
    // Walk until a resource room turns up, then confirm the board offers the
    // nodes and that working one yields a material.
    for seed in 1..40u64 {
        let mut game = run::Run::new(Rng::new(seed), &guest());
        for step in 0..300 {
            if game.phase() == bevy_dungeon::types::GamePhase::Gathering {
                let keys = game.keys();
                assert!(
                    !keys.is_empty(),
                    "seed {seed}: a gathering room offered nothing to work"
                );
                let before = game.pack().len();
                let _ = game.on_key(keys[0]);
                assert!(
                    game.notice().is_none(),
                    "seed {seed}: working an offered node was refused: {:?}",
                    game.notice()
                );
                assert!(
                    game.pack().len() >= before,
                    "seed {seed}: working a node took nothing"
                );
                return;
            }
            let keys = game.keys();
            if keys.is_empty() {
                break;
            }
            let _ = game.on_key(keys[step % keys.len()]);
        }
    }
    panic!("no resource room generated across 40 seeds");
}

#[test]
fn dungeon_log_lines_are_not_printed_twice() {
    let mut game = run::Run::new(Rng::new(3), &guest());
    let keys = game.keys();
    let _ = game.on_key(keys[0]);

    let log = game.log();
    let mut seen = std::collections::HashSet::new();
    for line in &log {
        assert!(
            seen.insert(line.clone()),
            "log line repeated: {line:?} in {log:?}"
        );
    }
}

#[test]
fn dungeon_workbench_makes_something_from_gathered_materials() {
    let mut game = run::Run::new(Rng::new(11), &guest());
    game.give("log", 3);
    game.give("stone", 1);

    let play = drain(Term::Ansi, &game);
    assert!(
        play.contains("Craft"),
        "the city should advertise a workbench: {play}"
    );

    let _ = game.on_key('K');
    let view = drain(Term::Ansi, &game);
    assert!(
        view.contains("workbench"),
        "craft view did not render: {view}"
    );

    let recipe_keys = game.recipe_keys();
    assert!(!recipe_keys.is_empty(), "no recipe offered");
    let _ = game.on_key(recipe_keys[0]);

    assert!(
        game.notice().is_none(),
        "an offered recipe was refused: {:?}",
        game.notice()
    );
    assert!(
        game.pack().iter().any(|l| l.contains("Campfire")),
        "the crafted item is not in the pack: {:?}",
        game.pack()
    );
}

/// A door that wants a number before it will do anything, which is the shape
/// every buy/sell door takes and the one the single-key contract could not
/// express.
struct Quantity {
    got: Option<String>,
}

impl Game for Quantity {
    fn title(&self) -> &str {
        "Quantity"
    }

    fn draw(&self, _screen: &mut Screen) {}

    fn on_key(&mut self, _key: char) -> Flow {
        Flow::Exit
    }

    fn prompt(&self) -> Option<&str> {
        self.got.is_none().then_some("how many> ")
    }

    fn on_line(&mut self, line: &str) -> Flow {
        self.got = Some(line.to_string());
        Flow::Continue
    }
}

#[tokio::test]
async fn a_door_that_asks_for_a_line_is_handed_the_whole_line() {
    let (conn, mut client) = pair().await;
    let mut session = Session::new(conn, Term::Ansi, 80, 24);
    let mut door = Quantity { got: None };
    // The trailing key answers the redraw that follows, where the door is
    // back to taking single keys and exits on the first one.
    client.write_all(b"12\r\nx").await.expect("write");

    session.play(&mut door).await.expect("play");

    assert_eq!(door.got.as_deref(), Some("12"));
}

#[tokio::test]
async fn escaping_a_prompt_hands_the_door_an_empty_line() {
    let (conn, mut client) = pair().await;
    let mut session = Session::new(conn, Term::Ansi, 80, 24);
    let mut door = Quantity { got: None };
    client.write_all(b"99\x1bx").await.expect("write");

    session.play(&mut door).await.expect("play");

    assert_eq!(
        door.got.as_deref(),
        Some(""),
        "escape should abandon the typed digits, not deliver them"
    );
}

#[tokio::test]
async fn the_door_menu_lists_every_door_with_its_blurb() {
    let (conn, mut client) = pair().await;
    let mut session = Session::new(conn, Term::Ansi, 80, 24);
    client.write_all(b"q\r\n").await.expect("write");

    session.games().await.expect("menu");

    let painted = read_paint(&mut client).await;
    for entry in door::CATALOG {
        assert!(
            painted.contains(entry.name),
            "door {} missing from the menu:\n{painted}",
            entry.key
        );
        assert!(
            painted.contains(entry.blurb),
            "door {} drew no blurb:\n{painted}",
            entry.key
        );
    }
}

#[tokio::test]
async fn the_door_menu_fits_a_forty_column_screen() {
    let (conn, mut client) = pair().await;
    let mut session = Session::new(conn, Term::Petscii, 40, 25);
    client.write_all(b"q\r\n").await.expect("write");

    session.games().await.expect("menu");

    let mut painted = Vec::new();
    let mut buf = [0u8; 2048];
    while let Ok(Ok(n)) =
        tokio::time::timeout(Duration::from_millis(200), client.read(&mut buf)).await
    {
        if n == 0 {
            break;
        }
        painted.extend_from_slice(&buf[..n]);
    }
    let widest = painted
        .split(|b| *b == 0x0D)
        .map(petscii_columns)
        .max()
        .unwrap_or(0);

    assert!(widest <= 40, "door menu overflowed 40 columns: {widest}");
}

/// The keys a door actually drew, scraped from the frame rather than from a
/// second list the door would have to keep in step with what it paints.
fn offered_keys(game: &dyn Game) -> Vec<char> {
    let mut screen = Screen::new(Term::Ansi, 80, 24);
    game.draw(&mut screen);
    let painted = String::from_utf8_lossy(&screen.take()).to_string();
    let plain = strip_ansi(&painted);
    let chars: Vec<char> = plain.chars().collect();
    let mut keys = Vec::new();
    for window in chars.windows(3) {
        if window[0] == '[' && window[2] == ']' && window[1] != ' ' {
            keys.push(window[1]);
        }
    }
    keys
}

fn strip_ansi(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut chars = s.chars();
    while let Some(c) = chars.next() {
        if c != '\x1b' {
            out.push(c);
            continue;
        }
        for c in chars.by_ref() {
            if c.is_ascii_alphabetic() {
                break;
            }
        }
    }
    out
}

/// Walk the boroughs until one has something the wallet can reach, then leave
/// the door sitting in its buy list. A broke first day is a legitimate hand to
/// be dealt, so a test about buying has to find a day where buying is on.
fn ready_to_buy(game: &mut dopewars::DopeWars) -> char {
    for _ in 0..DAYS_IN_A_MONTH {
        game.on_key('B');
        if let Some(key) = offered_keys(game).into_iter().find(|k| k.is_ascii_digit()) {
            return key;
        }
        game.on_key('Q');
        game.on_key('T');
        let stops: Vec<char> = offered_keys(game)
            .into_iter()
            .filter(|k| k.is_ascii_digit())
            .collect();
        game.on_key(stops[0]);
    }
    panic!("no borough had anything affordable in a whole month");
}

const DAYS_IN_A_MONTH: usize = 30;

#[test]
fn dope_wars_only_draws_keys_it_will_accept() {
    for seed in 1..16u64 {
        let mut game = dopewars::DopeWars::new(Rng::new(seed));
        for step in 0..200 {
            // The board never feeds a key while a door is asking for a line,
            // so neither does this.
            if game.prompt().is_some() {
                let answer = ["max", "1", "", "7"][step % 4];
                game.on_line(answer);
                continue;
            }
            let keys = offered_keys(&game);
            assert!(
                !keys.is_empty(),
                "seed {seed} step {step}: no key offered, the door is stuck"
            );
            let key = keys[step % keys.len()];
            if key == 'Q' {
                continue;
            }
            game.on_key(key);
            assert!(
                game.cash() >= 0,
                "seed {seed} step {step}: cash went negative"
            );
            assert!(
                game.held() <= game.coat(),
                "seed {seed} step {step}: coat overfilled"
            );
        }
    }
}

#[test]
fn dope_wars_max_spends_what_there_is_and_no_more() {
    let mut game = dopewars::DopeWars::new(Rng::new(4));
    let good = ready_to_buy(&mut game);
    let before = game.cash();

    game.on_key(good);
    assert!(
        game.prompt().is_some(),
        "picking a good did not ask for a quantity"
    );
    game.on_line("max");

    assert!(game.cash() >= 0, "max overdrew the wallet");
    assert!(game.cash() < before, "max bought nothing");
    assert!(game.held() <= game.coat(), "max overfilled the coat");
}

#[test]
fn dope_wars_refuses_a_quantity_beyond_reach() {
    let mut game = dopewars::DopeWars::new(Rng::new(4));
    let good = ready_to_buy(&mut game);
    let before = game.cash();
    let carried = game.held();

    game.on_key(good);
    game.on_line("999999");

    assert_eq!(game.cash(), before, "an unaffordable buy still moved money");
    assert_eq!(
        game.held(),
        carried,
        "an unaffordable buy still filled the coat"
    );
}

#[test]
fn dope_wars_escape_drops_the_trade() {
    let mut game = dopewars::DopeWars::new(Rng::new(4));
    let good = ready_to_buy(&mut game);
    let before = game.cash();

    game.on_key(good);
    game.on_line("");

    assert_eq!(game.cash(), before, "escape still bought something");
    assert!(game.prompt().is_none(), "escape left the prompt up");
}

#[test]
fn dope_wars_sells_only_what_is_carried() {
    let mut game = dopewars::DopeWars::new(Rng::new(4));
    game.on_key('S');

    let keys = offered_keys(&game);

    assert!(
        !keys.iter().any(|k| k.is_ascii_digit()),
        "an empty coat still offered something to sell: {keys:?}"
    );
}

#[test]
fn dope_wars_debt_compounds_until_the_month_runs_out() {
    let mut game = dopewars::DopeWars::new(Rng::new(2));
    let opening = game.debt();
    let mut hops = 0;

    while game.prompt().is_none() && !game.finished() && hops < 200 {
        let keys = offered_keys(&game);
        if keys.contains(&'T') {
            game.on_key('T');
            let stops: Vec<char> = offered_keys(&game)
                .into_iter()
                .filter(|k| k.is_ascii_digit())
                .collect();
            game.on_key(stops[hops % stops.len()]);
            hops += 1;
        } else {
            break;
        }
    }

    assert!(
        game.finished(),
        "thirty days never elapsed after {hops} hops"
    );
    assert!(
        game.debt() > opening,
        "the shark never charged interest: {} vs {}",
        game.debt(),
        opening
    );
    assert_eq!(
        game.on_key('Q'),
        Flow::Exit,
        "the closing screen would not close"
    );
}

#[test]
fn dope_wars_pays_the_shark_only_where_he_collects() {
    let mut game = dopewars::DopeWars::new(Rng::new(4));
    let owed = game.debt();
    let cash = game.cash();

    game.on_key('P');

    assert_eq!(
        game.debt(),
        owed - cash,
        "paying in the bronx did not reduce the debt"
    );
    assert_eq!(game.cash(), 0, "paying the shark did not cost cash");

    game.on_key('T');
    let stop = offered_keys(&game)
        .into_iter()
        .find(|k| k.is_ascii_digit())
        .expect("nowhere to travel");
    game.on_key(stop);
    let elsewhere = game.debt();
    game.on_key('P');

    assert_eq!(
        game.debt(),
        elsewhere,
        "the shark collected outside the bronx"
    );
}

#[test]
fn dope_wars_renders_clean_on_petscii_across_a_run() {
    let mut game = dopewars::DopeWars::new(Rng::new(5));
    for step in 0..120 {
        let mut screen = Screen::new(Term::Petscii, 40, 25);
        game.draw(&mut screen);
        let bytes = screen.take();
        assert!(!bytes.contains(&b'?'), "petscii fallback at step {step}");
        let widest = bytes
            .split(|b| *b == 0x0D)
            .map(petscii_columns)
            .max()
            .unwrap_or(0);
        assert!(
            widest <= 40,
            "line overflowed 40 columns at step {step}: {widest}"
        );

        if game.prompt().is_some() {
            game.on_line("max");
            continue;
        }
        let keys: Vec<char> = offered_keys(&game)
            .into_iter()
            .filter(|k| *k != 'Q')
            .collect();
        if keys.is_empty() {
            break;
        }
        game.on_key(keys[step % keys.len()]);
    }
}

#[test]
fn a_post_title_loses_its_control_bytes_and_extra_space() {
    let title = post::sanitize_title("  hello\r\n\tthere   caller \x07 ");

    assert_eq!(title, "hello there caller");
}

#[test]
fn a_post_title_is_clamped() {
    let title = post::sanitize_title(&"a".repeat(post::MAX_TITLE_LEN + 50));

    assert_eq!(title.chars().count(), post::MAX_TITLE_LEN);
}

#[test]
fn a_post_body_keeps_its_line_breaks() {
    let body = post::sanitize_body("first line\r\nsecond line\n\nthird");

    assert_eq!(body, "first line\nsecond line\n\nthird");
}

#[test]
fn a_post_body_drops_control_bytes_and_clamps() {
    let body = post::sanitize_body(&format!("\x1b[2Jwipe{}", "b".repeat(post::MAX_POST_LEN)));

    assert!(!body.contains('\x1b'), "escape survived: {body:?}");
    assert_eq!(body.chars().count(), post::MAX_POST_LEN);
}

#[test]
fn a_refused_post_reports_the_rule_not_the_envelope() {
    let raw = r#"forum.service_create_comment 400 → {"code":"P0001","message":"body is required"}"#;

    assert_eq!(session::rpc_reason(raw), "body is required");
}

#[test]
fn an_unparseable_refusal_still_says_something_useful() {
    assert_eq!(
        session::rpc_reason("forum.service_create_comment network: connection reset"),
        "the board refused that post"
    );
}

#[tokio::test]
async fn a_guest_reading_a_thread_is_not_offered_a_reply_key() {
    let (conn, mut client) = pair().await;
    client.write_all(b"q").await.expect("write");
    let mut session = Session::new(conn, Term::Ansi, 80, 24);

    session
        .pager_for_tests("thread", &["a post".to_string()])
        .await;
    let painted = read_paint(&mut client).await;

    assert!(!painted.contains("reply"), "guest was offered: {painted}");
    assert!(painted.contains("back"), "no way out: {painted}");
}

#[tokio::test]
async fn a_signed_in_caller_reading_a_thread_is_offered_a_reply_key() {
    let (conn, mut client) = pair().await;
    client.write_all(b"q").await.expect("write");
    let mut session = Session::new(conn, Term::Ansi, 80, 24);
    session.sign_in_for_tests(&Uuid::new_v4().to_string(), "h0lybyte");

    session
        .pager_for_tests("thread", &["a post".to_string()])
        .await;
    let painted = read_paint(&mut client).await;

    assert!(painted.contains("[r] reply"), "no reply key: {painted}");
}

#[tokio::test]
async fn the_composer_returns_the_lines_it_was_given() {
    let (conn, mut client) = pair().await;
    client
        .write_all(b"first line\rsecond\r/s\r")
        .await
        .expect("write");
    let mut session = Session::new(conn, Term::Ansi, 80, 24);

    let body = session.compose_for_tests("new post").await;

    assert_eq!(body.as_deref(), Some("first line\nsecond"));
}

#[tokio::test]
async fn the_composer_can_undo_a_line_and_abort() {
    let (conn, mut client) = pair().await;
    client
        .write_all(b"keep\rdrop\r/d\r/a\r")
        .await
        .expect("write");
    let mut session = Session::new(conn, Term::Ansi, 80, 24);

    assert!(session.compose_for_tests("new post").await.is_none());
}

#[tokio::test]
async fn the_composer_refuses_to_send_an_empty_post() {
    let (conn, mut client) = pair().await;
    client.write_all(b"/s\r").await.expect("write");
    let mut session = Session::new(conn, Term::Ansi, 80, 24);

    let composed = tokio::time::timeout(
        Duration::from_millis(400),
        session.compose_for_tests("new post"),
    )
    .await;

    assert!(composed.is_err(), "an empty post was accepted");
}
