use tokio::sync::Semaphore;
use std::sync::Arc;
use reqwest::Client;
use serde::{ Serialize, Deserialize };
use crossbeam::queue::SegQueue;
use tokio::time::Duration;

// Constants
const BASE_URL: &str = "https://api.featherless.ai/v1";

#[derive(Serialize, Deserialize, Debug)]
pub struct FeatherlessRequestBody {
  model: String,
  messages: Vec<FeatherlessMessageContent>,
  max_tokens: u32,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct FeatherlessResponseBody {
  choices: Vec<FeatherlessChoice>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct FeatherlessChoice {
  index: u32,
  message: FeatherlessMessageContent,
  finish_reason: Option<String>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct FeatherlessMessageContent {
  role: String,
  content: String,
}

#[derive(Clone)]
pub struct FeatherlessClient {
  client: Arc<Client>,
  api_key: String,
  rate_limit_delay: Duration,
  max_retries: usize,
  semaphore: Arc<Semaphore>,
  queue: Arc<SegQueue<String>>,
}

#[derive(Debug)]
pub enum FeatherlessError {
  ClientError(String),
  HttpError(reqwest::StatusCode),
  JsonError(String),
  NoAvailableClients,
}

impl std::fmt::Display for FeatherlessError {
  fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
    match self {
      FeatherlessError::ClientError(msg) => write!(f, "Client Error: {}", msg),
      FeatherlessError::HttpError(status) => write!(f, "HTTP Error: {}", status),
      FeatherlessError::JsonError(msg) => write!(f, "JSON Error: {}", msg),
      FeatherlessError::NoAvailableClients => write!(f, "No available clients"),
    }
  }
}

impl std::error::Error for FeatherlessError {}

impl FeatherlessClient {
  pub fn new(
    api_key: String,
    rate_limit_delay: Duration,
    max_retries: usize,
    max_concurrent_requests: usize
  ) -> Self {
    FeatherlessClient {
      client: Arc::new(
        Client::builder()
          .use_rustls_tls()
          .build()
          .expect("Failed to build client within FeatherlessClient")
      ),
      api_key,
      rate_limit_delay,
      max_retries,
      semaphore: Arc::new(Semaphore::new(max_concurrent_requests)),
      queue: Arc::new(SegQueue::new()),
    }
  }

  pub async fn send_request(
    &self,
    request_body: &FeatherlessRequestBody
  ) -> Result<FeatherlessResponseBody, FeatherlessError> {
    let _permit = self.semaphore.acquire().await.unwrap();

    let url = format!("{}/completions", BASE_URL);
    let mut attempts = 0;

    while attempts < self.max_retries {
      attempts += 1;

      let response = self.client
        .post(&url)
        .header("Authorization", format!("Bearer {}", self.api_key))
        .header("Content-type", "application/json")
        .json(request_body)
        .send()
        .await;

      match response {
        Ok(resp) => {
          if resp.status() == reqwest::StatusCode::TOO_MANY_REQUESTS {
            tracing::warn!(
              "Rate limited. Retrying in {} seconds...",
              self.rate_limit_delay.as_secs()
            );
            tokio::time::sleep(self.rate_limit_delay).await;
          } else if resp.status().is_success() {
            return match resp.json::<FeatherlessResponseBody>().await {
              Ok(body) => Ok(body),
              Err(e) => Err(FeatherlessError::JsonError(e.to_string())),
            };
          } else {
            tracing::error!("Request failed with status: {}", resp.status());
            return Err(FeatherlessError::HttpError(resp.status()));
          }
        }
        Err(e) => {
          tracing::error!("Request failed: {}", e);
          if attempts >= self.max_retries {
            return Err(FeatherlessError::ClientError(e.to_string()));
          }
          tracing::warn!(
            "Retrying request (attempt {}/{})",
            attempts,
            self.max_retries
          );
          tokio::time::sleep(self.rate_limit_delay).await;
        }
      }
    }

    Err(FeatherlessError::ClientError("Max retries exceeded".to_string()))
  }

  pub fn add_to_queue(&self, url: String) {
    self.queue.push(url);
  }

  pub fn get_queue_status(&self) -> Vec<String> {
    let mut status = Vec::new();
    let queue_clone = self.queue.clone();

    while let Some(url) = queue_clone.pop() {
      status.push(url);
    }

    for url in &status {
      self.queue.push(url.clone());
    }

    status
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn test_featherless_client_creation() {
    let client = FeatherlessClient::new(
      "test-key".to_string(),
      Duration::from_secs(5),
      3,
      10,
    );
    assert_eq!(client.api_key, "test-key");
    assert_eq!(client.rate_limit_delay, Duration::from_secs(5));
    assert_eq!(client.max_retries, 3);
  }

  #[test]
  fn test_queue_add_and_status() {
    let client = FeatherlessClient::new(
      "test-key".to_string(),
      Duration::from_secs(1),
      3,
      5,
    );

    client.add_to_queue("https://example.com/1".to_string());
    client.add_to_queue("https://example.com/2".to_string());

    let status = client.get_queue_status();
    assert_eq!(status.len(), 2);
    assert!(status.contains(&"https://example.com/1".to_string()));
    assert!(status.contains(&"https://example.com/2".to_string()));

    // Queue should still have items after get_queue_status
    let status2 = client.get_queue_status();
    assert_eq!(status2.len(), 2);
  }

  #[test]
  fn test_featherless_error_display() {
    let err = FeatherlessError::ClientError("connection refused".to_string());
    assert_eq!(err.to_string(), "Client Error: connection refused");

    let err = FeatherlessError::JsonError("invalid json".to_string());
    assert_eq!(err.to_string(), "JSON Error: invalid json");

    let err = FeatherlessError::NoAvailableClients;
    assert_eq!(err.to_string(), "No available clients");
  }

  #[test]
  fn test_featherless_client_clone() {
    let client = FeatherlessClient::new(
      "test-key".to_string(),
      Duration::from_secs(2),
      5,
      10,
    );
    let cloned = client.clone();
    assert_eq!(cloned.api_key, "test-key");
    assert_eq!(cloned.max_retries, 5);
  }
}
