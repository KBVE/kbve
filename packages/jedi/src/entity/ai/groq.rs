use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::error::Error;

// Couple options for multiflex, hmm. we could use crossbeam with sequeue.

// use std::sync::Arc;
// use crossbeam::queue::SegQueue;

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
    client: Client, 
    // client: Arc<SegQueue<Client>>, 
    api_key: String,
}

impl GroqClient {
    pub fn new(api_key: String) -> Self {
        GroqClient {
            client: Client::new(),
            api_key,
        }
    }


}