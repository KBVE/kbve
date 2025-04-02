use std::path::PathBuf;
use chrono::Utc;
use tokio::fs;
use tokio::sync::broadcast::{ Sender as BroadcastSender };
use crate::entity::ulid::ConnectionId;
use async_trait::async_trait;

use twitch_irc::login::{ RefreshingLoginCredentials, TokenStorage, UserAccessToken };
use twitch_irc::{ ClientConfig, SecureTCPTransport, TwitchIRCClient };
use twitch_irc::message::{ ServerMessage };

use crate::proto::twitch::{
  self, TwitchChatMessage, TwitchCheerEvent, TwitchEventObject, TwitchJoinEvent, TwitchModerationEvent, TwitchNoticeEvent, TwitchPartEvent, TwitchPing, TwitchPong, TwitchRaidEvent, TwitchRedemptionEvent, TwitchSender, TwitchSubEvent
};
use crate::sidecar::{ TwitchAuth, save_twitch_json_from_env, FileTokenStorage };
use crate::error::JediError;

#[async_trait]
impl TokenStorage for FileTokenStorage<UserAccessToken> {
    type LoadError = std::io::Error;
    type UpdateError = std::io::Error;

    async fn load_token<'a>(&'a mut self) -> Result<UserAccessToken, Self::LoadError> {
        let contents = fs::read_to_string(&*self.path).await?;
        let token = serde_json::from_str::<UserAccessToken>(&contents)
            .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, format!("Parse error: {e}")))?;
        Ok(token)
    }

    async fn update_token<'a>(&'a mut self, token: &UserAccessToken) -> Result<(), Self::UpdateError> {
        let json = serde_json::to_string_pretty(token)
            .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, format!("Serialize error: {e}")))?;
        fs::write(&*self.path, json).await
    }
}


#[derive(Debug, Clone)]
pub struct TwitchEventEnvelope {
  pub event: TwitchEventObject,
  pub received_at: u64,
}

pub async fn init_pubsub_twitch_connection(
  event_tx: BroadcastSender<TwitchEventEnvelope>
) -> Result<
  TwitchIRCClient<SecureTCPTransport, RefreshingLoginCredentials<FileTokenStorage<UserAccessToken>>>,
  JediError
> {
  let auth = TwitchAuth::from_env();

  if let Err(e) = save_twitch_json_from_env("TWITCH_OAUTH_TOKEN_JSON", &auth.token_path) {
    tracing::warn!("[Twitch] Could not save bootstrap token: {}", e);
  }

  let token_storage = FileTokenStorage::<UserAccessToken>::new(auth.token_path.clone());


  let credentials = RefreshingLoginCredentials::init(
    auth.client_id,
    auth.client_secret,
    token_storage
  );

  let config = ClientConfig::new_simple(credentials);


  let (mut incoming, client) = TwitchIRCClient::<SecureTCPTransport, _>::new(config);

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
            channel: m.channel_login.clone(),
            message: m.message_text.clone(),
            tags: std::collections::HashMap::new(),
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
            channel: m.channel_login.clone(),
            user: Some(TwitchSender {
              nick: m.user_login.clone(),
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
            channel: m.channel_login.clone(),
            user: Some(TwitchSender {
              nick: m.user_login,
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
  client: &TwitchIRCClient<SecureTCPTransport, RefreshingLoginCredentials<FileTokenStorage<UserAccessToken>>>,
  channel: &str,
  message: &str
) -> Result<(), JediError> {
  client
    .say(channel.to_owned(), message.to_owned())
    .await
    .map_err(|e| JediError::Internal(format!("Failed to send Twitch message: {}", e).into()))
}
