use std::sync::Arc;
use std::time::{Duration, Instant};

use dashmap::DashMap;
use poise::serenity_prelude as serenity;
use tokio::sync::Mutex;

use super::types::{GameOverReason, GamePhase, SessionState, ShortSid};

/// In-memory session store backed by DashMap.
///
/// Each session is wrapped in `Arc<Mutex<..>>` so the interaction router
/// can acquire a per-session lock without blocking the entire store.
pub struct SessionStore {
    sessions: DashMap<ShortSid, Arc<Mutex<SessionState>>>,
}

impl SessionStore {
    pub fn new() -> Self {
        Self {
            sessions: DashMap::new(),
        }
    }

    /// Insert a new session and return the shared handle.
    pub fn create(&self, state: SessionState) -> Arc<Mutex<SessionState>> {
        let short_id = state.short_id.clone();
        let handle = Arc::new(Mutex::new(state));
        self.sessions.insert(short_id, Arc::clone(&handle));
        handle
    }

    /// Look up a session by its short ID.
    pub fn get(&self, short_id: &str) -> Option<Arc<Mutex<SessionState>>> {
        self.sessions.get(short_id).map(|r| Arc::clone(r.value()))
    }

    /// Remove a session by short ID.
    pub fn remove(&self, short_id: &str) {
        self.sessions.remove(short_id);
    }

    /// Find an active session in the given channel.
    pub fn find_by_channel(&self, channel_id: serenity::ChannelId) -> Option<ShortSid> {
        for entry in self.sessions.iter() {
            if let Ok(session) = entry.value().try_lock()
                && session.channel_id == channel_id
                && !matches!(session.phase, GamePhase::GameOver(_))
            {
                return Some(entry.key().clone());
            }
        }
        None
    }

    /// Find an active session where the user is owner or party member.
    pub fn find_by_user(&self, user_id: serenity::UserId) -> Option<ShortSid> {
        for entry in self.sessions.iter() {
            if let Ok(session) = entry.value().try_lock()
                && !matches!(session.phase, GamePhase::GameOver(_))
                && (session.owner == user_id || session.party.contains(&user_id))
            {
                return Some(entry.key().clone());
            }
        }
        None
    }

    /// Remove sessions that have been idle longer than `timeout`.
    /// Called periodically by a background task.
    pub fn cleanup_expired(&self, timeout: Duration) {
        let now = Instant::now();
        let mut to_remove = Vec::new();

        for entry in self.sessions.iter() {
            if let Ok(mut session) = entry.value().try_lock()
                && now.duration_since(session.last_action_at) > timeout
            {
                session.phase = GamePhase::GameOver(GameOverReason::Expired);
                to_remove.push(entry.key().clone());
            }
        }

        for sid in to_remove {
            self.sessions.remove(&sid);
        }
    }

    /// Number of active sessions (for diagnostics).
    #[allow(dead_code)]
    pub fn count(&self) -> usize {
        self.sessions.len()
    }
}

impl Default for SessionStore {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::discord::game::{content, types::*};

    fn test_state(short_id: &str, channel: u64, owner: u64) -> SessionState {
        let mut player = PlayerState::default();
        player.inventory = content::starting_inventory();
        let owner_id = serenity::UserId::new(owner);

        SessionState {
            id: uuid::Uuid::new_v4(),
            short_id: short_id.to_owned(),
            owner: owner_id,
            party: Vec::new(),
            mode: SessionMode::Solo,
            phase: GamePhase::Exploring,
            channel_id: serenity::ChannelId::new(channel),
            message_id: serenity::MessageId::new(1),
            created_at: Instant::now(),
            last_action_at: Instant::now(),
            turn: 0,
            players: std::collections::HashMap::from([(owner_id, player)]),
            enemies: Vec::new(),
            room: content::generate_room(0),
            log: Vec::new(),
            show_items: false,
            pending_actions: std::collections::HashMap::new(),
            map: test_map_default(),
            show_map: false,
            pending_destination: None,
        }
    }

    #[test]
    fn create_and_get() {
        let store = SessionStore::new();
        let state = test_state("abc12345", 100, 1);
        store.create(state);

        assert!(store.get("abc12345").is_some());
        assert!(store.get("nonexistent").is_none());
    }

    #[test]
    fn remove_session() {
        let store = SessionStore::new();
        store.create(test_state("abc12345", 100, 1));
        assert_eq!(store.count(), 1);

        store.remove("abc12345");
        assert_eq!(store.count(), 0);
    }

    #[test]
    fn find_by_channel() {
        let store = SessionStore::new();
        store.create(test_state("abc12345", 100, 1));
        store.create(test_state("def67890", 200, 2));

        assert_eq!(
            store.find_by_channel(serenity::ChannelId::new(100)),
            Some("abc12345".to_owned())
        );
        assert!(
            store
                .find_by_channel(serenity::ChannelId::new(999))
                .is_none()
        );
    }

    #[test]
    fn find_by_user() {
        let store = SessionStore::new();
        store.create(test_state("abc12345", 100, 42));

        assert_eq!(
            store.find_by_user(serenity::UserId::new(42)),
            Some("abc12345".to_owned())
        );
        assert!(store.find_by_user(serenity::UserId::new(99)).is_none());
    }

    #[test]
    fn cleanup_expired_removes_old() {
        let store = SessionStore::new();
        let mut state = test_state("old_one", 100, 1);
        state.last_action_at = Instant::now() - Duration::from_secs(700);
        store.create(state);
        store.create(test_state("new_one", 200, 2));

        assert_eq!(store.count(), 2);
        store.cleanup_expired(Duration::from_secs(600));
        assert_eq!(store.count(), 1);
        assert!(store.get("new_one").is_some());
        assert!(store.get("old_one").is_none());
    }

    #[test]
    fn game_over_sessions_not_found() {
        let store = SessionStore::new();
        let mut state = test_state("done", 100, 1);
        state.phase = GamePhase::GameOver(GameOverReason::Defeated);
        store.create(state);

        assert!(
            store
                .find_by_channel(serenity::ChannelId::new(100))
                .is_none()
        );
        assert!(store.find_by_user(serenity::UserId::new(1)).is_none());
    }
}
