use std::sync::OnceLock;
use std::time::Instant;

use dashmap::DashMap;
use uuid::Uuid;

use super::render::Term;

#[derive(Debug, Clone)]
pub struct Caller {
    pub handle: String,
    pub term: Term,
    pub connected_at: Instant,
}

static ONLINE: OnceLock<DashMap<Uuid, Caller>> = OnceLock::new();

fn online() -> &'static DashMap<Uuid, Caller> {
    ONLINE.get_or_init(DashMap::new)
}

pub fn join(session: Uuid, term: Term) {
    online().insert(
        session,
        Caller {
            handle: "guest".to_string(),
            term,
            connected_at: Instant::now(),
        },
    );
}

pub fn rename(session: Uuid, handle: &str) {
    if let Some(mut entry) = online().get_mut(&session) {
        entry.handle = handle.to_string();
    }
}

pub fn leave(session: Uuid) {
    online().remove(&session);
}

pub fn count() -> usize {
    online().len()
}

pub fn callers() -> Vec<Caller> {
    let mut list: Vec<Caller> = online().iter().map(|e| e.value().clone()).collect();
    list.sort_by_key(|c| c.connected_at);
    list
}
