///*	Ꮤ𐌄 𐌋Ꝋᕓ𐌄 𐌂𐌀𐌔𐌕𐌉𐌍Ᏽ 𐌔𐌐𐌄𐌋𐌋𐌔	
use std::sync::Arc;
use std::time::Instant;
use axum::{ http::StatusCode, extract::Extension, response::Json };
use serde::Serialize;
use diesel::prelude::*;
use tokio;
use tokio::task;
use crate::db::Pool;

#[derive(Serialize)]
pub struct SpeedTestResponse {
	response_time_ms: u64,
}

#[derive(Serialize)]
pub struct HealthCheckResponse {
	status: String,
}

pub async fn health_check(Extension(pool): Extension<Arc<Pool>>) -> Result<
	Json<HealthCheckResponse>,
	StatusCode
> {
	let connection_result = task::spawn_blocking(move || { pool.get() }).await;

	match connection_result {
		Ok(Ok(_conn)) => {
			Ok(
				Json(HealthCheckResponse {
					status: "OK".to_string(),
				})
			)
		}
		_ => { Err(StatusCode::SERVICE_UNAVAILABLE) }
	}
}



pub async fn speed_test(Extension(pool): Extension<Arc<Pool>>) -> Result<
	Json<SpeedTestResponse>,
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
			let elapsed_time = start_time.elapsed();
			Ok(
				Json(SpeedTestResponse {
					response_time_ms: elapsed_time.as_millis() as u64, // Response time in milliseconds
				})
			)
		}
		Err(status) => Err(status),
	}
}