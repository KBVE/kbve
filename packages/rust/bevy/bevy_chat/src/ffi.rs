//! C-FFI surface for non-Rust consumers (JNI, csbindgen, etc.).
//!
//! This module exposes an opaque-handle API over [`ChatClient`] that works
//! from Java (via JNI), C# (via csbindgen), and any other language with a
//! C calling convention.
//!
//! ## Design
//!
//! - **Opaque handle**: [`ChatHandle`] is returned as `*mut ChatHandle` and
//!   must be freed via [`kbve_chat_disconnect`]. The caller never dereferences
//!   it directly.
//! - **Owned runtime**: each handle owns a multi-threaded tokio runtime so
//!   non-async callers (Java server thread, Unity main thread) can drive it
//!   via blocking FFI calls without needing their own async reactor.
//! - **String contract**: all `*const c_char` inputs must be null-terminated
//!   UTF-8. Invalid UTF-8 or null pointers return an error code, never panic.
//! - **Message polling**: [`kbve_chat_poll`] fills a caller-provided buffer
//!   with a JSON array of pending [`ChatMessage`]s. Caller allocates the
//!   buffer; callee fills and null-terminates. Truncation is indicated by
//!   a return value of `-2`.
//! - **Thread safety**: all functions are safe to call from any thread. The
//!   underlying [`ChatClient`] is `Send + Sync` (native only).
//!
//! ## Error codes
//!
//! | Return | Meaning |
//! |--------|---------|
//! |  `0`   | Success |
//! | `-1`   | Invalid argument (null pointer, bad UTF-8, bad handle) |
//! | `-2`   | Buffer too small (poll only) |
//! | `-3`   | Send/connect failed (transport error) |
//! | `-4`   | Runtime error (tokio could not be started) |

use crate::{ChatClient, ChatMessage, IrcConfig, MessageKind};
use std::ffi::{CStr, c_char};
use std::sync::Arc;
use std::sync::mpsc;
use tokio::runtime::Runtime;
use tokio::sync::broadcast;

const OK: i32 = 0;
const ERR_INVALID: i32 = -1;
const ERR_BUF_TOO_SMALL: i32 = -2;
const ERR_TRANSPORT: i32 = -3;
const ERR_RUNTIME: i32 = -4;

/// Opaque handle returned by [`kbve_chat_connect`].
///
/// Must be freed via [`kbve_chat_disconnect`]. Do not access fields
/// directly — the layout is not stable.
pub struct ChatHandle {
    rt: Runtime,
    client: ChatClient,
    /// Drained into the poll buffer on each [`kbve_chat_poll`] call.
    pending: Arc<std::sync::Mutex<Vec<ChatMessage>>>,
    /// Background task that forwards broadcast messages into `pending`.
    /// Kept alive for the handle's lifetime; dropped on disconnect.
    _pump: tokio::task::JoinHandle<()>,
}

/// Read a null-terminated UTF-8 C string into a Rust `&str`.
/// Returns `None` on null pointer or invalid UTF-8.
unsafe fn cstr_to_str<'a>(ptr: *const c_char) -> Option<&'a str> {
    if ptr.is_null() {
        return None;
    }
    unsafe { CStr::from_ptr(ptr) }.to_str().ok()
}

