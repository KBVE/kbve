//      [hCaptcha]

use reqwest::{ Client };
use serde::{ Deserialize };
use std::collections::HashMap;

// A struct to deserialize the hCaptcha response
#[derive(Deserialize)]
struct HCaptchaResponse {
	success: bool,
	challenge_ts: Option<String>, // Timestamp of the challenge
	hostname: Option<String>, // Hostname of the site
	credit: Option<bool>, // Deprecated field
	#[serde(rename = "error-codes")]
	error_codes: Option<Vec<String>>, // Error codes, if any
}

pub async fn verify_token_via_hcaptcha(
	captcha_token: &str
) -> Result<bool, Box<dyn std::error::Error>> {
	// Check if the captcha token is valid
	if captcha_token.is_empty() {
		return Err("Captcha token is empty".into());
	}

	// Retrieve the secret key from GLOBAL Map
	let secret_key = match crate::runes::GLOBAL.get() {
		Some(global_map) =>
			match global_map.get("hcaptcha") {
				Some(value) => value.value().clone(),
				None => {
					return Err("missing_captcha".into());
				}
			}
		None => {
			return Err("invalid_global_map".into());
		}
	};

	// Set up the HTTP client
	let client = Client::new();
	let mut params = HashMap::new();
	params.insert("response", captcha_token);
	params.insert("secret", secret_key.as_str());

	// Send the request to hCaptcha
	let res = client
		.post("https://api.hcaptcha.com/siteverify")
		.form(&params)
		.send().await
		.map_err(|e| Box::new(e) as Box<dyn std::error::Error>)?;

	// Check the response status
	if res.status().is_success() {
		let captcha_response: HCaptchaResponse = res
			.json().await
			.map_err(|e| Box::new(e) as Box<dyn std::error::Error>)?;
		if captcha_response.success {
			Ok(true)
		} else {
			let error_message = format!(
				"Captcha verification failed: {:?}",
				captcha_response.error_codes
			);
			Err(error_message.into())
		}
	} else {
		// Handle non-successful response statuses
		Err("Failed to verify captcha".into())
	}
}
