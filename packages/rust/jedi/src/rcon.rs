//! Source RCON client — game-agnostic implementation of the Valve Source
//! protocol (Minecraft, Factorio, and every other game that speaks
//! length-prefixed TCP RCON).
//!
//! Shared so axum-kbve, the discord bot, internal scripts, and future Rust
//! services all hit the same wire implementation instead of re-rolling the
//! packet framing.
//!
//! Higher layers stay in their own crates:
//!   * command grammars (MC `list`, Factorio `/silent-command`, …)
//!   * allowlist / auth gating
//!   * per-endpoint env-var schemes
//!   * audit logging
//!
//! Only the transport lives here.

use std::time::Duration;
use thiserror::Error;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;
use tokio::time::timeout;

/// Source RCON packet types we send. Server-auth response also reuses these.
const PACKET_TYPE_AUTH: i32 = 3;
const PACKET_TYPE_EXEC: i32 = 2;

/// Hard ceiling on packet body length. Source RCON is documented at 4096
/// bytes per packet; reject anything outside [10, 4096] so a corrupt stream
/// can't bait us into a huge allocation.
const PACKET_MIN_LEN: usize = 10;
const PACKET_MAX_LEN: usize = 4096;

/// Failed-auth sentinel returned by the server in the `id` field per the
/// Source RCON spec.
const AUTH_FAILED_ID: i32 = -1;

#[derive(Debug, Error)]
pub enum RconError {
    #[error("rcon connect to {addr} timed out after {timeout:?}")]
    ConnectTimeout { addr: String, timeout: Duration },

    #[error("rcon i/o: {0}")]
    Io(#[from] std::io::Error),

    #[error("rcon auth rejected by server")]
    AuthRejected,

    #[error("rcon packet length {0} out of range [{PACKET_MIN_LEN}, {PACKET_MAX_LEN}]")]
    PacketLength(usize),
}

pub type RconResult<T> = Result<T, RconError>;

/// Connection params for one RCON endpoint. Cheap to clone — meant to be
/// built once at startup from env vars / config and reused per call.
#[derive(Clone, Debug)]
pub struct RconEndpoint {
    pub host: String,
    pub port: u16,
    pub password: String,
}

impl RconEndpoint {
    pub fn new(host: impl Into<String>, port: u16, password: impl Into<String>) -> Self {
        Self {
            host: host.into(),
            port,
            password: password.into(),
        }
    }

    pub fn addr(&self) -> String {
        format!("{}:{}", self.host, self.port)
    }
}

/// Authenticated RCON session. Holds the TCP stream and a monotonically
/// increasing request id. Drop the value to close the connection.
pub struct RconClient {
    stream: TcpStream,
    next_id: i32,
}

impl RconClient {
    /// Connect and authenticate against an endpoint, returning a session
    /// ready to `exec`.
    pub async fn connect(ep: &RconEndpoint, connect_timeout: Duration) -> RconResult<Self> {
        let stream = timeout(connect_timeout, TcpStream::connect(ep.addr()))
            .await
            .map_err(|_| RconError::ConnectTimeout {
                addr: ep.addr(),
                timeout: connect_timeout,
            })??;

        let mut client = Self { stream, next_id: 1 };
        client.authenticate(&ep.password).await?;
        Ok(client)
    }

    async fn authenticate(&mut self, password: &str) -> RconResult<()> {
        let id = self.alloc_id();
        send_packet(&mut self.stream, id, PACKET_TYPE_AUTH, password).await?;
        let (resp_id, _, _) = recv_packet(&mut self.stream).await?;
        if resp_id == AUTH_FAILED_ID {
            return Err(RconError::AuthRejected);
        }
        Ok(())
    }

    /// Send an EXEC packet and return the body of the server's response.
    pub async fn exec(&mut self, command: &str) -> RconResult<String> {
        let id = self.alloc_id();
        send_packet(&mut self.stream, id, PACKET_TYPE_EXEC, command).await?;
        let (_, _, body) = recv_packet(&mut self.stream).await?;
        Ok(body)
    }

    fn alloc_id(&mut self) -> i32 {
        let id = self.next_id;
        self.next_id = self.next_id.wrapping_add(1).max(1);
        id
    }
}

/// Wire format: [length:4][req_id:4][type:4][body + \0][pad \0]
///
/// Buffered into one write so RCON servers that expect atomic reads don't
/// race a TCP segmentation boundary.
async fn send_packet(
    stream: &mut TcpStream,
    req_id: i32,
    ptype: i32,
    body: &str,
) -> RconResult<()> {
    let body_bytes = body.as_bytes();
    let length = 4 + 4 + body_bytes.len() as i32 + 2;

    let mut buf = Vec::with_capacity(4 + length as usize);
    buf.extend_from_slice(&length.to_le_bytes());
    buf.extend_from_slice(&req_id.to_le_bytes());
    buf.extend_from_slice(&ptype.to_le_bytes());
    buf.extend_from_slice(body_bytes);
    buf.extend_from_slice(&[0, 0]);

    stream.write_all(&buf).await?;
    stream.flush().await?;
    Ok(())
}

async fn recv_packet(stream: &mut TcpStream) -> RconResult<(i32, i32, String)> {
    let mut len_buf = [0u8; 4];
    stream.read_exact(&mut len_buf).await?;
    let length = i32::from_le_bytes(len_buf) as usize;

    if !(PACKET_MIN_LEN..=PACKET_MAX_LEN).contains(&length) {
        return Err(RconError::PacketLength(length));
    }

    let mut payload = vec![0u8; length];
    stream.read_exact(&mut payload).await?;

    let req_id = i32::from_le_bytes([payload[0], payload[1], payload[2], payload[3]]);
    let ptype = i32::from_le_bytes([payload[4], payload[5], payload[6], payload[7]]);
    let body_end = length.saturating_sub(2);
    let body = String::from_utf8_lossy(&payload[8..body_end]).to_string();

    Ok((req_id, ptype, body))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn endpoint_addr_formats_host_port() {
        let ep = RconEndpoint::new("mc-lobby.kbve.svc.cluster.local", 25575, "hunter2");
        assert_eq!(ep.addr(), "mc-lobby.kbve.svc.cluster.local:25575");
    }

    #[test]
    fn endpoint_clone_is_cheap_and_independent() {
        let ep = RconEndpoint::new("a", 1, "p");
        let cloned = ep.clone();
        assert_eq!(cloned.host, "a");
        assert_eq!(cloned.port, 1);
        assert_eq!(cloned.password, "p");
    }
}
