use std::path::PathBuf;
use chrono::Utc;
use tokio::sync::broadcast::{ Sender as BroadcastSender };
use crate::entity::ulid::ConnectionId;

use twitch_irc::login::{ RefreshingLoginCredentials, FileTokenStorage };
use twitch_irc::{ TwitchIRCClient, SecureTCPTransport };
use twitch_irc::message::{ ServerMessage, ClientMessage };

use crate::proto::twitch::{
  TwitchEventObject,
  TwitchChatMessage,
  TwitchJoinEvent,
  TwitchPartEvent,
  TwitchNoticeEvent,
  TwitchModerationEvent,
  TwitchSubEvent,
  TwitchRaidEvent,
  TwitchCheerEvent,
  TwitchRedemptionEvent,
  TwitchPing,
  TwitchPong,
  TwitchSender,
};
use crate::sidecar::{ TwitchAuth, save_twitch_json_from_env };
use crate::error::JediError;

#[derive(Debug, Clone)]
pub struct TwitchEventEnvelope {
  pub event: TwitchEventObject,
  pub received_at: u64,
}

pub async fn init_pubsub_twitch_connection(
  event_tx: BroadcastSender<TwitchEventEnvelope>
) -> Result<
  TwitchIRCClient<SecureTCPTransport, RefreshingLoginCredentials<FileTokenStorage>>,
  JediError
> {
  let auth = TwitchAuth::from_env();

  if let Err(e) = save_twitch_json_from_env("TWITCH_OAUTH_TOKEN_JSON", &auth.token_path) {
    tracing::warn!("[Twitch] Could not save bootstrap token: {}", e);
  }

  let token_storage = FileTokenStorage::new(auth.token_path.clone());

  let credentials = RefreshingLoginCredentials::init(
    auth.client_id,
    auth.client_secret,
    token_storage
  );

  let (mut incoming, client) = TwitchIRCClient::<SecureTCPTransport, _>::new(credentials);

  tokio::spawn(async move {
    while let Some(msg) = incoming.recv().await {
      if let Some(event) = parse_twitch_message(msg) {
        let envelope = TwitchEventEnvelope {
          event,
          received_at: Utc::now().timestamp_millis() as u64,
        };
        let _ = event_tx.send(envelope);
      }
    }
    tracing::warn!("[Twitch] Event stream closed.");
  });

  Ok(client)
}

pub fn parse_twitch_message(msg: ServerMessage) -> Option<TwitchEventObject> {
  match msg {
    ServerMessage::Privmsg(m) =>
      Some(TwitchEventObject {
        object: Some(
          twitch::twitch_event_object::Object::Chat(TwitchChatMessage {
            channel: m.channel.clone(),
            message: m.message_text.clone(),
            tags: m.tags.clone(),
            sender: Some(TwitchSender {
              nick: m.sender.login,
              user: "".into(),
              host: "".into(),
              id: "".into(),
            }),
          })
        ),
        origin: "twitch".into(),
        relay_generated: false,
        id: ConnectionId::new().as_str(),
        timestamp: Utc::now().timestamp_millis(),
      }),

    ServerMessage::Join(m) =>
      Some(TwitchEventObject {
        object: Some(
          twitch::twitch_event_object::Object::Join(TwitchJoinEvent {
            channel: m.channel.clone(),
            user: Some(TwitchSender {
              nick: m.login,
              user: "".into(),
              host: "".into(),
              id: "".into(),
            }),
          })
        ),
        origin: "twitch".into(),
        relay_generated: false,
        id: ConnectionId::new().as_str(),
        timestamp: Utc::now().timestamp_millis(),
      }),

    ServerMessage::Part(m) =>
      Some(TwitchEventObject {
        object: Some(
          twitch::twitch_event_object::Object::Part(TwitchPartEvent {
            channel: m.channel.clone(),
            user: Some(TwitchSender {
              nick: m.login,
              user: "".into(),
              host: "".into(),
              id: "".into(),
            }),
          })
        ),
        origin: "twitch".into(),
        relay_generated: false,
        id: ConnectionId::new().as_str(),
        timestamp: Utc::now().timestamp_millis(),
      }),

    _ => None,
  }
}

pub async fn send_twitch_chat_message(
  client: &TwitchIRCClient<SecureTCPTransport, RefreshingLoginCredentials>,
  channel: &str,
  message: &str
) -> Result<(), JediError> {
  let msg = ClientMessage::Privmsg(channel.to_string(), message.to_string());
  client
    .send_message(msg).await
    .map_err(|e| { JediError::Internal(format!("Failed to send Twitch message: {}", e).into()) })
}
