//!         [GUILD]
//?         Migration of dbrms, playerdb, ect...

use std::sync::{ Arc };

use diesel::prelude::*;

use crate::db::{ Pool };


pub async fn hazardous_boolean_username_exist(
	clean_username: String,
	pool: Arc<Pool>
) -> Result<bool, &'static str> {
	let mut conn = spellbook_pool_conn!(pool);

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