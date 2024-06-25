use axum::{
    extract::Extension,
    response::Json,
    routing::get,
    Router,
};
use tokio::sync::Semaphore;
use std::sync::{Arc, Mutex};
use reqwest::{Client, StatusCode};
use serde::{Serialize, Deserialize};
use crossbeam::queue::SegQueue;

// Constants
const BASE_URL: &str = "https://api.featherless.ai/v1";

#[derive(Serialize, Deserialize, Debug)]
pub struct FeatherlessMessageContent {
    role: String,
    content: String,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct FeatherlessRequestBody {
    model: String,
    messages: Vec<FeatherlessMessageContent>,
    max_tokens: u32,
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