/// Connect to an IRC server and return an opaque handle.
///
/// # Parameters
///
/// - `host` — IRC server hostname (null-terminated UTF-8)
/// - `port` — IRC server port (typically 6667 for plain, 6697 for TLS)
/// - `tls` — `1` to use TLS, `0` for plain TCP
/// - `nick` — IRC nickname (null-terminated UTF-8)
/// - `password` — IRC server password, or null to skip PASS registration
/// - `channels` — comma-separated channel list (e.g. `"#global,#world-events"`)
/// - `out_handle` — receives the handle pointer on success
///
/// # Returns
///
/// - [`OK`] on success (handle written to `out_handle`)
/// - [`ERR_INVALID`] if any required pointer is null or not UTF-8
/// - [`ERR_RUNTIME`] if the tokio runtime failed to start
/// - [`ERR_TRANSPORT`] if the connection/registration failed
///
/// # Safety
///
/// Caller must ensure all `*const c_char` arguments are null-terminated and
/// remain valid for the duration of the call. `out_handle` must be a valid
/// writable pointer.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn kbve_chat_connect(
    host: *const c_char,
    port: u16,
    tls: i32,
    nick: *const c_char,
    password: *const c_char,
    channels: *const c_char,
    out_handle: *mut *mut ChatHandle,
) -> i32 {
    if out_handle.is_null() {
        return ERR_INVALID;
    }
    unsafe { *out_handle = std::ptr::null_mut() };

    let host = match unsafe { cstr_to_str(host) } {
        Some(s) => s.to_owned(),
        None => return ERR_INVALID,
    };
    let nick = match unsafe { cstr_to_str(nick) } {
        Some(s) => s.to_owned(),
        None => return ERR_INVALID,
    };
    let channels = match unsafe { cstr_to_str(channels) } {
        Some(s) => s
            .split(',')
            .map(|c| c.trim().to_owned())
            .filter(|c| !c.is_empty())
            .collect::<Vec<_>>(),
        None => return ERR_INVALID,
    };
    // password is optional — null means no PASS registration
    let password = if password.is_null() {
        None
    } else {
        match unsafe { cstr_to_str(password) } {
            Some(s) => Some(s.to_owned()),
            None => return ERR_INVALID,
        }
    };

    let config = IrcConfig {
        host,
        port,
        tls: tls != 0,
        nick,
        password,
        channels,
        reconnect_delay_secs: 5,
        transport: crate::config::IrcTransport::Tcp,
        skip_registration: false,
    };

    let rt = match tokio::runtime::Builder::new_multi_thread()
        .worker_threads(2)
        .enable_all()
        .thread_name("bevy-chat-ffi")
        .build()
    {
        Ok(rt) => rt,
        Err(_) => return ERR_RUNTIME,
    };

    // Build + connect the client on the runtime.
    let mut client = ChatClient::new(config);
    if let Err(_) = rt.block_on(client.connect()) {
        return ERR_TRANSPORT;
    }

    // Pump broadcast subscribers into a lock-guarded Vec that poll() drains.
    let pending = Arc::new(std::sync::Mutex::new(Vec::<ChatMessage>::new()));
    let pending_for_pump = Arc::clone(&pending);
    let mut rx: broadcast::Receiver<ChatMessage> = client.subscribe();

    let pump = rt.spawn(async move {
        loop {
            match rx.recv().await {
                Ok(msg) => {
                    if let Ok(mut guard) = pending_for_pump.lock() {
                        guard.push(msg);
                    }
                }
                Err(broadcast::error::RecvError::Lagged(_)) => {
                    // Slow consumer — drop missed messages and continue.
                    continue;
                }
                Err(broadcast::error::RecvError::Closed) => break,
            }
        }
    });

    let handle = Box::new(ChatHandle {
        rt,
        client,
        pending,
        _pump: pump,
    });

    unsafe { *out_handle = Box::into_raw(handle) };
    OK
}

/// Send a structured chat message.
///
/// # Parameters
///
/// - `handle` — a valid handle from [`kbve_chat_connect`]
/// - `kind` — one of: `"chat"`, `"system"`, `"kill"`, `"rare_drop"`,
///   `"capture"`, `"quest_complete"`, `"area_unlocked"`, `"death"`,
///   `"craft"`, or any custom string (treated as [`MessageKind::Custom`])
/// - `sender` — display name
/// - `platform` — source platform (e.g. `"minecraft"`, `"unity"`, `"discord"`)
/// - `channel` — IRC channel (e.g. `"#world-events"`)
/// - `content` — human-readable message text
/// - `payload_json` — optional null-terminated JSON string, or null
///
/// # Returns
///
/// - [`OK`] on success
/// - [`ERR_INVALID`] on bad inputs or handle
/// - [`ERR_TRANSPORT`] if the send failed (not connected, network error)
///
/// # Safety
///
/// `handle` must be a valid pointer returned by [`kbve_chat_connect`] and
/// not yet freed. All string pointers must be null-terminated UTF-8.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn kbve_chat_send(
    handle: *mut ChatHandle,
    kind: *const c_char,
    sender: *const c_char,
    platform: *const c_char,
    channel: *const c_char,
    content: *const c_char,
    payload_json: *const c_char,
) -> i32 {
    if handle.is_null() {
        return ERR_INVALID;
    }
    let h = unsafe { &*handle };

    let kind_str = match unsafe { cstr_to_str(kind) } {
        Some(s) => s,
        None => return ERR_INVALID,
    };
    let sender = match unsafe { cstr_to_str(sender) } {
        Some(s) => s,
        None => return ERR_INVALID,
    };
    let platform = match unsafe { cstr_to_str(platform) } {
        Some(s) => s,
        None => return ERR_INVALID,
    };
    let channel = match unsafe { cstr_to_str(channel) } {
        Some(s) => s,
        None => return ERR_INVALID,
    };
    let content = match unsafe { cstr_to_str(content) } {
        Some(s) => s,
        None => return ERR_INVALID,
    };

    let kind = match kind_str {
        "chat" => MessageKind::Chat,
        "system" => MessageKind::System,
        "kill" => MessageKind::Kill,
        "rare_drop" => MessageKind::RareDrop,
        "capture" => MessageKind::Capture,
        "quest_complete" => MessageKind::QuestComplete,
        "area_unlocked" => MessageKind::AreaUnlocked,
        "death" => MessageKind::Death,
        "craft" => MessageKind::Craft,
        other => MessageKind::Custom(other.to_owned()),
    };

    let payload = if payload_json.is_null() {
        None
    } else {
        match unsafe { cstr_to_str(payload_json) } {
            Some(s) => serde_json::from_str::<serde_json::Value>(s).ok(),
            None => return ERR_INVALID,
        }
    };

    let msg = ChatMessage::event(kind, sender, platform, channel, content, payload);

    // Use a oneshot to ferry the result out of the async block.
    let (tx, rx) = mpsc::channel();
    let client = h.client.clone();
    h.rt.spawn(async move {
        let _ = tx.send(client.send(&msg).await);
    });

    match rx.recv() {
        Ok(Ok(())) => OK,
        _ => ERR_TRANSPORT,
    }
}

