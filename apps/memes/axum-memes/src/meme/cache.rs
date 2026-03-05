use dashmap::DashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};

use super::model::{FeedPage, Meme};

const DEFAULT_MEME_TTL: Duration = Duration::from_secs(300);
const DEFAULT_FEED_TTL: Duration = Duration::from_secs(30);
const MEME_CACHE_MAX: usize = 10_000;
const FEED_CACHE_MAX: usize = 100;

struct CacheEntry<T> {
    data: Arc<T>,
    inserted_at: Instant,
}

impl<T> CacheEntry<T> {
    fn new(data: T) -> Self {
        Self {
            data: Arc::new(data),
            inserted_at: Instant::now(),
        }
    }

    fn is_expired(&self, ttl: Duration) -> bool {
        self.inserted_at.elapsed() > ttl
    }
}

/// Feed cache key: (cursor, tag).
type FeedCacheKey = (Option<String>, Option<String>);

pub struct MemeCache {
    memes: DashMap<String, CacheEntry<Meme>>,
    feeds: DashMap<FeedCacheKey, CacheEntry<FeedPage>>,
    meme_ttl: Duration,
    feed_ttl: Duration,
}

impl MemeCache {
    pub fn new() -> Self {
        Self {
            memes: DashMap::with_capacity(1000),
            feeds: DashMap::with_capacity(50),
            meme_ttl: DEFAULT_MEME_TTL,
            feed_ttl: DEFAULT_FEED_TTL,
        }
    }

    #[cfg(test)]
    pub fn with_ttl(meme_ttl_secs: u64, feed_ttl_secs: u64) -> Self {
        Self {
            memes: DashMap::with_capacity(1000),
            feeds: DashMap::with_capacity(50),
            meme_ttl: Duration::from_secs(meme_ttl_secs),
            feed_ttl: Duration::from_secs(feed_ttl_secs),
        }
    }

    pub fn get_meme(&self, id: &str) -> Option<Arc<Meme>> {
        let entry = self.memes.get(id)?;
        if entry.is_expired(self.meme_ttl) {
            drop(entry);
            self.memes.remove(id);
            return None;
        }
        Some(Arc::clone(&entry.data))
    }

    pub fn put_meme(&self, meme: Meme) {
        if self.memes.len() >= MEME_CACHE_MAX {
            self.evict_oldest_memes();
        }
        let id = meme.id.clone();
        self.memes.insert(id, CacheEntry::new(meme));
    }

    pub fn get_feed(&self, cursor: Option<&str>, tag: Option<&str>) -> Option<Arc<FeedPage>> {
        let key = (cursor.map(|s| s.to_string()), tag.map(|s| s.to_string()));
        let entry = self.feeds.get(&key)?;
        if entry.is_expired(self.feed_ttl) {
            drop(entry);
            self.feeds.remove(&key);
            return None;
        }
        Some(Arc::clone(&entry.data))
    }

    pub fn put_feed(&self, cursor: Option<String>, tag: Option<String>, page: FeedPage) {
        if self.feeds.len() >= FEED_CACHE_MAX {
            self.feeds.clear();
        }
        self.feeds.insert((cursor, tag), CacheEntry::new(page));
    }

    fn evict_oldest_memes(&self) {
        let evict_count = MEME_CACHE_MAX / 10;
        let mut entries: Vec<_> = self
            .memes
            .iter()
            .map(|e| (e.key().clone(), e.value().inserted_at))
            .collect();
        entries.sort_by_key(|(_, t)| *t);
        for (key, _) in entries.into_iter().take(evict_count) {
            self.memes.remove(&key);
        }
    }

    pub fn stats(&self) -> (usize, usize) {
        (self.memes.len(), self.feeds.len())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_meme(id: &str) -> Meme {
        Meme {
            id: id.to_string(),
            title: Some("Test".into()),
            format: 1,
            asset_url: "https://example.com/m.jpg".into(),
            thumbnail_url: None,
            width: None,
            height: None,
            tags: vec![],
            view_count: 0,
            reaction_count: 0,
            comment_count: 0,
            save_count: 0,
            share_count: 0,
            created_at: "2026-03-01T00:00:00Z".into(),
            author_name: None,
            author_avatar: None,
        }
    }

    #[test]
    fn put_and_get() {
        let cache = MemeCache::new();
        cache.put_meme(make_meme("01AAAA"));
        let result = cache.get_meme("01AAAA");
        assert!(result.is_some());
        assert_eq!(result.unwrap().id, "01AAAA");
    }

    #[test]
    fn cache_miss_returns_none() {
        let cache = MemeCache::new();
        assert!(cache.get_meme("nonexistent").is_none());
    }

    #[test]
    fn ttl_expiry() {
        let cache = MemeCache::with_ttl(0, 0);
        cache.put_meme(make_meme("01BBBB"));
        std::thread::sleep(Duration::from_millis(10));
        assert!(cache.get_meme("01BBBB").is_none());
    }

    #[test]
    fn feed_put_and_get() {
        let cache = MemeCache::new();
        let page = FeedPage {
            memes: vec![make_meme("01CCCC")],
            next_cursor: Some("01CCCC".into()),
        };
        cache.put_feed(None, None, page);
        let result = cache.get_feed(None, None);
        assert!(result.is_some());
        assert_eq!(result.unwrap().memes.len(), 1);
    }

    #[test]
    fn feed_ttl_expiry() {
        let cache = MemeCache::with_ttl(300, 0);
        let page = FeedPage {
            memes: vec![],
            next_cursor: None,
        };
        cache.put_feed(None, None, page);
        std::thread::sleep(Duration::from_millis(10));
        assert!(cache.get_feed(None, None).is_none());
    }

    #[test]
    fn stats_reflect_counts() {
        let cache = MemeCache::new();
        assert_eq!(cache.stats(), (0, 0));
        cache.put_meme(make_meme("01DDDD"));
        cache.put_meme(make_meme("01EEEE"));
        cache.put_feed(
            None,
            None,
            FeedPage {
                memes: vec![],
                next_cursor: None,
            },
        );
        assert_eq!(cache.stats(), (2, 1));
    }
}
