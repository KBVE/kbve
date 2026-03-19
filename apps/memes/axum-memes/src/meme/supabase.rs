use reqwest::Client;
use reqwest::header::{HeaderMap, HeaderValue};
use serde_json::json;
use std::time::Duration;

use super::model::{FeedPage, Meme};

#[derive(Clone)]
pub struct MemeSupabaseConfig {
    pub url: String,
    pub service_role_key: String,
}

impl MemeSupabaseConfig {
    pub fn from_env() -> Result<Self, String> {
        let url = std::env::var("SUPABASE_URL").map_err(|_| "SUPABASE_URL not set")?;
        let service_role_key = std::env::var("SUPABASE_SERVICE_ROLE_KEY")
            .map_err(|_| "SUPABASE_SERVICE_ROLE_KEY not set")?;
        Ok(Self {
            url,
            service_role_key,
        })
    }

    fn rpc_url(&self, function_name: &str) -> String {
        format!("{}/rest/v1/rpc/{}", self.url, function_name)
    }

    fn rpc_headers(&self) -> HeaderMap {
        let mut headers = HeaderMap::new();
        headers.insert(
            "apikey",
            HeaderValue::from_str(&self.service_role_key).unwrap(),
        );
        headers.insert(
            "Authorization",
            HeaderValue::from_str(&format!("Bearer {}", self.service_role_key)).unwrap(),
        );
        headers.insert("Content-Type", HeaderValue::from_static("application/json"));
        headers.insert("Content-Profile", HeaderValue::from_static("meme"));
        headers.insert("Accept-Profile", HeaderValue::from_static("meme"));
        headers
    }
}

#[derive(Clone)]
pub struct MemeSupabaseClient {
    client: Client,
    config: MemeSupabaseConfig,
}

impl MemeSupabaseClient {
    pub fn new(config: MemeSupabaseConfig) -> Result<Self, String> {
        let client = Client::builder()
            .timeout(Duration::from_secs(10))
            .build()
            .map_err(|e| format!("Failed to create HTTP client: {}", e))?;
        Ok(Self { client, config })
    }

    /// Call a PostgREST RPC function with service_role auth.
    async fn call_rpc(
        &self,
        function_name: &str,
        payload: serde_json::Value,
    ) -> Result<serde_json::Value, String> {
        let url = self.config.rpc_url(function_name);

        let response = self
            .client
            .post(&url)
            .headers(self.config.rpc_headers())
            .json(&payload)
            .send()
            .await
            .map_err(|e| format!("{function_name} request failed: {e}"))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(format!("{function_name} returned {status}: {body}"));
        }

