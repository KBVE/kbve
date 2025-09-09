use std::sync::Arc;
use std::time::Duration;
use std::hash::Hash;
use std::fmt::Debug;

use papaya::HashMap as PapayaHashMap;
use bitflags::bitflags;
use serde::{Deserialize, Serialize};
use tracing::{info, warn, error, debug};
use ulid::Ulid;

pub type Cache<K, V> = Arc<PapayaHashMap<K, V>>;
pub type DateTime = chrono::DateTime<chrono::Utc>;
pub type Json = serde_json::Value;

// ============================================================================
// Core State Traits
// ============================================================================

/// Trait for any stateful entity that can be cached
pub trait Stateful: Clone + Send + Sync + 'static {
    type Id: Hash + Eq + Clone + Send + Sync + Debug;
    
    fn id(&self) -> &Self::Id;
    fn is_expired(&self) -> bool;
    fn ttl(&self) -> Option<Duration>;
}

/// Trait for entities that track their lifecycle
pub trait Timestamped {
    fn created_at(&self) -> DateTime;
    fn updated_at(&self) -> DateTime;
    fn expires_at(&self) -> Option<DateTime>;
}

/// Trait for entities with metadata
pub trait HasMetadata {
    fn metadata(&self) -> Option<&Json>;
    fn metadata_mut(&mut self) -> &mut Option<Json>;
    
    fn get_metadata_value(&self, key: &str) -> Option<&serde_json::Value> {
        self.metadata()?.get(key)
    }
    
    fn set_metadata_value(&mut self, key: String, value: serde_json::Value) {
        let metadata = self.metadata_mut();
        if metadata.is_none() {
            *metadata = Some(serde_json::json!({}));
        }
        if let Some(meta) = metadata {
            if let Some(obj) = meta.as_object_mut() {
                obj.insert(key, value);
            }
        }
    }
}

// ============================================================================
// Generic State Store
// ============================================================================

/// Generic state store for managing cached entities
pub struct StateStore<K, V> 
where 
    K: Hash + Eq + Clone + Send + Sync + Debug,
    V: Clone + Send + Sync,
{
    cache: Cache<K, V>,
    name: String,
}

impl<K, V> StateStore<K, V>
where
    K: Hash + Eq + Clone + Send + Sync + Debug,
    V: Clone + Send + Sync,
{
    pub fn new(name: impl Into<String>) -> Self {
        Self {
            cache: Arc::new(PapayaHashMap::new()),
            name: name.into(),
        }
    }
    
    pub fn get(&self, key: &K) -> Option<V> {
        let guard = self.cache.guard();
        let value = self.cache.get(key, &guard).cloned();
        
        if value.is_some() {
            debug!("{}: Cache hit for key {:?}", self.name, key);
        } else {
            debug!("{}: Cache miss for key {:?}", self.name, key);
        }
        
        value
    }
    
    pub fn insert(&self, key: K, value: V) -> Option<V> {
        debug!("{}: Inserting key {:?}", self.name, key);
        let guard = self.cache.guard();
        self.cache.insert(key, value, &guard)
    }
    
    pub fn remove(&self, key: &K) -> Option<V> {
        debug!("{}: Removing key {:?}", self.name, key);
        let guard = self.cache.guard();
        self.cache.remove(key, &guard)
    }
    
    pub fn contains_key(&self, key: &K) -> bool {
        let guard = self.cache.guard();
        self.cache.contains_key(key, &guard)
    }
    
    pub fn clear(&self) {
        info!("{}: Clearing all entries", self.name);
        let guard = self.cache.guard();
        self.cache.clear(&guard);
    }
    
    pub fn len(&self) -> usize {
        let guard = self.cache.guard();
        self.cache.len(&guard)
    }
    
    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }
    
    /// Get or insert with a factory function
    pub fn get_or_insert_with<F>(&self, key: K, f: F) -> V
    where
        F: FnOnce() -> V,
    {
        if let Some(value) = self.get(&key) {
            value
        } else {
            let value = f();
            self.insert(key.clone(), value.clone());
            value
        }
    }
    
    /// Update an existing value
    pub fn update<F>(&self, key: &K, f: F) -> Option<V>
    where
        F: FnOnce(&V) -> V,
    {
        if let Some(old_value) = self.get(key) {
            let new_value = f(&old_value);
            self.insert(key.clone(), new_value.clone());
            Some(new_value)
        } else {
            None
        }
    }
}

