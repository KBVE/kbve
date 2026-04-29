//! Forum service — wraps the `forum.*` schema RPC + read surfaces behind
//! the SupabaseClient (service-role key). Read paths use PostgREST table
//! SELECT through the `forum` schema profile; the feed RPC routes through
//! `forum.service_fetch_feed`.
//!
//! All mutations belong in dedicated handlers; this module is read-only
//! for the SSR template path.

use serde::{Deserialize, Serialize};
use std::sync::OnceLock;

use super::supabase::{SupabaseClient, SupabaseConfig};

const SCHEMA: &str = "forum";

// Row structs hydrate from PostgREST JSON. serde needs every field to
// deserialize, but several columns are read only by future surfaces (e.g.
// upvote_count is shown on the thread page, not the feed list yet).
// Silence the dead-code lint at the struct level so we keep parity with
// the SQL row shape.

#[allow(dead_code)]
#[derive(Debug, Clone, Deserialize)]
pub struct FeedRow {
    pub id: String,
    pub title: String,
    pub body: String,
    pub author_id: String,
    pub space_id: String,
    pub thread_type: String,
    pub status: String,
    pub comment_count: i32,
    pub view_count: i64,
    pub score: i64,
    pub upvote_count: i64,
    pub downvote_count: i64,
    pub last_activity_at: Option<String>,
    pub created_at: String,
    pub nsfw: bool,
    pub pinned: bool,
    pub slug: Option<String>,
}

#[allow(dead_code)]
#[derive(Debug, Clone, Deserialize)]
pub struct ThreadRow {
    pub id: String,
    pub slug: Option<String>,
    pub title: String,
    pub body: String,
    pub author_id: String,
    pub space_id: String,
    pub thread_type: String,
    pub status: String,
    pub locked: bool,
    pub nsfw: bool,
    pub pinned: bool,
    pub comment_count: i32,
    pub score: i64,
    pub created_at: String,
    pub last_activity_at: Option<String>,
}

#[allow(dead_code)]
#[derive(Debug, Clone, Deserialize)]
pub struct SpaceRow {
    pub id: String,
    pub slug: String,
    pub name: String,
    pub description: Option<String>,
    pub status: String,
}

#[allow(dead_code)]
#[derive(Debug, Clone, Deserialize)]
pub struct CommentRow {
    pub id: String,
    pub thread_id: String,
    pub parent_comment_id: Option<String>,
    pub author_id: String,
    pub body: String,
    pub depth: i32,
    pub score: i64,
    pub status: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct FeedQuery<'a> {
    pub space_id: Option<&'a str>,
    pub tag_id: Option<i32>,
    pub thread_type: Option<&'a str>,
    pub sort: &'a str,
    pub cursor: Option<&'a str>,
    pub limit: i32,
    pub include_nsfw: bool,
}

impl<'a> Default for FeedQuery<'a> {
    fn default() -> Self {
        Self {
            space_id: None,
            tag_id: None,
            thread_type: None,
            sort: "hot",
            cursor: None,
            limit: 25,
            include_nsfw: false,
        }
    }
}

pub struct ForumService {
    client: SupabaseClient,
}

impl ForumService {
    pub fn new(config: SupabaseConfig) -> Result<Self, String> {
        Ok(Self {
            client: SupabaseClient::new(config)?,
        })
    }

    /// Call `forum.service_fetch_feed`. Maps directly to the cursor-paginated
    /// SQL RPC. Caller picks `sort` from {hot, new, top, bump} (the RPC
    /// silently falls back to `new` for unknown values).
    pub async fn fetch_feed(&self, q: &FeedQuery<'_>) -> Result<Vec<FeedRow>, String> {
        let url = self.client.config().rpc_url("service_fetch_feed");
        let headers = self.client.rpc_headers(SCHEMA)?;

        let payload = serde_json::json!({
            "p_space_id": q.space_id,
            "p_tag_id": q.tag_id,
            "p_thread_type": q.thread_type,
            "p_sort": q.sort,
            "p_cursor": q.cursor,
            "p_limit": q.limit,
            "p_include_nsfw": q.include_nsfw,
        });

        let response = self
            .client
            .client()
            .post(&url)
            .headers(headers)
            .json(&payload)
            .send()
            .await
            .map_err(|e| format!("forum.service_fetch_feed network error: {}", e))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(format!("forum.service_fetch_feed {} → {}", status, body));
        }