        response
            .json()
            .await
            .map_err(|e| format!("{function_name} parse failed: {e}"))
    }

    // ── Feed (anonymous) ─────────────────────────────────────────────

    pub async fn fetch_feed(
        &self,
        limit: i32,
        cursor: Option<&str>,
        tag: Option<&str>,
    ) -> Result<FeedPage, String> {
        let value = self
            .call_rpc(
                "service_fetch_feed",
                json!({ "p_limit": limit, "p_cursor": cursor, "p_tag": tag }),
            )
            .await?;

        let memes: Vec<Meme> =
            serde_json::from_value(value).map_err(|e| format!("Failed to parse feed: {e}"))?;
        let next_cursor = memes.last().map(|m| m.id.clone());
        Ok(FeedPage { memes, next_cursor })
    }

    pub async fn get_meme_by_id(&self, meme_id: &str) -> Result<Option<Meme>, String> {
        let value = self
            .call_rpc("service_get_meme_by_id", json!({ "p_meme_id": meme_id }))
            .await?;

        let memes: Vec<Meme> =
            serde_json::from_value(value).map_err(|e| format!("Failed to parse meme: {e}"))?;
        Ok(memes.into_iter().next())
    }

    // ── View / Share tracking (anonymous) ────────────────────────────

    pub async fn track_view(&self, meme_id: &str) -> Result<(), String> {
        self.call_rpc("service_increment_view", json!({ "p_meme_id": meme_id }))
            .await
            .map(|_| ())
    }

    pub async fn track_share(&self, meme_id: &str) -> Result<(), String> {
        self.call_rpc("service_increment_share", json!({ "p_meme_id": meme_id }))
            .await
            .map(|_| ())
    }

    // ── Reactions (user-scoped) ──────────────────────────────────────

    pub async fn react(
        &self,
        user_id: &str,
        meme_id: &str,
        reaction: i32,
    ) -> Result<serde_json::Value, String> {
        self.call_rpc(
            "service_react",
            json!({ "p_user_id": user_id, "p_meme_id": meme_id, "p_reaction": reaction }),
        )
        .await
    }

    pub async fn unreact(&self, user_id: &str, meme_id: &str) -> Result<serde_json::Value, String> {
        self.call_rpc(
            "service_unreact",
            json!({ "p_user_id": user_id, "p_meme_id": meme_id }),
        )
        .await
    }

    pub async fn get_user_reactions(
        &self,
        user_id: &str,
        meme_ids: &[String],
    ) -> Result<serde_json::Value, String> {
        self.call_rpc(
            "service_get_user_reactions",
            json!({ "p_user_id": user_id, "p_meme_ids": meme_ids }),
        )
        .await
    }

    // ── Saves (user-scoped) ──────────────────────────────────────────

    pub async fn save_meme(
        &self,
        user_id: &str,
        meme_id: &str,
    ) -> Result<serde_json::Value, String> {
        self.call_rpc(
            "service_save_meme",
            json!({ "p_user_id": user_id, "p_meme_id": meme_id }),
        )
        .await
    }

    pub async fn unsave_meme(
        &self,
        user_id: &str,
        meme_id: &str,
    ) -> Result<serde_json::Value, String> {
        self.call_rpc(
            "service_unsave_meme",
            json!({ "p_user_id": user_id, "p_meme_id": meme_id }),
        )
        .await
    }

    pub async fn get_user_saves(
        &self,
        user_id: &str,
        meme_ids: &[String],
    ) -> Result<serde_json::Value, String> {
        self.call_rpc(
            "service_get_user_saves",
            json!({ "p_user_id": user_id, "p_meme_ids": meme_ids }),
        )
        .await
    }

    // ── Comments ─────────────────────────────────────────────────────

    pub async fn fetch_comments(
        &self,
        meme_id: &str,
        limit: i32,
        cursor: Option<&str>,
    ) -> Result<serde_json::Value, String> {
        self.call_rpc(
            "service_fetch_comments",
            json!({ "p_meme_id": meme_id, "p_limit": limit, "p_cursor": cursor }),
        )
        .await
    }

    pub async fn fetch_replies(
        &self,
        parent_id: &str,
        limit: i32,
        cursor: Option<&str>,
    ) -> Result<serde_json::Value, String> {
        self.call_rpc(
            "service_fetch_replies",
            json!({ "p_parent_id": parent_id, "p_limit": limit, "p_cursor": cursor }),
        )
        .await
    }

    pub async fn create_comment(
        &self,
        user_id: &str,
        meme_id: &str,
        body: &str,
        parent_id: Option<&str>,
    ) -> Result<serde_json::Value, String> {
        self.call_rpc(
            "service_create_comment",
            json!({
                "p_user_id": user_id,
                "p_meme_id": meme_id,
                "p_body": body,
                "p_parent_id": parent_id,
            }),
        )
        .await
    }

    pub async fn delete_comment(
        &self,
        user_id: &str,
        comment_id: &str,
    ) -> Result<serde_json::Value, String> {
        self.call_rpc(
            "service_delete_comment",
            json!({ "p_user_id": user_id, "p_comment_id": comment_id }),
        )
        .await
    }

    // ── Profile ──────────────────────────────────────────────────────

    pub async fn get_profile(&self, user_id: &str) -> Result<serde_json::Value, String> {
        self.call_rpc("service_get_profile", json!({ "p_user_id": user_id }))
            .await
    }

    pub async fn upsert_profile(
        &self,
        user_id: &str,
        display_name: Option<&str>,
        avatar_url: Option<&str>,
        bio: Option<&str>,
    ) -> Result<(), String> {
        self.call_rpc(
            "service_upsert_profile",
            json!({
                "p_user_id": user_id,
                "p_display_name": display_name,
                "p_avatar_url": avatar_url,
                "p_bio": bio,
            }),
        )
        .await
        .map(|_| ())
    }

    pub async fn get_user_memes(
        &self,
        user_id: &str,
        limit: i32,
        cursor: Option<&str>,
    ) -> Result<serde_json::Value, String> {
        self.call_rpc(
            "service_get_user_memes",
            json!({ "p_user_id": user_id, "p_limit": limit, "p_cursor": cursor }),
        )
        .await
    }

    // ── Follow ───────────────────────────────────────────────────────

    pub async fn follow(
        &self,
        follower_id: &str,
        following_id: &str,
    ) -> Result<serde_json::Value, String> {
        self.call_rpc(
            "service_follow",
            json!({ "p_follower_id": follower_id, "p_following_id": following_id }),
        )
        .await
    }

    pub async fn unfollow(
        &self,
        follower_id: &str,
        following_id: &str,
    ) -> Result<serde_json::Value, String> {
        self.call_rpc(
            "service_unfollow",
            json!({ "p_follower_id": follower_id, "p_following_id": following_id }),
        )
        .await
    }

    // ── Reports ──────────────────────────────────────────────────────

    pub async fn report_meme(
        &self,
        reporter_id: &str,
        meme_id: &str,
        reason: i32,
        detail: Option<&str>,
    ) -> Result<serde_json::Value, String> {
        self.call_rpc(
            "service_report_meme",
            json!({
                "p_reporter_id": reporter_id,
                "p_meme_id": meme_id,
                "p_reason": reason,
                "p_detail": detail,
            }),
        )
        .await
    }
}
