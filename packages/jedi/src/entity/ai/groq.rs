use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::error::Error;
use std::sync::Arc;
use crossbeam::queue::SegQueue;

// Vars

const BASE_URL: &str = "https://api.groq.com/";

// Structs

#[derive(Serialize, Deserialize, Debug)]
pub struct GroqRquest {
    pub query: String,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct GroqResponse {
    pub result: String,
}

#[derive(Clone)]
pub struct GroqClient {
    client: Arc<SegQueue<Client>>, 
    api_key: String,
}

impl GroqClient {
    pub fn new(api_key: String, num_clients: usize) -> Self {
        let queue = Arc::new(SegQueue::new());
        for _ in 0..num_clients {
            queue.push(Client::new());
        }
        GroqClient {
            client: queue, 
            api_key,
        }
    }

    // Test case should be triggered by the the Python -> Atlas, making sure that the pydantic can verify the test result.

    pub async fn test_request(&self) -> Result<String, Box<&dyn Error>> {
        if let Some(client) = self.client.pop() {
            let url = format!("{}/openai/v1/chat/completions", BASE_URL);
            
            // TODO: Finish Response for Groq
            let response = client
                .post(&url)
                .send()
                .await?;
            
            self.client.push(client);

            let text = response.text().await?;
            Ok(text)
        }
        else {
            // TODO: Error Case
            Err(Box::new())
        }
    }


}