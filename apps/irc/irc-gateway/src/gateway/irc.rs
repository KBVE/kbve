use anyhow::Result;
use std::net::SocketAddr;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::net::{TcpListener, TcpStream};
use tracing::{info, warn, error};

use crate::auth::jwt;

/// Serve IRC passthrough on a TCP port
pub async fn serve() -> Result<()> {
    let port: u16 = std::env::var("IRC_PROXY_PORT")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(6667);
    let addr: SocketAddr = format!("0.0.0.0:{port}").parse()?;

    let listener = TcpListener::bind(addr).await?;
    info!("IRC proxy listening on {addr}");

    loop {
        let (stream, peer) = listener.accept().await?;
        tokio::spawn(async move {
            if let Err(e) = handle_irc_client(stream, peer).await {
                warn!(peer = %peer, "IRC client error: {e}");
            }
        });
    }
}

async fn handle_irc_client(mut client: TcpStream, peer: SocketAddr) -> Result<()> {
    info!(peer = %peer, "New IRC connection");

    let (reader, mut writer) = client.split();
    let mut buf_reader = BufReader::new(reader);
    let mut line = String::new();

    // Read the first line — expect PASS jwt:<token>
    buf_reader.read_line(&mut line).await?;
    let token = line
        .trim()
        .strip_prefix("PASS jwt:")
        .or_else(|| line.trim().strip_prefix("PASS "));

    let token = match token {
        Some(t) => t.to_string(),
        None => {
            writer
                .write_all(b":irc-gateway NOTICE * :Authentication required. Send PASS jwt:<token>\r\n")
                .await?;
            return Ok(());
        }
    };

    let claims = match jwt::validate_token(&token) {
        Ok(c) => c,
        Err(_) => {
            writer
                .write_all(b":irc-gateway NOTICE * :Invalid token\r\n")
                .await?;
            return Ok(());
        }
    };

    let username = claims.email
        .as_deref()
        .unwrap_or(&claims.sub)
        .chars()
        .filter(|c| c.is_alphanumeric() || *c == '_')
        .take(32)
        .collect::<String>();

    info!(peer = %peer, user = %username, "IRC client authenticated");

    // Connect to Ergo
    let ergo_host = std::env::var("ERGO_IRC_HOST")
        .unwrap_or_else(|_| "ergo-irc-service.irc.svc.cluster.local".into());
    let ergo_port: u16 = std::env::var("ERGO_IRC_PORT")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(6667);

    let mut ergo = TcpStream::connect(format!("{ergo_host}:{ergo_port}")).await?;

    // Send NICK and USER to Ergo on behalf of the authenticated client
    let nick_cmd = format!("NICK {username}\r\n");
    let user_cmd = format!("USER {username} 0 * :{username}\r\n");
    ergo.write_all(nick_cmd.as_bytes()).await?;
    ergo.write_all(user_cmd.as_bytes()).await?;

    // Reassemble the client stream (buf_reader has the remaining data)
    let client = buf_reader.into_inner().unsplit(writer);

    // Bidirectional proxy
    let (mut client_read, mut client_write) = tokio::io::split(client);
    let (mut ergo_read, mut ergo_write) = tokio::io::split(ergo);

    let c2e = tokio::io::copy(&mut client_read, &mut ergo_write);
    let e2c = tokio::io::copy(&mut ergo_read, &mut client_write);

    tokio::select! {
        _ = c2e => {},
        _ = e2c => {},
    }

    info!(peer = %peer, user = %username, "IRC session ended");
    Ok(())
}
