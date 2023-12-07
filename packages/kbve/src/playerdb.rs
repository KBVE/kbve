use std::sync::Arc;

// Password Helper
use argon2::{
	password_hash::SaltString,
	Argon2,
	PasswordHash,
	PasswordHasher,
	PasswordVerifier,
};
use rand_core::OsRng;

use axum::{
	http::StatusCode,
	extract::{ Extension, Path },
	response::{ IntoResponse },
	Json,
};
use diesel::prelude::*;
use diesel::insert_into;
use serde_json::{ json, Value };
use chrono::Utc;

use crate::{
	handle_error,
	kbve_get_conn,
	simple_error,
	handle_boolean_operation_truth,
	handle_boolean_operation_fake,
	insanity,
};
use crate::harden::{
	sanitize_email,
	sanitize_username,
	validate_password,
	uuid_to_biguint,
};
use crate::db::{ Pool };
use crate::models::{ User, Profile };
use crate::wh::{
	error_casting,
	error_simple,
	WizardResponse,
	RegisterUserSchema,
	LoginUserSchema,
};
use crate::schema::{ auth, profile, users, apikey, n8n, appwrite };


//	Expanded Hazardous Task Fetch

pub async fn hazardous_task_fetch_profile_discord_by_uuid(
	clean_uuid: u64,
	pool: Arc<Pool>
) -> Result<String, &'static str> {
	let mut conn = kbve_get_conn!(pool);

	match
		profile::table
			.filter(profile::uuid.eq(clean_uuid))
			.select(profile::discord)
			.first::<String>(&mut conn)
	{
		Ok(data) => Ok(data.to_string()),
		Err(_) => Err("Faild to fetch data"),
	}
}

//	Hazardous Functions

pub async fn hazardous_create_low_level_api_key_from_uuid(
	clean_api_key: String,
	clean_uuid: u64,
	pool: Arc<Pool>
) -> Result<bool, &'static str> {
	let mut conn = kbve_get_conn!(pool);

	match
		insert_into(apikey::table)
			.values((
				apikey::uuid.eq(clean_uuid),
				apikey::permissions.eq("0"),
				apikey::keyhash.eq(clean_api_key),
				apikey::label.eq("0"),
			))
			.execute(&mut conn)
	{
		Ok(_) => Ok(true),
		Err(_) => Err("Failed to insert API key into database"),
	}
}

pub async fn hazardous_create_profile_from_uuid(
	clean_name: String,
	clean_uuid: u64,
	pool: Arc<Pool>
) -> Result<bool, &'static str> {
	let mut conn = kbve_get_conn!(pool);

	match
		insert_into(profile::table)
			.values((
				profile::uuid.eq(clean_uuid),
				profile::name.eq(clean_name),
				profile::bio.eq("default"),
				profile::unsplash.eq("0"),
				profile::github.eq("0"),
				profile::instagram.eq("0"),
				profile::discord.eq("0"),
			))
			.execute(&mut conn)
	{
		Ok(_) => Ok(true),
		Err(_) => Err("Failed to insert profile into database"),
	}
}

pub async fn hazardous_create_auth_from_uuid(
	clean_hash_password: String,
	clean_email: String,
	clean_uuid: u64,
	pool: Arc<Pool>
) -> Result<bool, &'static str> {
	let mut conn = kbve_get_conn!(pool);

	match
		insert_into(auth::table)
			.values((
				auth::uuid.eq(clean_uuid),
				auth::email.eq(clean_email),
				auth::hash.eq(clean_hash_password),
				auth::salt.eq("0"),
				auth::password_reset_token.eq("0"),
				auth::password_reset_expiry.eq(Utc::now().naive_utc()),
				auth::verification_token.eq("0"),
				auth::verification_expiry.eq(Utc::now().naive_utc()),
				auth::status.eq(0),
				auth::last_login_at.eq(Utc::now().naive_utc()),
				auth::failed_login_attempts.eq(0),
				auth::lockout_until.eq(Utc::now().naive_utc()),
				auth::two_factor_secret.eq("0"),
				auth::recovery_codes.eq("0"),
			))
			.execute(&mut conn)
	{
		Ok(_) => Ok(true),
		Err(_) => Err("Failed to create auth row for user"),
	}
}

