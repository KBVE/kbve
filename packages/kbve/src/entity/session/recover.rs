use diesel::prelude::*;
use diesel::result::{Error as DieselError, DatabaseErrorKind};
use chrono::{Utc, Duration, NaiveDateTime};
use std::sync::Arc;
use crate::db::Pool;
use crate::models::Auth;
use crate::schema::auth;

use argon2::{ password_hash::SaltString, Argon2, PasswordHash, PasswordHasher, PasswordVerifier };
use rand_core::OsRng;

use crate::entity::session::{generate_random_token};

use crate::runes::{ PasswordRecoveryRequestSchema, WizardResponse };

use crate::entity::response::{ create_error_response, create_custom_response };


use axum::{
    async_trait,
    http::{ StatusCode, Request, header },
    extract::{ Extension, Path, State, FromRequest },
    response::{ IntoResponse, Response },
    middleware::{ self, Next },
    Json,
    BoxError,
  };

use std::str::FromStr;

use tokio::task;


/// Checks if the user can reset their password based on the expiry of their last reset token.
pub async fn can_reset_password(email: String, pool: Arc<Pool>) -> Result<bool, DieselError> {
    task::spawn_blocking(move || {
        let mut connection = pool.get().map_err(|_| DieselError::NotFound)?;
        let user = auth::table
            .filter(auth::email.eq(&email))
            .first::<Auth>(&mut connection)
            .optional()?;

        match user {
            Some(user) => {
                let one_hour_ago = Utc::now().naive_utc() - Duration::hours(1);
                Ok(user.password_reset_expiry <= one_hour_ago)
            },
            None => Err(DieselError::NotFound),
        }
    })
    .await
    .map_err(|_| DieselError::QueryBuilderError("Failed due to thread join issue".into()))?
}


/// Updates the user's password reset token and its expiry in the database.
pub async fn update_reset_token(email: String, token: String, pool: Arc<Pool>) -> Result<(), DieselError> {
    task::spawn_blocking(move || {
        let mut connection = pool.get().map_err(|_| DieselError::NotFound)?;
        let new_expiry = Utc::now().naive_utc() + Duration::hours(1);
    
        diesel::update(auth::table.filter(auth::email.eq(email)))
            .set((auth::password_reset_token.eq(token),
                  auth::password_reset_expiry.eq(new_expiry)))
            .execute(&mut connection)?; 
    
        Ok(())
    })
    .await
    .map_err(|e| DieselError::DatabaseError(DatabaseErrorKind::Unknown, Box::new(e.to_string())))?
    
}


pub async fn validate_recovery_token(email: String, token: String, pool: Arc<Pool>) -> Result<bool, DieselError> {
    if token == "0" || token.len() < 15 {
        return Ok(false);
    }
   
    task::spawn_blocking(move || {
        let mut connection = pool.get().map_err(|_| DieselError::NotFound)?;
        auth::table
            .filter(auth::email.eq(email))
            .filter(auth::password_reset_token.eq(token))
            .filter(auth::password_reset_expiry.gt(Utc::now().naive_utc()))
            .first::<Auth>(&mut connection)
            .optional()
            .map(|user| user.is_some())
            .map_err(|_| DieselError::NotFound)
    }).await
    .map_err(|e| DieselError::DatabaseError(DatabaseErrorKind::Unknown, Box::new(e.to_string())))?

}


pub async fn update_user_password(email: String, new_password: String, pool: Arc<Pool>) -> Result<(), DieselError> {
    let salt = SaltString::generate(&mut OsRng);
    let argon2 = Argon2::default();
    let password_hash = match argon2.hash_password(new_password.as_bytes(), &salt) {
        Ok(hash) => hash.to_string(),
        Err(_) => return Err(DieselError::QueryBuilderError("Failed to hash password".into())),
    };

    task::spawn_blocking(move || {
        let mut connection = pool.get().map_err(|_| DieselError::NotFound)?;
        diesel::update(auth::table.filter(auth::email.eq(email)))
            .set(auth::hash.eq(password_hash))
            .execute(&mut connection)
            .map(|_| ())
            .map_err(|_| DieselError::NotFound)
    }).await
    .map_err(|e| DieselError::DatabaseError(DatabaseErrorKind::Unknown, Box::new(e.to_string())))?

}

/// Orchestrates the password recovery process by checking if recovery is allowed and updating the token if so.
pub async fn handle_recovery_process(email: String, pool: Arc<Pool>) -> Result<String, DieselError> {
    if can_reset_password(email.clone(), pool.clone()).await? {
        let new_token = generate_random_token(32);
        update_reset_token(email.clone(), new_token.clone(), pool.clone()).await?;
        Ok(new_token)
    } else {
        Err(DieselError::NotFound)
    }
}

pub async fn process_password_recovery(
    Json(mut req): Json<PasswordRecoveryRequestSchema>,
    Extension(pool): Extension<Arc<Pool>>,
) -> impl IntoResponse {

    match req.sanitize() {
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

    let validated_email = req.email.to_string();
    let validated_token = req.token.to_string();
    let validated_password = req.password.to_string();
    let db_pool = pool.clone();

    match validate_recovery_token(validated_email.clone(), validated_token.clone(), db_pool.clone()).await {
        Ok(true) => {
            // If valid, update the password
            match update_user_password(validated_email.clone(), validated_password.clone(),  db_pool.clone()).await {
                Ok(_) => {
                    WizardResponse {
                        data: serde_json::json!({"status": "success"}),
                        message: serde_json::json!({"info": "Password updated successfully."}),
                    }.into_response()
                },
                Err(e) => {
                    create_error_response(
                        "x-kbve",
                        "email_resend_failed",
                        &format!("Failed to update password: {}", e)
                    ).into_response()
                }
            }
        },
        Ok(false) => {
            create_custom_response(
                StatusCode::FORBIDDEN,
                "x-kbve",
                "invalid_token",
                "Invalid or expired recovery token."
            ).into_response()
        },
        Err(e) => {
            create_error_response(
                "x-kbve",
                "recovery_failed",
                &format!("Password recovery could not be processed: {}", e)
            ).into_response()
        }
    }
}