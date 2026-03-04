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

    pub async fn fetch_feed(
        &self,
        limit: i32,
        cursor: Option<&str>,
        tag: Option<&str>,
    ) -> Result<FeedPage, String> {
        let url = self.config.rpc_url("service_fetch_feed");
        let payload = json!({
            "p_limit": limit,
            "p_cursor": cursor,
            "p_tag": tag,
        });

        let response = self
            .client
            .post(&url)
            .headers(self.config.rpc_headers())
            .json(&payload)
            .send()
            .await
            .map_err(|e| format!("Fetch feed request failed: {}", e))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(format!("Fetch feed returned {}: {}", status, body));
        }

        let memes: Vec<Meme> = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse feed response: {}", e))?;

        let next_cursor = memes.last().map(|m| m.id.clone());
        Ok(FeedPage { memes, next_cursor })
    }

    pub async fn get_meme_by_id(&self, meme_id: &str) -> Result<Option<Meme>, String> {
        let url = self.config.rpc_url("service_get_meme_by_id");
        let payload = json!({ "p_meme_id": meme_id });

        let response = self
            .client
            .post(&url)
            .headers(self.config.rpc_headers())
            .json(&payload)
            .send()
            .await
            .map_err(|e| format!("Get meme request failed: {}", e))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(format!("Get meme returned {}: {}", status, body));
        }

        let memes: Vec<Meme> = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse meme response: {}", e))?;

        Ok(memes.into_iter().next())
    }
}