pub async fn hazardous_create_user(
	clean_username: String,
	pool: Arc<Pool>
) -> Result<bool, &'static str> {
	let mut conn = kbve_get_conn!(pool);

	match
		insert_into(users::table)
			.values((
				users::username.eq(clean_username),
				users::role.eq(0), // Setting role to 0
				users::reputation.eq(0), // Setting reputation to 0
				users::exp.eq(0), // Setting exp to 0
				users::created_at.eq(Utc::now().naive_utc()), // Setting current UTC time
			))
			.execute(&mut conn)
	{
		Ok(_) => Ok(true),
		Err(_) => Err("Failed to insert user into database"),
	}
}


pub async fn hazardous_boolean_username_exist(
	clean_username: String,
	pool: Arc<Pool>
) -> Result<bool, &'static str> {
	let mut conn = kbve_get_conn!(pool);

	match
		users::table
			.filter(users::username.eq(clean_username))
			.select(users::id)
			.first::<u64>(&mut conn)
	{
		Ok(_) => Ok(true),
		Err(diesel::NotFound) => Ok(false),
		Err(_) => Err("Database error"),
	}
}

//	Task Fetch

pub async fn task_fetch_userid_by_username(
	username: String,
	pool: Arc<Pool>
) -> Result<u64, &'static str> {
	let mut conn = kbve_get_conn!(pool);

	let clean_username = simple_error!(
		sanitize_username(&username),
		"invalid_username"
	);

	match
		users::table
			.filter(users::username.eq(clean_username))
			.select(users::id)
			.first::<u64>(&mut conn)
	{
		Ok(user_id) => Ok(user_id),
		Err(_) => Err("User not found or database error"),
	}
}

//	API Routes GET

pub async fn api_get_process_guest_email(
	Path(email): Path<String>,
	Extension(pool): Extension<Arc<Pool>>
) -> impl IntoResponse {
	let clean_email = handle_error!(sanitize_email(&email), "invalid_email");

	let result = hazardous_boolean_email_exist(clean_email, pool).await;

	match result {
		Ok(true) => error_casting("email_already_in_use"),
		Ok(false) => error_casting("valid_guest_email"),
		Err(_) => error_casting("database_error"),
	}
}

pub async fn api_get_process_username(
	Path(username): Path<String>,
	Extension(pool): Extension<Arc<Pool>>
) -> impl IntoResponse {
	let clean_username = handle_error!(
		sanitize_username(&username),
		"invalid_username"
	);
	let mut conn = handle_error!(pool.get(), "database_error");

	match
		users::table
			.inner_join(profile::table.on(profile::uuid.eq(users::id)))
			.filter(users::username.eq(clean_username))
			.select((users::all_columns, profile::all_columns))
			.first::<(User, Profile)>(&mut conn)
	{
		Ok((user, profile)) => {
			(
				StatusCode::OK,
				Json(WizardResponse {
					data: serde_json::json!({"status": "complete"}),
					message: serde_json::json!({
						"user": user,
						"profile" : profile
				}),
				}),
			)
		}
		Err(diesel::NotFound) => error_casting("username_not_found"),
		Err(_) => error_casting("database_error"),
	}
}

//	API Routes POST

