use reqwest::header::{ HeaderMap, HeaderValue, AUTHORIZATION, CONTENT_TYPE };
use reqwest::Client;
use serde_json::json;
use std::error::Error;
use crate::db::Pool;
use std::sync::{ Arc };


use crate::entity::session::{ handle_recovery_process };


use crate::entity::response::{ create_error_response, create_custom_response };


use crate::runes::{ WizardResponse, RecoverUserSchema };

use axum::{
  async_trait,
  http::{ StatusCode, Request, header },
  extract::{ Extension, Path, State, FromRequest },
  response::{ IntoResponse, Response },
  middleware::{ self, Next },
  Json,
  BoxError,
};

async fn resend_confirmation_email(email: &str, pool: &Arc<Pool>) -> Result<(), String> {

  // Handle the recovery process and generate a token
    
  let recovery_token = match handle_recovery_process(email.to_string(), pool.clone()).await {
        Ok(token) => token,
        Err(_) => return Err("Password recovery failed".to_string()),
  };

  // Retrieve secret key from global settings
  let secret_key = match crate::runes::GLOBAL.get() {
      Some(global_map) => match global_map.get("resend") {
          Some(value) => value.value().clone(),
          None => return Err("missing_resend".to_string()),
      },
      None => return Err("invalid_global_map".to_string()),
    };

  let client = Client::new();
  let mut headers = HeaderMap::new();
  let auth_value = format!("Bearer {}", secret_key);
  headers.insert(AUTHORIZATION, HeaderValue::from_str(&auth_value).unwrap());
  headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));

  // Construct the JSON body for the request using hardcoded details
  let request_body = json!({
      "from": "noreply@example.com",
      "to": email,
      "subject": "Resend Confirmation",
      "html": format!("<h1>Reset Your Password</h1><p>Please use the following token to reset your password: {}</p>", recovery_token)
    });

  // Send the request
  let response = client.post("https://api.resend.com/emails")
      .headers(headers)
      .json(&request_body)
      .send()
      .await;

  // Handle the response
  match response {
      Ok(resp) if resp.status().is_success() => Ok(()),
      Ok(resp) => Err(format!("Failed to send email: {}", resp.status())),
      Err(e) => Err(format!("Error sending request: {}", e)),
  }
}


pub async fn resend_email(
  Json(mut body): Json<RecoverUserSchema>,
  Extension(pool): Extension<Arc<Pool>>
) -> impl IntoResponse {
   
    // Sanitization
    match body.sanitize() {
      Ok(_) => (),
      Err(e) => {
          return create_custom_response(
              StatusCode::BAD_REQUEST,
              "x-kbve",
              "resend_validation_failed",
              &e
          );
      }
    }

    // Captcha

    let captcha_valid = match body.captcha_verify().await {
      Ok(valid) => valid,
      Err(e) => {
          // Error during captcha verification
          return create_error_response(
              "x-kbve",
              "captcha_verification_failed",
              &e
          );
      }
    };

    if !captcha_valid {
        // Captcha validation failed
        return create_custom_response(
            StatusCode::UNAUTHORIZED,
            "x-kbve",
            "invalid_captcha",
            "Invalid captcha."
        );
    }

    match resend_confirmation_email(&body.email, &pool).await {
      Ok(_) => {
          WizardResponse {
            data: json!({"status": "success"}),
            message: json!({"info": "Email successfully resent."}),
        }.into_response()
      },
      Err(e) => {
          // Failed to send email
          create_error_response(
              "x-kbve",
              "email_resend_failed",
              &format!("Failed to resend email: {}", e)
          )
      }
  }



}
