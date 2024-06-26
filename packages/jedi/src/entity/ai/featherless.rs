use tokio::sync::Semaphore;
use std::error::Error;
use std::sync::{ Arc, Mutex };
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

    let response = self.client
      .post(&url)
      .header("Authorization", format!("Bearer {}", self.api_key))
      .header("Content-type", "application/json")
      .json(request_body)
      .send().await;

    match response {
      Ok(resp) => {
        if resp.status().is_success() {
          match resp.json::<FeatherlessResponseBody>().await {
            Ok(body) => Ok(body),
            Err(e) => Err(FeatherlessError::JsonError(e.to_string())),
          }
        } else {
          Err(FeatherlessError::HttpError(resp.status()))
        }
      }
      Err(e) => Err(FeatherlessError::ClientError(e.to_string())),
    }
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
