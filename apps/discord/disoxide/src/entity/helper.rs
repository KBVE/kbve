use std::borrow::Cow;

use tokio::time::Duration;

pub const TTL_DURATION: Duration = Duration::from_secs(60);

#[derive(serde::Serialize)]
pub struct CowKeyValueResponse<'a> {
  pub(crate) value: Cow<'a, str>,
}
