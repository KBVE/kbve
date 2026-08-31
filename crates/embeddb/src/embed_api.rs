use crate::embed::{BoxFuture, Embedder};
use crate::{EmbedError, Result};

#[derive(Debug, Clone)]
pub struct ApiEmbedderConfig {
    pub base_url: String,
    pub api_key: Option<String>,
    pub provider: String,
    pub model: String,
    pub dim: usize,
    pub timeout: std::time::Duration,
}

impl ApiEmbedderConfig {
    pub fn new(base_url: impl Into<String>, model: impl Into<String>, dim: usize) -> Self {
        ApiEmbedderConfig {
            base_url: base_url.into(),
            api_key: None,
            provider: "api".to_string(),
            model: model.into(),
            dim,
            timeout: std::time::Duration::from_secs(30),
        }
    }

    pub fn with_api_key(mut self, key: impl Into<String>) -> Self {
        self.api_key = Some(key.into());
        self
    }

    pub fn with_provider(mut self, provider: impl Into<String>) -> Self {
        self.provider = provider.into();
        self
    }

    pub fn with_timeout(mut self, timeout: std::time::Duration) -> Self {
        self.timeout = timeout;
        self
    }
}

pub struct ApiEmbedder {
    config: ApiEmbedderConfig,
    client: reqwest::Client,
    endpoint: String,
}

impl std::fmt::Debug for ApiEmbedder {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("ApiEmbedder")
            .field("endpoint", &self.endpoint)
            .field("model", &self.config.model)
            .field("dim", &self.config.dim)
            .field(
                "api_key",
                &self.config.api_key.as_ref().map(|_| "<redacted>"),
            )
            .finish()
    }
}

impl ApiEmbedder {
    pub fn new(config: ApiEmbedderConfig) -> Result<Self> {
        let client = reqwest::Client::builder()
            .timeout(config.timeout)
            .build()
            .map_err(|e| EmbedError::Embedder(format!("building http client: {e}")))?;
        let endpoint = format!("{}/embeddings", config.base_url.trim_end_matches('/'));
        Ok(ApiEmbedder {
            config,
            client,
            endpoint,
        })
    }

    pub fn endpoint(&self) -> &str {
        &self.endpoint
    }

    async fn request(&self, texts: &[String]) -> Result<Vec<Vec<f32>>> {
        let body = serde_json::json!({ "model": self.config.model, "input": texts });
        let mut req = self.client.post(&self.endpoint).json(&body);
        if let Some(key) = &self.config.api_key {
            req = req.bearer_auth(key);
        }

        let res = req
            .send()
            .await
            .map_err(|e| EmbedError::Embedder(format!("embedding request failed: {e}")))?;

        let status = res.status();
        if !status.is_success() {
            let body = res.text().await.unwrap_or_default();
            let body = body.chars().take(500).collect::<String>();
            return Err(EmbedError::Embedder(format!(
                "embedding endpoint returned {status}: {body}"
            )));
        }

        let parsed: EmbeddingResponse = res
            .json()
            .await
            .map_err(|e| EmbedError::Embedder(format!("decoding embedding response: {e}")))?;

        let mut items = parsed.data;
        items.sort_by_key(|d| d.index);
        Ok(items.into_iter().map(|d| d.embedding).collect())
    }
}

#[derive(serde::Deserialize)]
struct EmbeddingResponse {
    data: Vec<EmbeddingItem>,
}

#[derive(serde::Deserialize)]
struct EmbeddingItem {
    #[serde(default)]
    index: usize,
    embedding: Vec<f32>,
}

impl Embedder for ApiEmbedder {
    fn provider(&self) -> &str {
        &self.config.provider
    }

    fn model(&self) -> &str {
        &self.config.model
    }

    fn dim(&self) -> usize {
        self.config.dim
    }