        response
            .json::<Vec<FeedRow>>()
            .await
            .map_err(|e| format!("forum.service_fetch_feed parse: {}", e))
    }

    /// Resolve a thread by ULID (`id`) or `slug` scoped to a space slug.
    /// Returns `Ok(None)` if no row matches.
    pub async fn get_thread_by_slug_or_id(
        &self,
        space_slug: Option<&str>,
        slug_or_id: &str,
    ) -> Result<Option<(ThreadRow, SpaceRow)>, String> {
        // Distinguish ULID (26 chars, Crockford alphabet) from a slug.
        let looks_like_ulid =
            slug_or_id.len() == 26 && slug_or_id.bytes().all(|b| b.is_ascii_alphanumeric());

        let url = format!("{}/threads", self.client.config().rest_url());
        let headers = self.client.rpc_headers(SCHEMA)?;

        let mut req = self.client.client().get(&url).headers(headers).query(&[
            ("select", "*,space:spaces(*)"),
            ("status", "neq.removed"),
            ("limit", "1"),
        ]);

        if looks_like_ulid {
            req = req.query(&[("id", format!("eq.{}", slug_or_id).as_str())]);
        } else {
            req = req.query(&[("slug", format!("eq.{}", slug_or_id).as_str())]);
            if let Some(space) = space_slug {
                req = req.query(&[("space.slug", format!("eq.{}", space).as_str())]);
            }
        }

        let response = req
            .send()
            .await
            .map_err(|e| format!("forum.threads network error: {}", e))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(format!("forum.threads {} → {}", status, body));
        }

        #[derive(Deserialize)]
        struct ThreadWithSpace {
            #[serde(flatten)]
            thread: ThreadRow,
            space: Option<SpaceRow>,
        }

        let rows: Vec<ThreadWithSpace> = response
            .json()
            .await
            .map_err(|e| format!("forum.threads parse: {}", e))?;

        Ok(rows
            .into_iter()
            .next()
            .and_then(|row| row.space.map(|space| (row.thread, space))))
    }

    /// Batch resolve `space_id → SpaceRow` via direct PostgREST SELECT.
    /// Single round-trip with `?id=in.(…)`. Empty input returns an empty
    /// map. Capped at 100 ids per call.
    pub async fn get_spaces_by_ids(
        &self,
        ids: &[String],
    ) -> Result<std::collections::HashMap<String, SpaceRow>, String> {
        if ids.is_empty() {
            return Ok(std::collections::HashMap::new());
        }
        let mut deduped: Vec<&str> = ids.iter().map(|s| s.as_str()).collect();
        deduped.sort();
        deduped.dedup();
        if deduped.len() > 100 {
            deduped.truncate(100);
        }
        let in_list = format!("({})", deduped.join(","));

        let url = format!("{}/spaces", self.client.config().rest_url());
        let headers = self.client.rpc_headers(SCHEMA)?;

        let response = self
            .client
            .client()
            .get(&url)
            .headers(headers)
            .query(&[("select", "*"), ("id", format!("in.{}", in_list).as_str())])
            .send()
            .await
            .map_err(|e| format!("forum.spaces network error: {}", e))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(format!("forum.spaces {} → {}", status, body));
        }

        let rows: Vec<SpaceRow> = response
            .json()
            .await
            .map_err(|e| format!("forum.spaces parse: {}", e))?;
        Ok(rows.into_iter().map(|s| (s.id.clone(), s)).collect())
    }

    /// Call `forum.service_create_thread`. Returns the new thread id.
    /// Caller is responsible for resolving the space slug → UUID.
    pub async fn create_thread(
        &self,
        author_id: &str,
        space_id: &str,
        title: &str,
        body: &str,
        thread_type: &str,
        slug: Option<&str>,
        tag_ids: &[i32],
    ) -> Result<String, String> {
        let url = self.client.config().rpc_url("service_create_thread");
        let headers = self.client.rpc_headers(SCHEMA)?;

        let payload = serde_json::json!({
            "p_author_id": author_id,
            "p_space_id": space_id,
            "p_title": title,
            "p_body": body,
            "p_thread_type": thread_type,
            "p_type_data": serde_json::json!({}),
            "p_tag_ids": tag_ids,
            "p_slug": slug,
            "p_nsfw": false,
            "p_locale": "en",
            "p_scheduled_at": serde_json::Value::Null,
        });

        let response = self
            .client
            .client()
            .post(&url)
            .headers(headers)
            .json(&payload)
            .send()
            .await
            .map_err(|e| format!("forum.service_create_thread network: {}", e))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(format!("forum.service_create_thread {} → {}", status, body));
        }

        let text = response
            .text()
            .await
            .map_err(|e| format!("forum.service_create_thread read: {}", e))?;
        let id: String = serde_json::from_str(&text)
            .map_err(|e| format!("forum.service_create_thread parse {}: {}", text, e))?;
        Ok(id)
    }

    /// Call `forum.service_create_comment`. Returns the new comment id.
    pub async fn create_comment(
        &self,
        author_id: &str,
        thread_id: &str,
        body: &str,
        parent_comment_id: Option<&str>,
    ) -> Result<String, String> {
        let url = self.client.config().rpc_url("service_create_comment");
        let headers = self.client.rpc_headers(SCHEMA)?;

        let payload = serde_json::json!({
            "p_author_id": author_id,
            "p_thread_id": thread_id,
            "p_body": body,
            "p_parent_comment_id": parent_comment_id,
            "p_quoted_comment_id": serde_json::Value::Null,
        });

        let response = self
            .client
            .client()
            .post(&url)
            .headers(headers)
            .json(&payload)
            .send()
            .await
            .map_err(|e| format!("forum.service_create_comment network: {}", e))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(format!(
                "forum.service_create_comment {} → {}",
                status, body
            ));
        }

        let text = response
            .text()
            .await
            .map_err(|e| format!("forum.service_create_comment read: {}", e))?;
        let id: String = serde_json::from_str(&text)
            .map_err(|e| format!("forum.service_create_comment parse {}: {}", text, e))?;
        Ok(id)
    }

    pub async fn get_space_by_slug(&self, slug: &str) -> Result<Option<SpaceRow>, String> {
        let url = format!("{}/spaces", self.client.config().rest_url());
        let headers = self.client.rpc_headers(SCHEMA)?;

        let response = self
            .client
            .client()
            .get(&url)
            .headers(headers)
            .query(&[
                ("select", "*"),
                ("slug", format!("eq.{}", slug).as_str()),
                ("status", "eq.active"),
                ("limit", "1"),
            ])
            .send()
            .await
            .map_err(|e| format!("forum.spaces network error: {}", e))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(format!("forum.spaces {} → {}", status, body));
        }

        let rows: Vec<SpaceRow> = response
            .json()
            .await
            .map_err(|e| format!("forum.spaces parse: {}", e))?;

        Ok(rows.into_iter().next())
    }

    /// Top-level comments + their immediate descendants. Ordered by
    /// (created_at ASC) so a downstream tree-builder can place each row
    /// under its parent in a single pass. Capped at 200 rows for SSR
    /// latency budget; deeper threads paginate via a future RPC.
    pub async fn get_comments_for_thread(
        &self,
        thread_id: &str,
    ) -> Result<Vec<CommentRow>, String> {
        let url = format!("{}/comments", self.client.config().rest_url());
        let headers = self.client.rpc_headers(SCHEMA)?;

        let response = self
            .client
            .client()
            .get(&url)
            .headers(headers)
            .query(&[
                (
                    "select",
                    "id,thread_id,parent_comment_id,author_id,body,depth,score,status,created_at",
                ),
                ("thread_id", format!("eq.{}", thread_id).as_str()),
                ("status", "eq.active"),
                ("order", "created_at.asc"),
                ("limit", "200"),
            ])
            .send()
            .await
            .map_err(|e| format!("forum.comments network error: {}", e))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(format!("forum.comments {} → {}", status, body));
        }

        response
            .json::<Vec<CommentRow>>()
            .await
            .map_err(|e| format!("forum.comments parse: {}", e))
    }
}

static FORUM_SERVICE: OnceLock<Option<ForumService>> = OnceLock::new();

pub fn init_forum_service() -> bool {
    FORUM_SERVICE
        .get_or_init(|| match SupabaseConfig::from_env() {
            Ok(config) => {
                if config.service_role_key.is_none() {
                    tracing::warn!("ForumService disabled: no service role key");
                    return None;
                }
                match ForumService::new(config) {
                    Ok(service) => {
                        tracing::info!("ForumService initialized");
                        Some(service)
                    }
                    Err(e) => {
                        tracing::error!("Failed to create ForumService: {}", e);
                        None
                    }
                }
            }
            Err(e) => {
                tracing::error!("Failed to load Supabase config for Forum: {}", e);
                None
            }
        })
        .is_some()
}

pub fn get_forum_service() -> Option<&'static ForumService> {
    FORUM_SERVICE.get().and_then(|s| s.as_ref())
}
