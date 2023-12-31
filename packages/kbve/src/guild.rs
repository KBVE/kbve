//			![GUILD]
//			?[Migration] of dbrms, playerdb, ect...

use std::sync::{ Arc };

use diesel::prelude::*;
use diesel::insert_into;

use chrono::Utc;

use crate::db::{ Pool };

use crate::{
	spellbook_pool_conn,
	spellbook_hazardous_boolean_exist_via_ulid,
	spellbook_hazardous_task_fetch,
	spellbook_generate_ulid_bytes,
};

// use crate::schema::{ auth, profile, users, apikey, n8n, appwrite, globals };
use crate::schema::{ auth, profile, users, apikey, n8n };


pub async fn hazardous_boolean_username_exist(
	clean_username: String,
	pool: Arc<Pool>
) -> Result<bool, &'static str> {
	let mut conn = spellbook_pool_conn!(pool);

	match
		users::table
			.filter(users::username.eq(clean_username))
			.select(users::ulid)
			.first::<Vec<u8>>(&mut conn)
	{
		Ok(_) => Ok(true),
		Err(diesel::NotFound) => Ok(false),
		Err(_) => Err("db_error"),
	}
}

spellbook_hazardous_boolean_exist_via_ulid!(
	hazardous_boolean_email_exist,
	auth,
	email,
	clean_email,
	String
);

spellbook_hazardous_boolean_exist_via_ulid!(
	hazardous_boolean_api_key_exist,
	apikey,
	keyhash,
	clean_api_key,
	String
);

spellbook_hazardous_boolean_exist_via_ulid!(
	hazardous_boolean_n8n_webhook_exist,
	n8n,
	webhook,
	clean_webhook,
	String
);

//			?[Hazardous] -> Task Fetch

spellbook_hazardous_task_fetch!(
	hazardous_task_fetch_auth_hash_by_email,
	auth,
	hash,
	email,
	String,
	String
);

spellbook_hazardous_task_fetch!(
	hazardous_task_fetch_userid_by_email,
	auth,
	userid,
	email,
	String,
	Vec<u8>
);


//			?[Hazardous] -> Create User

pub async fn hazardous_create_user(
	clean_username: String,
	pool: Arc<Pool>
) -> Result<bool, &'static str> {
	let mut conn = spellbook_pool_conn!(pool);

	let clean_ulid = spellbook_generate_ulid_bytes!();

	match
		insert_into(users::table)
			.values((
				users::ulid.eq(clean_ulid), // Adding the clean ulid!
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

pub async fn task_fetch_userid_by_username(
	username: String,
	pool: Arc<Pool>
) -> Result<Vec<u8>, &'static str> {
	let mut conn = spellbook_pool_conn!(pool);

	//let clean_username = spellbook_internal_username!(&username.clone());

	let clean_username = match crate::utility::sanitize_username(&username) {
		Ok(sanitized) => sanitized,
        Err(_) => return Err("Username failed sanitization"),
	};

	match
		users::table
			.filter(users::username.eq(clean_username))
			.select(users::ulid)
			.first::<Vec<u8>>(&mut conn)
	{
		Ok(user_id) => Ok(user_id),
		Err(_) => Err("User not found or database error"),
	}
}

pub async fn hazardous_create_auth_from_ulid(
	clean_hash_password: String,
	clean_email: String,
	clean_user_ulid: Vec<u8>,
	pool: Arc<Pool>
) -> Result<bool, &'static str> {
	let mut conn = spellbook_pool_conn!(pool);

	let clean_auth_ulid = spellbook_generate_ulid_bytes!();

	match
		insert_into(auth::table)
			.values((
				auth::ulid.eq(clean_auth_ulid),
				auth::userid.eq(clean_user_ulid),
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

pub async fn hazardous_create_profile_from_ulid(
	clean_name: String,
	clean_user_ulid: Vec<u8>,
	pool: Arc<Pool>
) -> Result<bool, &'static str> {
	let mut conn = spellbook_pool_conn!(pool);

	let clean_profile_ulid = spellbook_generate_ulid_bytes!();

	match
		insert_into(profile::table)
			.values((
				profile::ulid.eq(clean_profile_ulid),
				profile::userid.eq(clean_user_ulid),
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
