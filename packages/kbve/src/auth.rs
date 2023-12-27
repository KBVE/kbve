//!         [AUTH]
//?         Migration of all Auth related functions.


use crate::{
    spellbook_create_cookie,
};

pub async fn auth_logout() -> impl IntoResponse {
	let cookie = spellbook_create_cookie!("token", "", -1);

	let mut headers = axum::http::HeaderMap::new();

	headers.insert(
		axum::http::header::SET_COOKIE,
		cookie.to_string().parse().unwrap()
	);

	(
		StatusCode::OK,
		headers,
		Json(WizardResponse {
			data: serde_json::json!({"status": "complete"}),
			message: serde_json::json!({
	 			"token" : "logout" 
		}),
		}),
	)
}
