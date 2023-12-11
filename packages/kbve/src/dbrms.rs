//  *   Database Rustik Management System

use std::collections::HashMap;
use std::sync::{ Arc, OnceLock };
use std::str::FromStr;

use dashmap::DashMap;

use serde::{ Serialize, Deserialize };

use axum::{ http::{ StatusCode }, response::{ IntoResponse }, Extension, Json };

use diesel::prelude::*;
use crate::schema::{ auth, profile, users, apikey, n8n, appwrite, globals };
use crate::wh::{ TokenSchema };
use crate::db::{ Pool };
use crate::models::{ User, Profile };

//  ?   Macros

use crate::{ spellbook_pool };

#[macro_export]
macro_rules! spellbook_pool {
	($pool:expr) => {
        match $pool.get() {
            Ok(conn) => conn,
            Err(_) => return (axum::http::StatusCode::UNAUTHORIZED, axum::Json(serde_json::json!({"error": "db_error"}))).into_response(),
        }
	};
}

#[macro_export]
macro_rules! spellbook_complete {
	($spell:expr) => {
        return (axum::http::StatusCode::OK, axum::Json(serde_json::json!({"data": $spell}))).into_response()
	};
}

#[macro_export]
macro_rules! spellbook_username {
	($username:expr) => {
        match crate::harden::sanitize_username($username) {
            Ok(username) => username,
            Err(e) => return (axum::http::StatusCode::UNAUTHORIZED, axum::Json(serde_json::json!({"error": format!("{}",e)}))).into_response()
        }
	};
}

#[macro_export]
macro_rules! spellbook_uuid {
	($uuid:expr) => {
        match crate::harden::sanitize_uuid($uuid) {
            Ok(uuid) => uuid,
            Err(e) => return (axum::http::StatusCode::UNAUTHORIZED, axum::Json(serde_json::json!({"error": format!("{}",e)}))).into_response()
        }
	};
}

#[macro_export]
macro_rules! spellbook_email {
	($email:expr) => {
        match crate::harden::sanitize_email($email) {
            Ok(email) => email,
            Err(e) => return (axum::http::StatusCode::UNAUTHORIZED, axum::Json(serde_json::json!({"error": format!("{}",e)}))).into_response()
        }
	};
}

#[macro_export]
macro_rules! spellbook_sanitize_fields {
	($struct:expr, $($field:ident),+) => {
        $(
            if let Some(ref mut value) = $struct.$field {
                *value = crate::harden::sanitize_string_limit(value);
            }
        )+
	};
}

//  ?   [Routes] -> JWTs

pub async fn graceful_jwt_profile(Extension(
	privatedata,
): Extension<jsonwebtoken::TokenData<TokenSchema>>) -> impl IntoResponse {
	(StatusCode::OK, Json(serde_json::to_value(privatedata.claims).unwrap()))
}

pub async fn auth_jwt_profile(
	Extension(pool): Extension<Arc<Pool>>,
	Extension(privatedata): Extension<jsonwebtoken::TokenData<TokenSchema>>
) -> impl IntoResponse {
	let mut conn = spellbook_pool!(pool);
	let clean_username = spellbook_username!(&privatedata.claims.username);
	let clean_uuid = spellbook_uuid!(&privatedata.claims.uuid);
	let clean_email = spellbook_email!(&privatedata.claims.email);

	match
		users::table
			.inner_join(profile::table.on(profile::uuid.eq(users::id)))
			.filter(users::id.eq(clean_uuid))
			.select((users::all_columns, profile::all_columns))
			.first::<(User, Profile)>(&mut conn)
	{
		Ok((user, profile)) => {
			(
				StatusCode::OK,
				Json(
					serde_json::json!({"status": "complete",
                    "user": user,
                    "profile": profile,
                    "email": clean_email,
                    "uuid": clean_uuid,
                    "username": clean_username,
                })
				),
			).into_response()
		}
		Err(diesel::NotFound) => {
			return (
				axum::http::StatusCode::UNAUTHORIZED,
				axum::Json(serde_json::json!({"error": "username_not_found"})),
			).into_response();
		}
		Err(_) => {
			return (
				axum::http::StatusCode::UNAUTHORIZED,
				axum::Json(serde_json::json!({"error": "database_error"})),
			).into_response();
		}
	}
}

//	?	[Routes] -> Profile

#[derive(AsChangeset, Queryable, Serialize, Deserialize, Clone)]
#[table_name = "profile"]
pub struct UpdateProfileSchema {
	pub name: Option<String>,
	pub bio: Option<String>,
	pub unsplash: Option<String>,
	pub github: Option<String>,
	pub instagram: Option<String>,
	pub discord: Option<String>,
}

impl UpdateProfileSchema {
	pub fn sanitize(&mut self) {
		spellbook_sanitize_fields!(
			self,
			bio,
			name,
			unsplash,
			github,
			instagram,
			discord
		);
		self.extract_usernames();
	}

	fn extract_usernames(&mut self) {

		//	(Extract) -> [github]
		if let Some(ref mut github) = self.github {
            if let Some(username) = crate::harden::extract_github_username(github) {
                *github = username;
            } else {
                // Handle invalid GitHub input
                *github = String::new();
            }
        }
		//	(Extract) -> [instagram]
		if let Some(ref mut instagram) = self.instagram {
			if let Some(username) = crate::harden::extract_instagram_username(instagram) {
				*instagram = username;
			} else {
				*instagram = String::new();
			}
		}

		//	(Extract) -> [unsplash]
		if let Some(ref mut unsplash) = self.unsplash {
			if let Some(url) = crate::harden::extract_unsplash_photo_id(unsplash) {
				*unsplash = url;
			} else {
				*unsplash = String::new();
			}
		}
	}
}

pub async fn auth_jwt_update_profile(
	Extension(pool): Extension<Arc<Pool>>,
	Extension(privatedata): Extension<jsonwebtoken::TokenData<TokenSchema>>,
	Json(mut body): Json<UpdateProfileSchema>
) -> impl IntoResponse {
	let mut conn = spellbook_pool!(pool);

	let clean_uuid = spellbook_uuid!(&privatedata.claims.uuid);

	body.sanitize();

	match
		diesel
			::update(profile::table)
			.filter(profile::uuid.eq(clean_uuid))
			.set(body)
			.execute(&mut conn)
	{
		Ok(_) => {
			(
				StatusCode::OK,
				Json(serde_json::json!({"status": "complete"})),
			).into_response()
		}
		Err(diesel::NotFound) => {
			return (
				axum::http::StatusCode::UNAUTHORIZED,
				axum::Json(serde_json::json!({"error": "profile_not_found"})),
			).into_response();
		}

		Err(_) => {
			return (
				axum::http::StatusCode::UNAUTHORIZED,
				axum::Json(serde_json::json!({"error": "database_error"})),
			).into_response();
		}
	}
}
