use std::borrow::Cow;
use axum::body::Bytes;
use tokio::time::Instant;
use tokio::sync::oneshot;
use tokio::time::Duration;

pub const TTL_DURATION: Duration = Duration::from_secs(60);

#[derive(serde::Serialize)]
pub struct CowKeyValueResponse<'a> {
  pub(crate) value: Cow<'a, str>,
}


#[derive(Debug)]
pub struct WriteRequest {
  pub key: String,
  pub value: Bytes,
  pub expires_at: Instant,
}

#[derive(Debug)]
pub struct ReadRequest {
  pub key: String,
  pub response_tx: oneshot::Sender<Option<(Bytes, Instant)>>,
}