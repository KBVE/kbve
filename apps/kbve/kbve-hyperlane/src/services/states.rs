use std::sync::Arc;
use std::time::Duration;

use papaya::HashMap as PapayaHashMap;
use bitflags::bitflags;
use serde::{ Deserialize, Serialize };
use tracing::{ info, warn, error };
use ulid::Ulid;

pub type Cache<K, V> = Arc<PapayaHashMap<K, V>>;
pub type DateTime = chrono::DateTime<chrono::Utc>;
pub type Json = serde_json::Value;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserSession {
    pub supabase_id: String,
    pub session_ulid: Ulid,
    pub email: String,
    pub roles: Vec<String>,
    pub cache_expires_at: DateTime,
    pub jwt_expires_at: DateTime,
    pub cached_at: DateTime,
    pub last_activity: DateTime,
    pub metadata: Option<Json>,
    pub flags: SessionFlags,
}

impl UserSession {
    pub fn check(&self, flag: SessionFlags) -> bool {
        self.flags.container(flags)
    }
}

#[derive(Clone)]
pub struct AppState {
  //  pub metrics: Arc<Metrics>,
  //  pub config: Arc<Config>,
  //  Add your database connections, Redis clients, etc. here
  //  pub db: Arc<DatabasePool>,
  //  pub redis: Arc<RedisPool>,
}

bitflags! {
    #[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
    pub struct SessionFlags: u32 {
        /// User has verified their email
        const EMAIL_VERIFIED = 1 << 0;
        /// User has completed onboarding  
        const ONBOARDING_COMPLETE = 1 << 1;
        /// User is an admin
        const IS_ADMIN = 1 << 2;
        /// User account is active
        const IS_ACTIVE = 1 << 3;
        /// Two-factor authentication enabled
        const MFA_ENABLED = 1 << 4;
        /// Premium/paid user
        const IS_VIP = 1 << 5;
    }
}