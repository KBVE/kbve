use reqwest::header::{ HeaderMap, HeaderValue, AUTHORIZATION, CONTENT_TYPE };
use serde_json::json;
use std::error::Error;
use crate::db::Pool;
use std::sync::{ Arc };

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
  // Example: send an email using an SMTP client or an email service API
  // This is a placeholder logic that you would replace with actual email sending code
  // For instance, you might enqueue the email to be sent, or directly send it via an SMTP server

  // Here we pretend we're using a fake email service that returns Ok or Err
  let fake_email_service_response = true; // Placeholder for actual email service call

  if fake_email_service_response {
      Ok(())
  } else {
      Err("Email service is currently unavailable".to_string())
  }
}


pub async fn resend_email(
  Extension(pool): Extension<Arc<Pool>>,
  Json(mut body): Json<RecoverUserSchema>
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
