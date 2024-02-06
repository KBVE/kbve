use std::sync::{ Arc };

use axum::{
	http::StatusCode,
	extract::{ Extension, Json },
	response::IntoResponse,
};

use diesel::prelude::*;
use diesel::insert_into;

use chrono::Utc;

use crate::db::{ Pool };

use crate::schema::{ characters };

use crate::session::{ KbveState, TokenJWT };

use crate::response::{ GenericResponse };

use crate::{ spellbook_pool_conn, spellbook_generate_ulid_bytes };

use jedi::builder::ValidatorBuilder;

use jsonwebtoken::TokenData;

use serde::Deserialize;
use serde_json::json;

#[derive(Deserialize)]
pub struct CharacterCreationRequest {
	pub name: String,
	pub description: String,
}

pub async fn hazardous_boolean_character_exist(
	dirty_name: String,
	pool: Arc<Pool>
) -> Result<bool, &'static str> {
	let mut conn = spellbook_pool_conn!(pool);

	match
		characters::table
			.filter(characters::name.eq(dirty_name))
			.select(characters::cid)
			.first::<Vec<u8>>(&mut conn)
	{
		Ok(_) => Ok(true),
		Err(diesel::NotFound) => Ok(false),
		Err(_) => Err("db_error"),
	}
}

pub async fn hazardous_create_character_from_user(
	dirty_name: String,
	dirty_description: String,
	dirty_user_id: Vec<u8>,
	pool: Arc<Pool>
) -> Result<bool, &'static str> {
	let mut conn = spellbook_pool_conn!(pool);

	let clean_cid = spellbook_generate_ulid_bytes!();

	match
		insert_into(characters::table)
			.values((
				characters::id.eq(0), // Setting to 0, this will auto index.
				characters::cid.eq(clean_cid), // Adding the clean ulid!
				characters::userid.eq(dirty_user_id),
				characters::hp.eq(100), // Set HP to 100
				characters::mp.eq(100),
				characters::ep.eq(100),
				characters::health.eq(100),
				characters::mana.eq(100),
				characters::energy.eq(100),
				characters::armour.eq(1),
				characters::agility.eq(1),
				characters::strength.eq(1),
				characters::intelligence.eq(1),
				characters::name.eq(dirty_name),
				characters::description.eq(dirty_description),
				characters::experience.eq(0),
				characters::reputation.eq(0),
				characters::faith.eq(1),
			))
			.execute(&mut conn)
	{
		Ok(_) => Ok(true),
		Err(_) => Err("Failed to insert chracter into database"),
	}
}

pub async fn character_creation_handler(
	Extension(state): Extension<Arc<KbveState>>,
	Extension(privatedata): Extension<TokenData<TokenJWT>>,
	Json(payload): Json<CharacterCreationRequest>
) -> impl IntoResponse {

	// Establish pool connection
	let mut conn = match state.db_pool.get() {
		Ok(conn) => conn,
		Err(e) => {
			let error_response = GenericResponse::error(
				json!({}), // You might not have relevant data to include on connection failure
				json!("Failed to acquire database connection"),
				e.to_string(),
				StatusCode::INTERNAL_SERVER_ERROR // Appropriate status code for database connection errors
			);
			// Convert error_response to an impl IntoResponse and return
			return error_response.into_response();
		}
	};

	// PrivateData -> After Middleware auth -> Get UserID from the TokenJWT , that will be a vec<u8> probably.

	let validator_builder = &state.validator_builder;

	// Under Claims privatedata.claims -> Grab UserID -> Prepare hazardous query!


	//	PlaceHolder - REMOVE

	let success_response = GenericResponse::new(
		json!({"character_id": "some_character_id"}), // Example success data
		json!("Character created successfully?"),
		StatusCode::CREATED
	);
	success_response.into_response()
}