pub async fn api_post_process_login_user_handler(
	Extension(pool): Extension<Arc<Pool>>,
	Json(body): Json<LoginUserSchema>
) -> impl IntoResponse {
	let clean_email = handle_error!(
		sanitize_email(&body.email),
		"invalid_email"
	);

	match validate_password(&body.password) {
		Ok(()) => {}
		Err(_) => {
			return error_casting("invalid_password");
		}
	}

	handle_boolean_operation_truth!(
		hazardous_boolean_email_exist(clean_email.clone(), pool.clone()),
		{},
		"invalid_email"
	);

	let db_user_hash_password = handle_error!(
		hazardous_task_fetch_auth_hash_by_email(
			clean_email.clone(),
			pool.clone()
		).await,
		"invaild_email"
	);

	let operational_vaild_password = match
		PasswordHash::new(&db_user_hash_password)
	{
		Ok(process_hash) =>
			Argon2::default()
				.verify_password(&body.password.as_bytes(), &process_hash)
				.map_or(false, |_| true),
		Err(_) => false,
	};

	if !operational_vaild_password {
		return error_casting("invalid_password");
	}

	error_casting("debug_login_works")
}

pub async fn api_post_process_register_user_handler(
	Extension(pool): Extension<Arc<Pool>>,
	Json(body): Json<RegisterUserSchema>
) -> impl IntoResponse {
	//	TODO: Captcha

	let clean_email = handle_error!(
		sanitize_email(&body.email),
		"invalid_email"
	);

	handle_boolean_operation_fake!(
		hazardous_boolean_email_exist(clean_email.clone(), pool.clone()),
		{},
		"email_already_in_use"
	);

	let clean_username = handle_error!(
		sanitize_username(&body.username),
		"invalid_username"
	);

	handle_boolean_operation_fake!(
		hazardous_boolean_username_exist(clean_username.clone(), pool.clone()),
		{},
		"username_taken"
	);

	match validate_password(&body.password) {
		Ok(()) => {}
		Err(_) => {
			return error_casting("invalid_password");
		}
	}

	let salt = SaltString::generate(&mut OsRng);

	let generate_hashed_password = handle_error!(
		Argon2::default().hash_password(&body.password.as_bytes(), &salt),
		"invalid_hash"
	);

	handle_boolean_operation_truth!(
		hazardous_create_user(clean_username.clone(), pool.clone()),
		{},
		"user_register_fail"
	);

	let new_uuid = handle_error!(
		task_fetch_userid_by_username(
			clean_username.clone(),
			pool.clone()
		).await,
		"invalid_username"
	);

	handle_boolean_operation_truth!(
		hazardous_create_auth_from_uuid(
			generate_hashed_password.clone().to_string(),
			clean_email.clone(),
			new_uuid.clone(),
			pool.clone()
		),
		{},
		"auth_insert_fail"
	);

	handle_boolean_operation_truth!(
		hazardous_create_profile_from_uuid(
			clean_username.clone(),
			new_uuid.clone(),
			pool.clone()
		),
		{},
		"profile_insert_fail"
	);

	handle_boolean_operation_truth!(
		hazardous_boolean_email_exist(clean_email.clone(), pool.clone()),
		{
			return error_casting("success_account_created");
		},
		"task_account_init_fail"
	);
}

//	!	Macros

//	? Macro -> API Routes -> Get

#[macro_export]
macro_rules! api_generate_get_route_uuid {
	($func_name:ident, $task_name:ident) => {
		pub async fn $func_name(
			Path(uuid): Path<String>,
			Extension(pool): Extension<Arc<Pool>>
		) -> impl IntoResponse {
			let clean_uuid = handle_error!(uuid.parse::<u64>(), "uuid_convert_failed");
			match $task_name(clean_uuid, pool).await {
				Ok(data) => {
					(
						StatusCode::OK,
						Json(WizardResponse {
							data: serde_json::json!({"status": "complete"}),
							message: serde_json::json!({
								"fetch": data
						}),
						}),
					)
				}
				Err(_) => error_casting("database_error"),
			}
		}
	};
}

api_generate_get_route_uuid!(
	throwaway_api_get_process_github_uuid,
	hazardous_task_fetch_profile_github_by_uuid
);

api_generate_get_route_uuid!(
	throwaway_api_get_process_discord_uuid,
	hazardous_task_fetch_profile_discord_by_uuid
);