impl<K, V> StateStore<K, V>
where
    K: Hash + Eq + Clone + Send + Sync + Debug,
    V: Stateful<Id = K>,
{
    /// Clean up expired entries
    pub fn cleanup_expired(&self) -> usize {
        let guard = self.cache.guard();
        let mut removed = 0;
        
        for (key, value) in self.cache.iter(&guard) {
            if value.is_expired() {
                self.cache.remove(key, &guard);
                removed += 1;
            }
        }
        
        if removed > 0 {
            info!("{}: Removed {} expired entries", self.name, removed);
        }
        
        removed
    }
    
    /// Get non-expired value
    pub fn get_valid(&self, key: &K) -> Option<V> {
        self.get(key).filter(|v| !v.is_expired())
    }
}

// ============================================================================
// Session Management
// ============================================================================

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
    pub fn new(
        supabase_id: String,
        email: String,
        roles: Vec<String>,
        jwt_expires_at: DateTime,
    ) -> Self {
        let now = chrono::Utc::now();
        Self {
            supabase_id,
            session_ulid: Ulid::new(),
            email,
            roles,
            cache_expires_at: now + chrono::Duration::hours(1),
            jwt_expires_at,
            cached_at: now,
            last_activity: now,
            metadata: None,
            flags: SessionFlags::IS_ACTIVE,
        }
    }
    
    pub fn check(&self, flag: SessionFlags) -> bool {
        self.flags.contains(flag)
    }
    
    pub fn set_flag(&mut self, flag: SessionFlags, value: bool) {
        if value {
            self.flags.insert(flag);
        } else {
            self.flags.remove(flag);
        }
    }
    
    pub fn update_activity(&mut self) {
        self.last_activity = chrono::Utc::now();
    }
    
    pub fn has_role(&self, role: &str) -> bool {
        self.roles.iter().any(|r| r == role)
    }
    
    pub fn is_admin(&self) -> bool {
        self.check(SessionFlags::IS_ADMIN) || self.has_role("admin")
    }
}

impl Stateful for UserSession {
    type Id = String;
    
    fn id(&self) -> &Self::Id {
        &self.supabase_id
    }
    
    fn is_expired(&self) -> bool {
        chrono::Utc::now() > self.cache_expires_at
    }
    
    fn ttl(&self) -> Option<Duration> {
        let remaining = self.cache_expires_at - chrono::Utc::now();
        if remaining > chrono::Duration::zero() {
            Some(Duration::from_secs(remaining.num_seconds() as u64))
        } else {
            None
        }
    }
}

impl Timestamped for UserSession {
    fn created_at(&self) -> DateTime {
        self.cached_at
    }
    
    fn updated_at(&self) -> DateTime {
        self.last_activity
    }
    
    fn expires_at(&self) -> Option<DateTime> {
        Some(self.cache_expires_at)
    }
}

impl HasMetadata for UserSession {
    fn metadata(&self) -> Option<&Json> {
        self.metadata.as_ref()
    }
    
    fn metadata_mut(&mut self) -> &mut Option<Json> {
        &mut self.metadata
    }
}

// ============================================================================
// Application State
// ============================================================================

#[derive(Clone)]
pub struct AppState {
    pub sessions: Arc<StateStore<String, UserSession>>,
    // Add other state stores as needed:
    // pub api_keys: Arc<StateStore<String, ApiKey>>,
    // pub rate_limits: Arc<StateStore<String, RateLimit>>,
    // pub feature_flags: Arc<StateStore<String, FeatureFlag>>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            sessions: Arc::new(StateStore::new("sessions")),
        }
    }
    
    /// Run periodic cleanup of expired sessions
    pub async fn cleanup_task(&self, interval: Duration) {
        let sessions = Arc::clone(&self.sessions);
        
        tokio::spawn(async move {
            let mut interval = tokio::time::interval(interval);
            loop {
                interval.tick().await;
                let removed = sessions.cleanup_expired();
                if removed > 0 {
                    info!("Cleaned up {} expired sessions", removed);
                }
            }
        });
    }
}

impl Default for AppState {
    fn default() -> Self {
        Self::new()
    }
}

// ============================================================================
// Helper Types for Common State Patterns
// ============================================================================

/// Generic cached value with TTL
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CachedValue<T> {
    pub value: T,
    pub cached_at: DateTime,
    pub expires_at: DateTime,
}

