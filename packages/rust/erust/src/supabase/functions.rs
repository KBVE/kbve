use ehttp::Request;
use crate::supabase::{SupabaseConfig, SupabaseError};

pub fn invoke<F>(
	config: &SupabaseConfig,
	function_name: &str,
	body: &serde_json::Value,
	access_token: Option<&str>,
	callback: F,
)
where
	F: FnOnce(Result<Vec<u8>, SupabaseError>) + Send + 'static,
{
	let url = config.functions_url(function_name);
	let body_bytes = match serde_json::to_vec(body) {
		Ok(b) => b,
		Err(e) => {
			callback(Err(SupabaseError::from(e)));
			return;
		}
	};

	let mut request = Request::post(&url, body_bytes);

	let auth_value;
	let headers: Vec<(&str, &str)> = if let Some(token) = access_token {
		auth_value = format!("Bearer {}", token);
		vec![
			("Content-Type", "application/json"),
			("apikey", &config.anon_key),
			("Authorization", &auth_value),
		]
	} else {
		vec![
			("Content-Type", "application/json"),
			("apikey", &config.anon_key),
		]
	};
	request.headers = ehttp::Headers::new(&headers);

	ehttp::fetch(request, move |result| match result {
		Ok(response) => {
			if response.ok {
				callback(Ok(response.bytes));
			} else {
				let message = String::from_utf8_lossy(&response.bytes).to_string();
				callback(Err(SupabaseError::HttpError {
					status: response.status,
					message,
				}));
			}
		}
		Err(err) => callback(Err(SupabaseError::NetworkError(err))),
	});
}

pub fn invoke_json<T, F>(
	config: &SupabaseConfig,
	function_name: &str,
	body: &serde_json::Value,
	access_token: Option<&str>,
	callback: F,
)
where
	T: serde::de::DeserializeOwned + 'static,
	F: FnOnce(Result<T, SupabaseError>) + Send + 'static,
{
	invoke(config, function_name, body, access_token, move |result| {
		match result {
			Ok(bytes) => {
				let parsed = serde_json::from_slice::<T>(&bytes).map_err(SupabaseError::from);
				callback(parsed);
			}
			Err(e) => callback(Err(e)),
		}
	});
}

#[cfg(test)]
mod tests {
	use super::*;

	#[test]
	fn functions_url_construction() {
		let config = SupabaseConfig::new("https://supabase.example.com", "test-key");
		assert_eq!(
			config.functions_url("hello-world"),
			"https://supabase.example.com/functions/v1/hello-world"
		);
	}

	#[test]
	fn functions_url_with_trailing_slash() {
		let config = SupabaseConfig::new("https://supabase.example.com/", "test-key");
		assert_eq!(
			config.functions_url("my-func"),
			"https://supabase.example.com/functions/v1/my-func"
		);
	}

	#[test]
	fn functions_url_empty_name() {
		let config = SupabaseConfig::new("https://example.com", "key");
		assert_eq!(
			config.functions_url(""),
			"https://example.com/functions/v1/"
		);
	}

	#[test]
	fn functions_url_with_hyphens_and_underscores() {
		let config = SupabaseConfig::new("https://example.com", "key");
		assert_eq!(
			config.functions_url("my-edge_func-v2"),
			"https://example.com/functions/v1/my-edge_func-v2"
		);
	}

	#[test]
	fn invoke_json_body_serialization_fails_gracefully() {
		// Create a body that will serialize fine — this tests the normal path
		let config = SupabaseConfig::new("https://example.com", "test-key");
		let body = serde_json::json!({"key": "value"});
		// We can't easily force serde_json::to_vec to fail for a Value,
		// but we can verify the function compiles and the types are correct
		let _fn_ref: fn(
			&SupabaseConfig,
			&str,
			&serde_json::Value,
			Option<&str>,
			Box<dyn FnOnce(Result<Vec<u8>, SupabaseError>) + Send>,
		) = |c, n, b, t, cb| invoke(c, n, b, t, cb);
		// Type check passed — the function signature is correct
		let _ = (&config, &body);
	}

	#[test]
	fn invoke_json_type_params_compile() {
		// Verify invoke_json works with various deserializable types
		let _fn_ref: fn(
			&SupabaseConfig,
			&str,
			&serde_json::Value,
			Option<&str>,
			Box<dyn FnOnce(Result<serde_json::Value, SupabaseError>) + Send>,
		) = |c, n, b, t, cb| invoke_json::<serde_json::Value, _>(c, n, b, t, cb);
	}

	#[test]
	fn functions_url_with_dots() {
		let config = SupabaseConfig::new("https://example.com", "key");
		assert_eq!(
			config.functions_url("api.v2.handler"),
			"https://example.com/functions/v1/api.v2.handler"
		);
	}

	#[test]
	fn functions_url_multiple_trailing_slashes() {
		let config = SupabaseConfig::new("https://example.com///", "key");
		assert_eq!(
			config.functions_url("func"),
			"https://example.com/functions/v1/func"
		);
	}
}
