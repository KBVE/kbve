use std::sync::Arc;
use std::error::Error;
use serde::{ Deserialize, Serialize };
use tokio::time::{ sleep, Duration };
use crossbeam::queue::SegQueue;
use reqwest::{ Client, StatusCode };
use tracing::{ info, warn, error };

#[derive(Debug)]
pub enum DiscordClientError {
  ClientError(String),
  NoAvailableClients,
}

impl std::fmt::Display for DiscordClientError {
  fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
    match self {
      DiscordClientError::ClientError(msg) => write!(f, "Client Error: {}", msg),
      DiscordClientError::NoAvailableClients => write!(f, "No available clients"),
    }
  }
}

impl Error for DiscordClientError {}

#[derive(Serialize, Deserialize)]
pub struct TokenRequest {
  pub code: String,
}

#[derive(Serialize, Deserialize)]
pub struct TokenResponse {
  pub access_token: String,
}

#[derive(Clone)]
pub struct DiscordClient {
  client_pool: Arc<SegQueue<Client>>,
  rate_limit_delay: Duration,
  max_retries: usize,
}

impl DiscordClient {
  pub fn new(pool_size: usize, rate_limit_delay: Duration, max_retries: usize) -> Self {
    let client_pool = Arc::new(SegQueue::new());

    for _ in 0..pool_size {
      let client = Client::builder()
        .use_rustls_tls()
        .build()
        .expect("Failed to create Discord client");
      client_pool.push(client);
    }

    info!("Initialized DiscordClient with {} clients", pool_size);

    DiscordClient {
      client_pool,
      rate_limit_delay,
      max_retries,
    }
  }

  pub async fn fetch_access_token(
    &self,
    client_id: &str,
    client_secret: &str,
    code: &str
  ) -> Result<String, Box<dyn Error>> {
    if let Some(client) = self.client_pool.pop() {
      let params = [
        ("client_id", client_id.to_string()),
        ("client_secret", client_secret.to_string()),
        ("grant_type", "authorization_code".to_string()),
        ("code", code.to_string()),
      ];

      let mut attempts = 0;

      while attempts < self.max_retries {
        attempts += 1;

        let response = client
          .post("https://discord.com/api/oauth2/token")
          .form(&params)
          .send().await;

        match response {
          Ok(resp) => {
            if resp.status() == StatusCode::TOO_MANY_REQUESTS {
              warn!(
                "Rate limited by Discord. Retrying in {} seconds...",
                self.rate_limit_delay.as_secs()
              );
              sleep(self.rate_limit_delay).await;
            } else if resp.status().is_success() {
              let json: serde_json::Value = resp.json().await?;
              if let Some(access_token) = json.get("access_token").and_then(|v| v.as_str()) {
                self.client_pool.push(client);
                info!("Successfully fetched access token");
                return Ok(access_token.to_string());
              } else {
                self.client_pool.push(client);
                error!("No access_token found in Discord response");
                return Err(
                  Box::new(
                    DiscordClientError::ClientError("No access_token in response".to_string())
                  )
                );
              }
            } else {
              error!("Request failed with status: {}", resp.status());
              self.client_pool.push(client);
              return Err(Box::new(DiscordClientError::ClientError(resp.status().to_string())));
            }
          }
          Err(e) => {
            error!("Request failed: {}", e);
            if attempts >= self.max_retries {
              self.client_pool.push(client);
              return Err(Box::new(e));
            } else {
              warn!("Retrying request (attempt {}/{})", attempts, self.max_retries);
              sleep(self.rate_limit_delay).await;
            }
          }
        }
      }

      self.client_pool.push(client);
      error!("Max retries exceeded while fetching access token");
      Err(Box::new(DiscordClientError::ClientError("Max retries exceeded".to_string())))
    } else {
      error!("No available clients in the pool");
      Err(Box::new(DiscordClientError::NoAvailableClients))
    }
  }

  pub fn shutdown(&self) {
    info!("Shutting down DiscordClient and releasing all clients.");
    while let Some(_) = self.client_pool.pop() {}
  }
}
