use reqwest::{Client, StatusCode};
use serde::{Deserialize, Serialize};
use std::error::Error;
use std::sync::Arc;
use crossbeam::queue::SegQueue;
use tracing::{info, warn, error};
use tokio::time::{sleep, Duration};

// Vars

const BASE_URL: &str = "https://api.groq.com/";

// Structs

#[derive(Serialize, Deserialize, Debug)]
pub struct GroqMessage {
    pub role: String,
    pub content: String,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct GroqRequestBody {
    pub messages: Vec<GroqMessage>,
    pub model: String,
}


#[derive(Serialize, Deserialize, Debug)]
pub struct GroqResponse {
    pub result: String,
}


#[derive(Debug)]
pub enum GroqError {
    ClientError(String),
    NoAvailableClients,
}

impl std::fmt::Display for GroqError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            GroqError::ClientError(msg) => write!(f, "Client Error: {}", msg),
            GroqError::NoAvailableClients => write!(f, "No available clients"),
        }
    }
}

impl Error for GroqError {}


#[derive(Clone)]
pub struct GroqClient {
    client: Arc<SegQueue<Client>>, 
    api_key: String,
    rate_limit_delay: Duration,
    max_retries: usize,
}

impl GroqClient {
    pub fn new(api_key: String, num_clients: usize, rate_limit_delay: Duration, max_retries: usize) -> Self {
        let queue = Arc::new(SegQueue::new());
        for _ in 0..num_clients {
            queue.push(Client::builder()
            .use_rustls_tls()
            .build()
            .expect("Failed to build client within GroqClient"));
        }
        GroqClient {
            client: queue, 
            api_key,
            rate_limit_delay,
            max_retries,
        }
    }


    pub async fn test_request(&self, body: &GroqRequestBody) -> Result<String, Box<dyn Error>> {
        if let Some(client) = self.client.pop() {
            let url = format!("{}/openai/v1/chat/completions", BASE_URL);
            let mut attempts = 0;

            while attempts < self.max_retries {
                attempts += 1;
                let response = client
                    .post(&url)
                    .header("Authorization", format!("Bearer {}", self.api_key))
                    .header("Content-Type", "application/json")
                    .json(body)
                    .send()
                    .await;

                match response {
                    Ok(resp) => {
                        if resp.status() == StatusCode::TOO_MANY_REQUESTS {
                            warn!("Rate limited. Retrying in {} seconds...", self.rate_limit_delay.as_secs());
                            sleep(self.rate_limit_delay).await;
                        } else if resp.status().is_success() {
                            let text = resp.text().await?;
                            self.client.push(client);
                            return Ok(text);
                        } else {
                            error!("Request failed with status: {}", resp.status());
                            return Err(Box::new(GroqError::ClientError(resp.status().to_string())));
                        }
                    }
                    Err(e) => {
                        error!("Request failed: {}", e);
                        if attempts >= self.max_retries {
                            self.client.push(client);
                            return Err(Box::new(e));
                        } else {
                            warn!("Retrying request (attempt {}/{})", attempts, self.max_retries);
                            sleep(self.rate_limit_delay).await;
                        }
                    }
                }
            }

            self.client.push(client);
            Err(Box::new(GroqError::ClientError("Max retries exceeded".to_string())))
        } else {
            Err(Box::new(GroqError::NoAvailableClients))
        }
    }


    pub fn shutdown(&self) {
        info!("Shutting down GroqClient and releasing all clients.");
        while let Some(_) = self.client.pop() {}
    }


}