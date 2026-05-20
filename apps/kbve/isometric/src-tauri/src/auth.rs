#![cfg(not(target_arch = "wasm32"))]

use base64::Engine;
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::{Mutex, OnceLock};
use std::thread;
use std::time::Duration;

static AUTH_LISTENER_PORT: OnceLock<u16> = OnceLock::new();

/// Latest sign-in observed by the OAuth listener / deep-link handler.
/// Bevy's title screen polls this to update PreFlight (jwt_valid + username)
/// the moment a token lands, without waiting for the server-side AuthResponse.
static PENDING_SIGNIN: Mutex<Option<SignInResult>> = Mutex::new(None);

#[derive(Clone)]
pub struct SignInResult {
    pub username: Option<String>,
}

pub fn take_pending_signin() -> Option<SignInResult> {
    PENDING_SIGNIN.lock().ok().and_then(|mut g| g.take())
}

fn record_signin(jwt: &str) {
    let username = parse_kbve_username(jwt);
    if let Ok(mut g) = PENDING_SIGNIN.lock() {
        *g = Some(SignInResult { username });
    }
}

fn parse_kbve_username(jwt: &str) -> Option<String> {
    let payload_b64 = jwt.split('.').nth(1)?;
    let payload_bytes = base64::engine::general_purpose::URL_SAFE_NO_PAD
        .decode(payload_b64)
        .ok()
        .or_else(|| {
            base64::engine::general_purpose::STANDARD_NO_PAD
                .decode(payload_b64)
                .ok()
        })?;
    let payload: serde_json::Value = serde_json::from_slice(&payload_bytes).ok()?;
    if let Some(v) = payload.get("kbve_username").and_then(|v| v.as_str()) {
        return Some(v.to_string());
    }
    payload
        .get("user_metadata")
        .and_then(|m| m.get("kbve_username").or_else(|| m.get("user_name")))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
}

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
    let token = read_oauth_token(&mut stream);
    let body = if token.is_some() {
        SUCCESS_HTML
    } else {
        // No token in the request query — GoTrue redirected here with the
        // token in the URL fragment, which browsers strip before the HTTP
        // request. Serve a tiny HTML page that reads `location.hash` and
        // re-fetches the same endpoint with `access_token` as a query
        // param so this thread sees it on the next connection.
        FRAGMENT_BOUNCE_HTML
    };
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
        record_signin(&token);
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

const SUCCESS_HTML: &str = r#"<!doctype html><html><head><meta charset="utf-8"><title>KBVE — Signed in</title><style>body{font-family:-apple-system,Inter,sans-serif;background:#0a0a14;color:#e8eaed;display:flex;align-items:center;justify-content:center;height:100vh;margin:0}.card{text-align:center;padding:32px 48px;border:1px solid #1f2230;border-radius:8px;background:#0f1018;max-width:420px}h1{margin:0 0 10px;font-size:20px;color:#7ec97e}p{margin:0 0 6px;color:#a9adb8;font-size:14px}small{display:block;color:#5a5f6b;font-size:11px;margin-top:18px}a{color:#7ab8ff;text-decoration:none}a:hover{text-decoration:underline}</style></head><body><div class="card"><h1>Signed in</h1><p>Token delivered to KBVE Isometric. Switch back to the game and your title screen should now show your username.</p><p><small>Redirecting to <a href="https://kbve.com/project/isometric/" id="redir">kbve.com/project/isometric/</a> in <span id="count">5</span>s.</small></p></div><script>(function(){var target='https://kbve.com/project/isometric/';var n=5;var el=document.getElementById('count');var t=setInterval(function(){n-=1;if(el)el.textContent=String(n);if(n<=0){clearInterval(t);window.location.replace(target);}},1000);})();</script></body></html>"#;

const FRAGMENT_BOUNCE_HTML: &str = r#"<!doctype html><html><head><meta charset="utf-8"><title>KBVE — Signing in...</title><style>body{font-family:-apple-system,Inter,sans-serif;background:#0a0a14;color:#e8eaed;display:flex;align-items:center;justify-content:center;height:100vh;margin:0}.card{text-align:center;padding:32px 48px;border:1px solid #1f2230;border-radius:8px;background:#0f1018}h1{margin:0 0 8px;font-size:18px}p{margin:0;color:#8a8f9c;font-size:13px}</style></head><body><div class="card"><h1>Signing in...</h1><p>One moment, finishing up.</p></div><script>(function(){var hash=window.location.hash.replace(/^#/,'');if(!hash){document.querySelector('.card h1').textContent='Sign in failed';document.querySelector('.card p').textContent='No access token in the callback.';return;}var params=new URLSearchParams(hash);var token=params.get('access_token');if(!token){document.querySelector('.card h1').textContent='Sign in failed';document.querySelector('.card p').textContent='No access token in the callback.';return;}window.location.replace(window.location.pathname+'?access_token='+encodeURIComponent(token));})();</script></body></html>"#;

pub fn handle_deep_link(url: &str) {
    eprintln!("[auth] deep link received: {url}");
    let Some(token) = parse_deep_link_token(url) else {
        eprintln!("[auth] no access_token in deep link payload — ignoring");
        return;
    };
    eprintln!("[auth] deep link token received (len={})", token.len());
    record_signin(&token);
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
