//! WASM-only WebSocket transport that bypasses aeronet entirely.
//!
//! aeronet_websocket 0.19 has a fundamental WASM bug: the `send_loop` spawned
//! via `spawn_local` never gets polled during bevy's game loop, so packets
//! queue but never leave the browser.
//!
//! This module provides a synchronous alternative:
//! - `WasmWsSocket` component holds the `web_sys::WebSocket` handle
//! - `on_message` callback pushes received packets into a shared `Arc<Mutex<Vec>>`
//! - `wasm_ws_recv` system (PreUpdate) drains received packets into `Link.recv`
//! - `wasm_ws_send` system (PostUpdate) drains `Link.send` and calls
//!   `socket.send_with_u8_array` synchronously — no async, no channels
//! - `on_open`/`on_close`/`on_error` callbacks manage `Linked`/`Unlinked`

use std::sync::{Arc, Mutex};

use bevy::prelude::*;
use bytes::Bytes;
use lightyear::prelude::*;
use wasm_bindgen::prelude::*;
use web_sys::{BinaryType, CloseEvent, Event, MessageEvent, WebSocket};

/// Received packet buffer shared between the JS `on_message` callback and
/// the bevy `wasm_ws_recv` system. `Arc<Mutex<Vec<Bytes>>>` is safe because
/// WASM is single-threaded — the Mutex never contends.
type RecvBuffer = Arc<Mutex<Vec<Bytes>>>;

/// Wrapper to make `web_sys::WebSocket` satisfy `Send + Sync`.
/// Safe because WASM is single-threaded — these pointers never cross threads.
struct SendSyncWebSocket(WebSocket);
unsafe impl Send for SendSyncWebSocket {}
unsafe impl Sync for SendSyncWebSocket {}

/// Bevy component holding the WASM WebSocket handle and shared recv buffer.
/// Attach this to the same entity that has `Link` + `NetcodeClient`.
#[derive(Component)]
pub struct WasmWsSocket {
    socket: SendSyncWebSocket,
    recv_buf: RecvBuffer,
    /// Track whether on_open has fired
    connected: Arc<Mutex<bool>>,
}

impl std::fmt::Debug for WasmWsSocket {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("WasmWsSocket")
            .field("url", &self.socket.0.url())
            .finish()
    }
}

impl Drop for WasmWsSocket {
    fn drop(&mut self) {
        let _ = self.socket.0.close();
    }
}

/// Open a WASM WebSocket and return the component to attach to an entity.
/// The entity should already have `Link` and `NetcodeClient`.
/// Call this from `GameClient::on_add` or `connect_to_server` on WASM.
pub fn open_wasm_ws(url: &str) -> Result<WasmWsSocket, JsValue> {
    let socket = WebSocket::new(url)?;
    socket.set_binary_type(BinaryType::Arraybuffer);

    let recv_buf: RecvBuffer = Arc::new(Mutex::new(Vec::new()));
    let connected = Arc::new(Mutex::new(false));

    // on_message: push binary data into recv_buf
    {
        let recv_buf = recv_buf.clone();
        let on_message = Closure::<dyn FnMut(_)>::new(move |event: MessageEvent| {
            let data = event.data();
            let bytes = if let Some(s) = data.as_string() {
                Bytes::from(s.into_bytes())
            } else {
                let arr = js_sys::Uint8Array::new(&data);
                Bytes::from(arr.to_vec())
            };
            if let Ok(mut buf) = recv_buf.lock() {
                buf.push(bytes);
            }
        });
        socket.set_onmessage(Some(on_message.as_ref().unchecked_ref()));
        on_message.forget();
    }

    // on_open: mark connected
    {
        let connected = connected.clone();
        let on_open = Closure::once(move || {
            if let Ok(mut c) = connected.lock() {
                *c = true;
            }
        });
        socket.set_onopen(Some(on_open.as_ref().unchecked_ref()));
        on_open.forget();
    }

    // on_error: log
    {
        let on_error = Closure::<dyn FnMut(_)>::new(move |_event: Event| {
            warn!("[wasm-ws] WebSocket error");
        });
        socket.set_onerror(Some(on_error.as_ref().unchecked_ref()));
        on_error.forget();
    }

    // on_close is handled by the wasm_ws_lifecycle system checking readyState

    Ok(WasmWsSocket {
        socket: SendSyncWebSocket(socket),
        recv_buf,
        connected,
    })
}

/// PreUpdate system: drain received packets from the JS callback buffer
/// into the lightyear `Link.recv` buffer.
pub fn wasm_ws_recv(mut query: Query<(&mut Link, &WasmWsSocket), With<Linked>>) {
    for (mut link, ws) in &mut query {
        if let Ok(mut buf) = ws.recv_buf.lock() {
            for packet in buf.drain(..) {
                link.recv.push(packet, bevy::platform::time::Instant::now());
            }
        }
    }
}

/// PostUpdate system: drain `Link.send` and push packets directly to the
/// browser WebSocket. Synchronous — no async, no channels, no spawn_local.
///
/// Copies each packet to a fresh `Uint8Array` before sending because
/// bevy+pthreads uses SharedArrayBuffer-backed WASM memory, and browsers
/// reject shared buffers in `WebSocket.send()`.
pub fn wasm_ws_send(mut query: Query<(&mut Link, &WasmWsSocket), With<Linked>>) {
    for (mut link, ws) in &mut query {
        for packet in link.send.drain() {
            // Copy to a non-shared JS Uint8Array
            let arr = js_sys::Uint8Array::new_with_length(packet.len() as u32);
            arr.copy_from(&packet);
            if let Err(e) = ws.socket.0.send_with_array_buffer_view(&arr) {
                warn!("[wasm-ws] send failed: {:?}", e);
            }
        }
    }
}

/// Update system: manage Linking → Linked → Unlinked lifecycle based on
/// the WebSocket readyState and our connected flag.
pub fn wasm_ws_lifecycle(
    mut commands: Commands,
    query: Query<(Entity, &WasmWsSocket, Has<Linking>, Has<Linked>), Without<Unlinked>>,
) {
    for (entity, ws, is_linking, is_linked) in &query {
        let ready_state = ws.socket.0.ready_state();
        let is_connected = ws.connected.lock().map(|c| *c).unwrap_or(false);

        match ready_state {
            // CONNECTING (0)
            0 => {
                if !is_linking && !is_linked {
                    commands.entity(entity).insert(Linking);
                }
            }
            // OPEN (1)
            1 => {
                if is_connected && !is_linked {
                    commands.entity(entity).insert(Linked);
                    info!("[wasm-ws] WebSocket connected — Linked");
                }
            }
            // CLOSING (2) or CLOSED (3)
            2 | 3 => {
                if !is_linked {
                    // Never connected — unlink
                    commands.entity(entity).insert(Unlinked {
                        reason: "WebSocket closed before connected".to_string(),
                    });
                } else {
                    commands.entity(entity).insert(Unlinked {
                        reason: "WebSocket connection closed".to_string(),
                    });
                }
                warn!("[wasm-ws] WebSocket closed (readyState={})", ready_state);
            }
            _ => {}
        }
    }
}