impl<T> CachedValue<T> {
    pub fn new(value: T, ttl: Duration) -> Self {
        let now = chrono::Utc::now();
        Self {
            value,
            cached_at: now,
            expires_at: now + chrono::Duration::from_std(ttl).unwrap(),
        }
    }
    
    pub fn is_valid(&self) -> bool {
        chrono::Utc::now() < self.expires_at
    }
}

impl<T: Clone + Send + Sync + 'static> Stateful for CachedValue<T> {
    type Id = String;
    
    fn id(&self) -> &Self::Id {
        panic!("CachedValue doesn't have an inherent ID, wrap it in a keyed structure")
    }
    
    fn is_expired(&self) -> bool {
        !self.is_valid()
    }
    
    fn ttl(&self) -> Option<Duration> {
        let remaining = self.expires_at - chrono::Utc::now();
        if remaining > chrono::Duration::zero() {
            Some(Duration::from_secs(remaining.num_seconds() as u64))
        } else {
            None
        }
    }
}

/// Rate limit state
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RateLimit {
    pub key: String,
    pub count: u32,
    pub window_start: DateTime,
    pub window_duration: Duration,
    pub max_requests: u32,
}

impl RateLimit {
    pub fn new(key: String, max_requests: u32, window_duration: Duration) -> Self {
        Self {
            key,
            count: 0,
            window_start: chrono::Utc::now(),
            window_duration,
            max_requests,
        }
    }
    
    pub fn check_and_increment(&mut self) -> bool {
        let now = chrono::Utc::now();
        let window_end = self.window_start + chrono::Duration::from_std(self.window_duration).unwrap();
        
        if now > window_end {
            // Reset window
            self.window_start = now;
            self.count = 1;
            true
        } else if self.count < self.max_requests {
            self.count += 1;
            true
        } else {
            false
        }
    }
    
    pub fn remaining(&self) -> u32 {
        self.max_requests.saturating_sub(self.count)
    }
}

impl Stateful for RateLimit {
    type Id = String;
    
    fn id(&self) -> &Self::Id {
        &self.key
    }
    
    fn is_expired(&self) -> bool {
        let window_end = self.window_start + chrono::Duration::from_std(self.window_duration).unwrap();
        chrono::Utc::now() > window_end
    }
    
    fn ttl(&self) -> Option<Duration> {
        let window_end = self.window_start + chrono::Duration::from_std(self.window_duration).unwrap();
        let remaining = window_end - chrono::Utc::now();
        if remaining > chrono::Duration::zero() {
            Some(Duration::from_secs(remaining.num_seconds() as u64))
        } else {
            None
        }
    }
}

// ============================================================================
// Tests
// ============================================================================

// #[cfg(test)]
// mod tests {
//     use super::*;
    
//     #[test]
//     fn test_state_store() {
//         let store: StateStore<String, String> = StateStore::new("test");
        
//         store.insert("key1".to_string(), "value1".to_string());
//         assert_eq!(store.get(&"key1".to_string()), Some("value1".to_string()));
        
//         store.update(&"key1".to_string(), |v| format!("{}_updated", v));
//         assert_eq!(store.get(&"key1".to_string()), Some("value1_updated".to_string()));
        
//         assert_eq!(store.len(), 1);
//         store.clear();
//         assert_eq!(store.len(), 0);
//     }
    
//     #[test]
//     fn test_session_flags() {
//         let mut session = UserSession::new(
//             "user123".to_string(),
//             "user@example.com".to_string(),
//             vec!["user".to_string()],
//             chrono::Utc::now() + chrono::Duration::hours(24),
//         );
        
//         assert!(session.check(SessionFlags::IS_ACTIVE));
//         assert!(!session.check(SessionFlags::IS_ADMIN));
        
//         session.set_flag(SessionFlags::EMAIL_VERIFIED, true);
//         assert!(session.check(SessionFlags::EMAIL_VERIFIED));
        
//         session.set_flag(SessionFlags::EMAIL_VERIFIED, false);
//         assert!(!session.check(SessionFlags::EMAIL_VERIFIED));
//     }
    
//     #[test]
//     fn test_rate_limit() {
//         let mut rate_limit = RateLimit::new("api_key".to_string(), 3, Duration::from_secs(60));
        
//         assert!(rate_limit.check_and_increment());
//         assert!(rate_limit.check_and_increment());
//         assert!(rate_limit.check_and_increment());
//         assert!(!rate_limit.check_and_increment()); // Should fail, limit reached
        
//         assert_eq!(rate_limit.remaining(), 0);
//     }
// }