use reqwest::header::{ HeaderMap, HeaderValue, AUTHORIZATION, CONTENT_TYPE };
use serde_json::json;
use std::error::Error;
use crate::db::Pool;
use std::sync::{ Arc };

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

pub async fn resend_email(
  Extension(pool): Extension<Arc<Pool>>,
  Json(mut body): Json<RecoverUserSchema>
) -> impl IntoResponse {


    // Sanitize?

}
