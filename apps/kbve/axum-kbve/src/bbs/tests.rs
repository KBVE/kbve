use std::time::Duration;

use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};
use uuid::Uuid;

use bevy_chat::ChatMessage;

use super::chat::{MAX_CHAT_LEN, PLATFORM, sanitize_content, sanitize_nick};
use super::claim::{ClaimStore, Redeem};
use super::render::{Ink, Screen, Term, truncate, wrap_lines};
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