    fn embed<'a>(&'a self, texts: &'a [String]) -> BoxFuture<'a, Result<Vec<Vec<f32>>>> {
        Box::pin(async move {
            if texts.is_empty() {
                return Ok(Vec::new());
            }
            self.request(texts).await
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Arc;
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    use tokio::net::TcpListener;

    struct StubServer {
        base_url: String,
        requests: Arc<tokio::sync::Mutex<Vec<String>>>,
    }

    async fn stub(status: &'static str, body: &'static str) -> StubServer {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        let requests = Arc::new(tokio::sync::Mutex::new(Vec::new()));
        let sink = requests.clone();

        tokio::spawn(async move {
            loop {
                let Ok((mut socket, _)) = listener.accept().await else {
                    return;
                };
                let sink = sink.clone();
                tokio::spawn(async move {
                    let mut buf = vec![0_u8; 8192];
                    let n = socket.read(&mut buf).await.unwrap_or(0);
                    sink.lock()
                        .await
                        .push(String::from_utf8_lossy(&buf[..n]).into_owned());
                    let response = format!(
                        "HTTP/1.1 {status}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
                        body.len()
                    );
                    let _ = socket.write_all(response.as_bytes()).await;
                    let _ = socket.flush().await;
                });
            }
        });

        StubServer {
            base_url: format!("http://{addr}/v1"),
            requests,
        }
    }

    fn embedder(server: &StubServer, dim: usize) -> ApiEmbedder {
        ApiEmbedder::new(
            ApiEmbedderConfig::new(&server.base_url, "test-model", dim)
                .with_api_key("secret-key")
                .with_provider("stub"),
        )
        .unwrap()
    }

    #[tokio::test]
    async fn endpoint_is_built_without_duplicate_slashes() {
        let a = ApiEmbedder::new(ApiEmbedderConfig::new("http://h/v1", "m", 2)).unwrap();
        let b = ApiEmbedder::new(ApiEmbedderConfig::new("http://h/v1/", "m", 2)).unwrap();
        assert_eq!(a.endpoint(), "http://h/v1/embeddings");
        assert_eq!(b.endpoint(), "http://h/v1/embeddings");
    }

    #[tokio::test]
    async fn successful_response_maps_to_vectors() {
        let server = stub(
            "200 OK",
            r#"{"data":[{"index":0,"embedding":[1.0,0.0]},{"index":1,"embedding":[0.0,1.0]}]}"#,
        )
        .await;
        let e = embedder(&server, 2);

        let out = e.embed(&["a".to_string(), "b".to_string()]).await.unwrap();
        assert_eq!(out, vec![vec![1.0, 0.0], vec![0.0, 1.0]]);

        let seen = server.requests.lock().await;
        assert!(seen[0].contains("POST /v1/embeddings"));
        assert!(seen[0].contains("Bearer secret-key"));
        assert!(seen[0].contains("\"model\":\"test-model\""));
    }

    #[tokio::test]
    async fn out_of_order_response_is_reordered_by_index() {
        let server = stub(
            "200 OK",
            r#"{"data":[{"index":1,"embedding":[0.0,1.0]},{"index":0,"embedding":[1.0,0.0]}]}"#,
        )
        .await;
        let out = embedder(&server, 2)
            .embed(&["a".to_string(), "b".to_string()])
            .await
            .unwrap();
        assert_eq!(out, vec![vec![1.0, 0.0], vec![0.0, 1.0]]);
    }

    #[tokio::test]
    async fn empty_input_short_circuits_without_a_request() {
        let server = stub("200 OK", r#"{"data":[]}"#).await;
        let out = embedder(&server, 2).embed(&[]).await.unwrap();
        assert!(out.is_empty());
        assert!(server.requests.lock().await.is_empty());
    }

    #[tokio::test]
    async fn error_status_surfaces_the_body() {
        let server = stub("429 Too Many Requests", r#"{"error":"rate limited"}"#).await;
        let err = embedder(&server, 2)
            .embed(&["a".to_string()])
            .await
            .unwrap_err();
        let msg = err.to_string();
        assert!(msg.contains("429"), "{msg}");
        assert!(msg.contains("rate limited"), "{msg}");
    }

    #[tokio::test]
    async fn malformed_body_is_a_decode_error() {
        let server = stub("200 OK", "not json at all").await;
        let err = embedder(&server, 2)
            .embed(&["a".to_string()])
            .await
            .unwrap_err();
        assert!(
            err.to_string().contains("decoding embedding response"),
            "{err}"
        );
    }

    #[tokio::test]
    async fn unreachable_host_is_a_request_error() {
        let e = ApiEmbedder::new(
            ApiEmbedderConfig::new("http://127.0.0.1:1/v1", "m", 2)
                .with_timeout(std::time::Duration::from_millis(500)),
        )
        .unwrap();
        let err = e.embed(&["a".to_string()]).await.unwrap_err();
        assert!(
            err.to_string().contains("embedding request failed"),
            "{err}"
        );
    }

    #[tokio::test]
    async fn debug_output_does_not_leak_the_api_key() {
        let server = stub("200 OK", r#"{"data":[]}"#).await;
        let rendered = format!("{:?}", embedder(&server, 2));
        assert!(!rendered.contains("secret-key"), "{rendered}");
        assert!(rendered.contains("redacted"), "{rendered}");
    }

    #[tokio::test]
    async fn embedder_metadata_comes_from_config() {
        let server = stub("200 OK", r#"{"data":[]}"#).await;
        let e = embedder(&server, 7);
        assert_eq!(e.provider(), "stub");
        assert_eq!(e.model(), "test-model");
        assert_eq!(e.dim(), 7);
        assert_eq!(e.space().dim, 7);
    }
}
