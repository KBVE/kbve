//			![GUILD]
//			?[Migration] of dbrms, playerdb, ect...

use std::sync::{ Arc };

use diesel::prelude::*;

use chrono::Utc;

use crate::db::{ Pool };

use crate::{
	spellbook_pool_conn,
	spellbook_hazardous_boolean_exist_via_ulid,
	spellbook_generate_ulid_bytes,
};

use crate::schema::{ auth, profile, users, apikey, n8n, appwrite, globals };

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
				users::ulid.eq(clean_ulid) // Adding the clean ulid!
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
