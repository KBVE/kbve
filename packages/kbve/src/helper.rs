///*	!h Ꮤ𐌄 𐌋Ꝋᕓ𐌄 𐌂𐌀𐌔𐌕𐌉𐌍Ᏽ ℜǕ𐌔Ṫ
use std::sync::Arc;
use tokio::time::Instant;
use axum::{ http::StatusCode, extract::Extension, response::Json };
use diesel::prelude::*;
use tokio;
use tokio::task;
use crate::wh::{WizardResponse};
use crate::db::Pool;



pub async fn root_endpoint() -> Result<Json<WizardResponse>, StatusCode> {
	Ok(
		Json(WizardResponse {
			data: serde_json::json!({"status": "online"}),
			message: serde_json::json!({"root": "endpoints_das_mai"}),
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
					data: serde_json::json!({"status": "online"}),
					message: serde_json::json!({"health": "ok"}),
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
					data: serde_json::json!({"status": "time"}),
					message: serde_json::json!({"time": elapsed_time.to_string()}),
				})
			)
		}
		Err(status) => Err(status),
	}
}