/// Drain pending incoming messages into a caller-provided buffer.
///
/// Messages are serialized as a JSON array: `[{...}, {...}]`. If there are
/// no pending messages, the buffer is filled with `"[]"`.
///
/// # Parameters
///
/// - `handle` — a valid handle from [`kbve_chat_connect`]
/// - `out_buf` — caller-allocated buffer
/// - `buf_len` — capacity of `out_buf` in bytes (including space for null terminator)
///
/// # Returns
///
/// - number of bytes written (not including null terminator) on success
/// - [`ERR_INVALID`] on bad inputs
/// - [`ERR_BUF_TOO_SMALL`] if the serialized JSON would exceed `buf_len`
///   (messages remain in the pending queue and can be retried with a larger buffer)
///
/// # Safety
///
/// `out_buf` must be valid and writable for `buf_len` bytes.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn kbve_chat_poll(
    handle: *mut ChatHandle,
    out_buf: *mut c_char,
    buf_len: usize,
) -> i32 {
    if handle.is_null() || out_buf.is_null() || buf_len == 0 {
        return ERR_INVALID;
    }
    let h = unsafe { &*handle };

    let messages = {
        let mut guard = match h.pending.lock() {
            Ok(g) => g,
            Err(_) => return ERR_INVALID,
        };
        std::mem::take(&mut *guard)
    };

    let json = match serde_json::to_string(&messages) {
        Ok(s) => s,
        Err(_) => {
            // Re-queue on serialization failure (shouldn't happen in practice).
            if let Ok(mut guard) = h.pending.lock() {
                guard.extend(messages);
            }
            return ERR_INVALID;
        }
    };

    let bytes = json.as_bytes();
    if bytes.len() + 1 > buf_len {
        // Re-queue so caller can retry with a bigger buffer.
        if let Ok(mut guard) = h.pending.lock() {
            guard.extend(messages);
        }
        return ERR_BUF_TOO_SMALL;
    }

    unsafe {
        std::ptr::copy_nonoverlapping(bytes.as_ptr() as *const c_char, out_buf, bytes.len());
        *out_buf.add(bytes.len()) = 0;
    }

    bytes.len() as i32
}

/// Check whether the client is currently connected.
///
/// # Returns
///
/// - `1` if connected
/// - `0` if disconnected
/// - [`ERR_INVALID`] if handle is null
#[unsafe(no_mangle)]
pub unsafe extern "C" fn kbve_chat_is_connected(handle: *mut ChatHandle) -> i32 {
    if handle.is_null() {
        return ERR_INVALID;
    }
    let h = unsafe { &*handle };
    if h.rt.block_on(h.client.is_connected()) {
        1
    } else {
        0
    }
}

/// Disconnect and free the handle.
///
/// After this call, the handle pointer must not be used again.
/// Passing a null pointer is a no-op.
///
/// # Safety
///
/// `handle` must be a pointer previously returned by [`kbve_chat_connect`],
/// or null. Calling this twice on the same pointer is undefined behavior.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn kbve_chat_disconnect(handle: *mut ChatHandle) {
    if handle.is_null() {
        return;
    }
    let boxed = unsafe { Box::from_raw(handle) };
    let ChatHandle {
        rt,
        client,
        pending: _,
        _pump,
    } = *boxed;
    // Gracefully close the IRC connection before tearing down the runtime.
    rt.block_on(client.disconnect());
    // Dropping the runtime aborts the pump task.
    drop(rt);
}
