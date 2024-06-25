use tokio::sync::Semaphore;
use std::error::Error;
use std::sync::{ Arc, Mutex };
use reqwest::{ Client, StatusCode };
use serde::{ Serialize, Deserialize };
use crossbeam::queue::SegQueue;
use tokio::time::{sleep, Duration};


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
    NoAvailableClients,
}

impl std::fmt::Display for FeatherlessError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            FeatherlessError::ClientError(msg) => write!(f, "Client Error: {}", msg),
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
  ) -> Result<FeatherlessResponseBody, reqwest::Error> {
    let _permit = self.semaphore.acquire().await.unwrap();

    let response = self.client
      .post("https://api.featherless.ai/v1/completions")
      .header("Authorization", format!("Bearer {}", self.api_key))
      .header("Content-type", "application/json")
      .json(request_body)
      .send().await?;

    let response_body = response.json::<FeatherlessResponseBody>().await?;
    Ok(response_body)
  }

  pub fn add_to_queue(&self, url: String) {
    self.queue.push(url);
  }

  pub fn get_queue_status(&self) -> Vec<String> {
    self.queue
      .iter()
      .map(|url| url.clone())
      .collect()
  }
}
