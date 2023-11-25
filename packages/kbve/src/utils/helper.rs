///*	!h Ꮤ𐌄 𐌋Ꝋᕓ𐌄 𐌂𐌀𐌔𐌕𐌉𐌍Ᏽ ℜǕ𐌔Ṫ
use std::sync::Arc;
use std::time::Instant;
use axum::{ http::StatusCode, extract::Extension, response::Json };
use diesel::prelude::*;
use tokio;
use tokio::task;
use crate::dbms::wh::{WizardResponse};
use crate::db::Pool;


pub async fn root_endpoint() -> Result<Json<WizardResponse>, StatusCode> {
	Ok(
		Json(WizardResponse {
			data: "info".to_string(),
			message: "API Online".to_string(),
		})
	)
}

pub async fn health_check(Extension(pool): Extension<Arc<Pool>>) -> Result<
	Json<WizardResponse>,
	StatusCode
> {
	let connection_result = task::spawn_blocking(move || { pool.get() }).await;

	match connection_result {
		Ok(Ok(_conn)) => {
			Ok(
				Json(WizardResponse {
					data: "online".to_string(),
					message: "OK".to_string(),
				})
			)
		}
		_ => { Err(StatusCode::SERVICE_UNAVAILABLE) }
	}
}



pub async fn speed_test(Extension(pool): Extension<Arc<Pool>>) -> Result<
	Json<WizardResponse>,
	StatusCode
> {
	let start_time = Instant::now();

	// Use `block_in_place` or `spawn_blocking` for the blocking database operation
	let query_result = task::block_in_place(|| {
		let mut conn = pool.get().map_err(|_| StatusCode::SERVICE_UNAVAILABLE)?;

		// Execute a simple query
		diesel
			::sql_query("SELECT 1")
			.execute(&mut conn)
			.map_err(|_| StatusCode::SERVICE_UNAVAILABLE)
	});

	match query_result {
		Ok(_) => {
			let elapsed_time = start_time.elapsed().as_millis() as u64;
			Ok(
				Json(WizardResponse {
					data: "info".to_string(),
					message: format!("response time {}ms", elapsed_time.to_string()), // Response time in milliseconds
				})
			)
		}
		Err(status) => Err(status),
	}
}