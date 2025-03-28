use super::status;
use super::store;
use axum::body::Bytes;
use ulid::Ulid;
use chrono::{DateTime, Utc, TimeZone};
use tokio::time::{Instant, Duration};

pub struct ReadEnvelope {
    pub proto: store::StoreKey,
    pub response_tx: tokio::sync::oneshot::Sender<Option<(Bytes, Instant)>>,
}


pub trait StatusMessageExt {
    fn ulid(&self) -> Option<Ulid>;
    fn is_text(&self) -> bool;
    fn is_image(&self) -> bool;
    fn is_video(&self) -> bool;
    fn is_audio(&self) -> bool;
    fn is_link(&self) -> bool;
    fn has_media(&self) -> bool;
    fn is_public(&self) -> bool;
    fn is_followers_only(&self) -> bool;
    fn is_private(&self) -> bool;
    fn is_reply(&self) -> bool;
    fn is_quote(&self) -> bool;
    fn is_restatus(&self) -> bool;
    fn has_attachments(&self) -> bool;
    fn preview(&self, max_len: usize) -> String;
    fn timestamp_as_datetime(&self) -> Option<DateTime<Utc>>;
}

impl StatusMessageExt for status::StatusMessage {
    fn ulid(&self) -> Option<Ulid> {
        Ulid::from_string(&self.id).ok()
    }

    fn is_text(&self) -> bool {
        self.r#type & 0b00001 != 0
    }

    fn is_image(&self) -> bool {
        self.r#type & 0b00010 != 0
    }

    fn is_video(&self) -> bool {
        self.r#type & 0b00100 != 0
    }

    fn is_audio(&self) -> bool {
        self.r#type & 0b01000 != 0
    }

    fn is_link(&self) -> bool {
        self.r#type & 0b10000 != 0
    }

    fn has_media(&self) -> bool {
        self.is_image() || self.is_video() || self.is_audio()
    }

    fn is_public(&self) -> bool {
        self.visibility & 0b00001 != 0
    }

    fn is_followers_only(&self) -> bool {
        self.visibility & 0b00010 != 0
    }

    fn is_private(&self) -> bool {
        self.visibility & 0b00100 != 0
    }

    fn is_reply(&self) -> bool {
        !self.parent_id.is_empty()
    }

    fn is_quote(&self) -> bool {
        !self.quote_text.is_empty()
    }

    fn is_restatus(&self) -> bool {
        self.is_restatus
    }

    fn has_attachments(&self) -> bool {
        !self.attachments.is_empty()
    }

    fn preview(&self, max_len: usize) -> String {
        if self.content.len() <= max_len {
            self.content.clone()
        } else {
            format!("{}...", &self.content[..max_len])
        }
    }

    fn timestamp_as_datetime(&self) -> Option<DateTime<Utc>> {
        Utc.timestamp_millis_opt(self.timestamp).single()
    }
}

pub trait StoreObjExt {
    fn to_write_request(&self, ttl: Duration) -> Option<(String, Bytes, Instant)>;
    fn timestamp_as_datetime(&self) -> Option<DateTime<Utc>>;
}

impl From<store::StoreObj> for (String, Bytes, Instant) {
    fn from(obj: store::StoreObj) -> Self {
        let ttl = Duration::from_secs(obj.expiry.unwrap_or(60) as u64);
        let key = obj.key;
        let value = Bytes::from(obj.value);
        let expires_at = Instant::now() + ttl;
        (key, value, expires_at)
    }
}

impl StoreObjExt for store::StoreObj {
    fn to_write_request(&self, ttl: Duration) -> Option<(String, Bytes, Instant)> {
        let key = self.key.clone();
        let value = Bytes::from(self.value.clone());
        let expires_at = if let Some(secs) = self.expiry {
            Instant::now() + Duration::from_secs(secs as u64)
        } else {
            Instant::now() + ttl // fallback TTL
        };

        Some((key, value, expires_at))
    }

    fn timestamp_as_datetime(&self) -> Option<DateTime<Utc>> {
        Utc.timestamp_millis_opt(self.timestamp).single()
    }

    
}
