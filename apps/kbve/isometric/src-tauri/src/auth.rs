#![cfg(not(target_arch = "wasm32"))]

use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::OnceLock;
use std::thread;
use std::time::Duration;

static AUTH_LISTENER_PORT: OnceLock<u16> = OnceLock::new();

pub fn init_local_listener() {
    if AUTH_LISTENER_PORT.get().is_some() {
        return;
    }
    let listener = match TcpListener::bind("127.0.0.1:0") {
        Ok(l) => l,
        Err(e) => {
            eprintln!("[auth] failed to bind localhost listener: {e}");
            return;
        }
    };
    let port = match listener.local_addr() {
        Ok(addr) => addr.port(),
        Err(e) => {
            eprintln!("[auth] local_addr failed: {e}");
            return;
        }
    };
    let _ = AUTH_LISTENER_PORT.set(port);
    eprintln!("[auth] localhost callback listener bound to 127.0.0.1:{port}");
    thread::spawn(move || run_listener_loop(listener));
}

pub fn listener_port() -> Option<u16> {
    AUTH_LISTENER_PORT.get().copied()
}

pub fn build_redirect_url() -> String {
    match listener_port() {
        Some(port) => format!("http://127.0.0.1:{port}/auth/callback"),
        None => "kbve://auth/callback".to_string(),
    }
}

fn run_listener_loop(listener: TcpListener) {
    for incoming in listener.incoming() {
        let stream = match incoming {
            Ok(s) => s,
            Err(e) => {
                eprintln!("[auth] accept failed: {e}");
                continue;
            }
        };
        thread::spawn(move || handle_connection(stream));
    }
}

fn handle_connection(mut stream: TcpStream) {
    let _ = stream.set_read_timeout(Some(Duration::from_secs(5)));
    let _ = stream.set_write_timeout(Some(Duration::from_secs(5)));
    let token = match read_oauth_token(&mut stream) {
        Some(t) => Some(t),
        None => None,
    };
    let body = response_body(token.is_some());
    let resp = format!(
        "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
        body.len()
    );
    let _ = stream.write_all(resp.as_bytes());
    if let Some(token) = token {
        eprintln!(
            "[auth] localhost callback token received (len={})",
            token.len()
        );
        crate::game::net::request_go_online("", &token);
    }
}

fn read_oauth_token(stream: &mut TcpStream) -> Option<String> {
    let mut buf = [0u8; 8192];
    let n = stream.read(&mut buf).ok()?;
    let req = std::str::from_utf8(&buf[..n]).ok()?;
    let first_line = req.lines().next()?;
    let target = first_line.split_whitespace().nth(1)?;
    let (_, query) = target.split_once('?')?;
    for pair in query.split('&') {
        let (k, v) = pair.split_once('=')?;
        if k == "access_token" {
            return urlencoding::decode(v).ok().map(|s| s.into_owned());
        }
    }
    None
}

fn response_body(success: bool) -> &'static str {
    if success { SUCCESS_HTML } else { ERROR_HTML }
}

const SUCCESS_HTML: &str = r#"<!doctype html><html><head><meta charset="utf-8"><title>KBVE — Signed in</title><style>body{font-family:-apple-system,Inter,sans-serif;background:#0a0a14;color:#e8eaed;display:flex;align-items:center;justify-content:center;height:100vh;margin:0}.card{text-align:center;padding:32px 48px;border:1px solid #1f2230;border-radius:8px;background:#0f1018}h1{margin:0 0 8px;font-size:18px}p{margin:0;color:#8a8f9c;font-size:13px}</style></head><body><div class="card"><h1>Signed in</h1><p>You can close this tab and return to the game.</p></div><script>setTimeout(()=>window.close(),400)</script></body></html>"#;

const ERROR_HTML: &str = r#"<!doctype html><html><head><meta charset="utf-8"><title>KBVE — Sign in failed</title><style>body{font-family:-apple-system,Inter,sans-serif;background:#0a0a14;color:#e8eaed;display:flex;align-items:center;justify-content:center;height:100vh;margin:0}.card{text-align:center;padding:32px 48px;border:1px solid #2b1f1f;border-radius:8px;background:#181014}h1{margin:0 0 8px;font-size:18px;color:#f4a3a3}p{margin:0;color:#8a8f9c;font-size:13px}</style></head><body><div class="card"><h1>Sign in failed</h1><p>No access token in the callback. Try again from the game.</p></div></body></html>"#;

pub fn handle_deep_link(url: &str) {
    eprintln!("[auth] deep link received: {url}");
    let Some(token) = parse_deep_link_token(url) else {
        eprintln!("[auth] no access_token in deep link payload — ignoring");
        return;
    };
    eprintln!("[auth] deep link token received (len={})", token.len());
    crate::game::net::request_go_online("", &token);
}

fn parse_deep_link_token(url: &str) -> Option<String> {
    let (_, payload) = url.split_once('#').or_else(|| url.split_once('?'))?;
    for pair in payload.split('&') {
        let (k, v) = pair.split_once('=')?;
        if k == "access_token" {
            return urlencoding::decode(v).ok().map(|s| s.into_owned());
        }
    }
    None
}
