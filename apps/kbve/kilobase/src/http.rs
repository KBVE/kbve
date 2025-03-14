use crate::error::HttpError;
use reqwest::blocking::{Client, Response};
use std::time::Duration;

pub fn process_url(url: &str) -> Result<String, HttpError> {
    let client = reqwest::blocking::Client::builder()
        .use_rustls_tls()
        .timeout(Duration::from_secs(10))
        .build()?;

    let response: Response = client.get(url).send()?;

    if response.status().is_success() {
        response.text().map_err(HttpError::RequestError)
    } else {
        Err(HttpError::StatusError(response.status()))
    }
}
