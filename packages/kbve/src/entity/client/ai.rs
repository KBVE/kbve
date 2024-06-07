use std::sync::Arc;
use tokio::task;
use tokio::time::Duration;
use tracing::{info, warn, error};
use jedi::groq::{GroqClient, GroqRequestBody, GroqMessage};

pub async fn call_groq(api_key: String) {
    // let rate_limit_delay = Duration::from_millis(1000); // millis for ms.
    let rate_limit_delay = Duration::from_secs(1);
    let max_retries = 3;
    let client_pool = 5;

   // let client = Arc::new(GroqClient::new(api_key, client_pool, rate_limit_delay, max_retries));
    let client = Arc::new(GroqClient::new(api_key, client_pool));
} 