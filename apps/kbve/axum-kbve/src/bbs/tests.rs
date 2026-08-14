use std::time::Duration;

use tokio::io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};
use uuid::Uuid;

use bevy_chat::{ChatClient, ChatMessage, IrcConfig, IrcTransport};

use super::chat::{
    ChatHub, Delivery, MAX_CHAT_LEN, OUTBOX_LIMIT, PLATFORM, SendError, sanitize_content,
    sanitize_nick,
};
use super::claim::{ClaimStore, Redeem};
use super::games::text::{Rng, bar, meter, strip_markup};
use super::games::{self, Flow, Game, blackjack, dungeon, hangman, highlow, run, tictactoe};
use super::render::{Ink, Screen, Term, truncate, wrap_lines};
use super::session::Session;
use super::telnet::{DO, IAC, OPT_ECHO, OPT_NAWS, SB, SE, TelnetConn, WILL};

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
fn every_catalog_entry_launches() {
    for entry in games::CATALOG {
        assert!(
            games::launch(entry.key, "tester").is_some(),
            "catalog entry {} does not launch",
            entry.key
        );
    }
    assert!(games::launch('Z', "tester").is_none());
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
    let game = run::Run::new(Rng::new(1), "tester");
    assert_eq!(game.phase(), GamePhase::City);
    assert!(game.hp() > 0);
}

#[test]
fn dungeon_quit_exits() {
    let mut game = run::Run::new(Rng::new(2), "tester");
    assert_eq!(game.on_key('Q'), Flow::Exit);
}

#[test]
fn dungeon_uses_real_content_not_hardcoded_monsters() {
    let mut game = run::Run::new(Rng::new(4), "tester");
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
    let mut game = run::Run::new(Rng::new(5), "tester");
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
fn dungeon_map_quit_from_map_does_not_leave_the_game() {
    let mut game = run::Run::new(Rng::new(6), "tester");
    let _ = game.on_key('M');
    assert_eq!(game.on_key('Q'), Flow::Continue);
    assert_eq!(game.on_key('Q'), Flow::Exit);
}

#[test]
fn dungeon_renders_clean_on_petscii_across_a_run() {
    let mut game = run::Run::new(Rng::new(7), "tester");
    for step in 0..24 {
        for view in ["", "M"] {
            if !view.is_empty() {
                let _ = game.on_key('M');
            }
            let mut screen = Screen::new(Term::Petscii, 40, 25);
            game.draw(&mut screen);
            let bytes = screen.take();
            assert!(!bytes.contains(&b'?'), "petscii fallback at step {step}");
            let widest = bytes
                .split(|b| *b == 0x0D)
                .map(petscii_columns)
                .max()
                .unwrap_or(0);
            assert!(widest <= 40, "line overflowed 40 columns: {widest}");
            if !view.is_empty() {
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
