use std::sync::{Arc, OnceLock};
use std::time::{Duration, Instant};

use dashmap::DashMap;
use sha2::{Digest, Sha256};
use tokio::sync::{Mutex, Notify};
use uuid::Uuid;

const ALPHABET: &[u8] = b"23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const CODE_LEN: usize = 8;
const MAX_LIVE_CLAIMS: usize = 512;

pub const CLAIM_TTL: Duration = Duration::from_secs(300);

/// One pending terminal login, keyed in the store by the hash of its display code.
pub struct Slot {
    pub session: Uuid,
    pub code: String,
    key: String,
    expires_at: Instant,
    notify: Notify,
    user_id: Mutex<Option<String>>,
}

impl Slot {
    pub fn expired(&self) -> bool {
        Instant::now() >= self.expires_at
    }

    /// Block until the website redeems this code, the TTL lapses, or `timeout` elapses.
    pub async fn wait(&self, timeout: Duration) -> Option<String> {
        if let Some(user_id) = self.user_id.lock().await.clone() {
            return Some(user_id);
        }
        let deadline = self
            .expires_at
            .min(Instant::now() + timeout)
            .saturating_duration_since(Instant::now());
        let _ = tokio::time::timeout(deadline, self.notify.notified()).await;
        self.user_id.lock().await.clone()
    }
}

#[derive(Debug, PartialEq, Eq)]
pub enum Redeem {
    Ok,
    Unknown,
}

#[derive(Default)]
pub struct ClaimStore {
    slots: DashMap<String, Arc<Slot>>,
}

fn hash_code(code: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(code.to_ascii_uppercase().replace('-', "").as_bytes());
    hasher
        .finalize()
        .iter()
        .fold(String::with_capacity(64), |mut acc, b| {
            use std::fmt::Write;
            let _ = write!(acc, "{b:02x}");
            acc
        })
}

fn random_code() -> String {
    let mut out = String::with_capacity(CODE_LEN + 1);
    let mut bits = rand::random::<u64>();
    for i in 0..CODE_LEN {
        if i == CODE_LEN / 2 {
            out.push('-');
        }
        let idx = (bits & 0x1F) as usize;
        bits >>= 5;
        out.push(ALPHABET[idx] as char);
    }
    out
}

impl ClaimStore {
    /// Mint a one-shot login code for `session`, refusing once the live set is saturated.
    pub fn create(&self, session: Uuid) -> Option<Arc<Slot>> {
        self.sweep();
        if self.slots.len() >= MAX_LIVE_CLAIMS {
            return None;
        }
        let code = random_code();
        let key = hash_code(&code);
        let slot = Arc::new(Slot {
            session,
            code,
            key: key.clone(),
            expires_at: Instant::now() + CLAIM_TTL,
            notify: Notify::new(),
            user_id: Mutex::new(None),
        });
        self.slots.insert(key, slot.clone());
        Some(slot)
    }

    pub async fn redeem(&self, code: &str, user_id: &str) -> Redeem {
        self.sweep();
        let key = hash_code(code);
        let Some((_, slot)) = self.slots.remove(&key) else {
            return Redeem::Unknown;
        };
        if slot.expired() {
            return Redeem::Unknown;
        }
        *slot.user_id.lock().await = Some(user_id.to_string());
        slot.notify.notify_one();
        Redeem::Ok
    }

    pub fn cancel(&self, slot: &Slot) {
        self.slots.remove(&slot.key);
    }

    pub fn live(&self) -> usize {
        self.slots.len()
    }

    fn sweep(&self) {
        self.slots.retain(|_, slot| !slot.expired());
    }
}

static STORE: OnceLock<ClaimStore> = OnceLock::new();

pub fn claims() -> &'static ClaimStore {
    STORE.get_or_init(ClaimStore::default)
}