#[macro_export]
macro_rules! api_generate_get_route_fetch_username {
	($func_name:ident, $table:ident, $column:ident, $column_type:ty) => {
		pub async fn $func_name(
			Path(username): Path<String>,
			Extension(pool): Extension<Arc<Pool>>
		) -> impl IntoResponse {

			let clean_username = handle_error!(
				sanitize_username(&username),
				"invalid_username"
			);

			let mut conn = handle_error!(pool.get(), "database_error");

			match
				users::table
					.inner_join($table::table.on($table::uuid.eq(users::id)))
					.filter(users::username.eq(clean_username))
					.select($table::$column)
					.first::<$column_type>(&mut conn)
			{
				Ok(data) => {
					( 
						StatusCode::OK,
						Json(WizardResponse {
							data: serde_json::json!({"status": "complete"}),
							message: serde_json::json!({
								"fetch": data
						}),
						}),
					)
				}
				Err(diesel::NotFound) => error_casting("fetch_route_fail"),
				Err(_) => error_casting("database_error"),
			}
		}
	};
}

api_generate_get_route_fetch_username!(
	throwaway_api_get_process_appwrite_projectid_from_username,
	appwrite,
	appwrite_projectid,
	String
);

api_generate_get_route_fetch_username!(
	throwaway_api_get_process_n8n_webhook_from_username,
	n8n,
	webhook,
	String
);

//	?	Macro -> Hazardous_Booleans

#[macro_export]
macro_rules! hazardous_boolean_exist {
	(
		$func_name:ident,
		$table:ident,
		$column:ident,
		$param:ident,
		$param_type:ty
	) => {
        pub async fn $func_name(
            $param: $param_type,
            pool: Arc<Pool>
        ) -> Result<bool, &'static str> {
            let mut conn = kbve_get_conn!(pool);

            match $table::table
                .filter($table::$column.eq($param))
                .select($table::uuid)
                .first::<u64>(&mut conn)
            {
                Ok(_) => Ok(true),
                Err(diesel::NotFound) => Ok(false),
                Err(_) => Err("Database error"),
            }
        }
	};
}

hazardous_boolean_exist!(
	hazardous_boolean_api_key_exist,
	apikey,
	keyhash,
	clean_api_key,
	String
);

hazardous_boolean_exist!(
	hazardous_boolean_email_exist,
	auth,
	email,
	clean_email,
	String
);

hazardous_boolean_exist!(
	hazardous_boolean_n8n_webhook_exist,
	n8n,
	webhook,
	clean_webhook,
	String
);


#[macro_export]
macro_rules! hazardous_task_fetch {
	(
		$func_name:ident,
		$table:ident,
		$column:ident,
		$param:ident,
		$param_type:ty,
		$return_type:ty
	) => {
		pub async fn $func_name(
			$param: $param_type,
			pool: Arc<Pool>
		) -> Result<$return_type, &'static str> {
			let mut conn = kbve_get_conn!(pool);

			match $table::table
				.filter($table::$param.eq($param))
				.select($table::$column)
				.first::<$return_type>(&mut conn)
				{
					Ok(data) => Ok(data),
					Err(diesel::NotFound) => Err("Database error"),
					Err(_) => Err("Database error"),
				}

		}
	};
}

hazardous_task_fetch!(
	hazardous_task_fetch_n8n_webhook_by_uuid,
	n8n,
	webhook,
	uuid,
	u64,
	String
);

hazardous_task_fetch!(
	hazardous_task_fetch_profile_github_by_uuid,
	profile,
	github,
	uuid,
	u64,
	String
);

hazardous_task_fetch!(
	hazardous_task_fetch_auth_hash_by_email,
	auth,
	hash,
	email,
	String,
	String
);



//	?	Macro -> API -> POST ROUTES

// #[macro_export]
// macro_rules! api_generate_post_route {
// 	(
// 		$func_name: ident,
// 		$schema_name: ty,
// 	) => {
// 		pub async fn $func_name(
// 			Extension(pool): Extension<Arc<Pool>>,
// 			Json(body): Json<$schema_name>
// 		) -> impl IntoResponse {

// 		}
// 	}
// }
